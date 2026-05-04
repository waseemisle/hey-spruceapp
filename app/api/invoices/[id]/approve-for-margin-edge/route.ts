/**
 * POST /api/invoices/[id]/approve-for-margin-edge
 *
 * Admin-triggered "Approve & Forward to Margin Edge". Per product spec:
 * the customer-facing invoice email is one action; pushing to the
 * client's Margin Edge AP inbox for processing is a separate, explicit
 * approval. This route is that approval.
 *
 * Steps:
 *   1. Verify the requester is an admin
 *   2. Look up the invoice + parent work order + location + company
 *   3. Confirm the company has marginEdgeEnabled
 *   4. Generate the invoice PDF server-side
 *   5. Forward to the per-location marginEdgeEmail (or the company-level
 *      default if location override is blank)
 *   6. Persist `status: 'approved'` + audit fields on the invoice doc
 *
 * Idempotency: lib/margin-edge.ts checks invoices/{id}.marginEdgeSentAt
 * and short-circuits — re-approval is a no-op for the email send (but
 * the status / audit fields still update so the admin sees the latest
 * approver / timestamp).
 *
 * Failure: PDF generation or send errors land in
 * invoices/{id}.marginEdgeError + the emailLogs collection. The HTTP
 * response carries the failure detail so the admin UI can toast it.
 */
import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';
import { isUserAdmin } from '@/lib/api-verify-firebase';
import { sendInvoiceToMarginEdge, resolveMarginEdgeTarget } from '@/lib/margin-edge';
import { generateInvoicePDF, type InvoiceData } from '@/lib/pdf-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getServerDb();
    const isAdmin = await isUserAdmin(db, uid);
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const invoiceId = params.id;

    // Resolve target first so we can fail fast if ME isn't enabled for
    // this invoice's company / no recipient is configured.
    const target = await resolveMarginEdgeTarget({ invoiceId }, db);
    if (!target) {
      return NextResponse.json({
        error: 'Margin Edge is not enabled for this company, or no Margin Edge inbox is configured. Configure it in Companies Permissions or on the location.',
      }, { status: 400 });
    }

    if (target.alreadySent) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: `Invoice was already forwarded to Margin Edge at ${target.invoiceData.marginEdgeSentTo || target.marginEdgeEmail}.`,
      });
    }

    // Build the PDF payload from the invoice doc. Fields kept conservative
    // so we don't over-share data with ME (no internal notes, no system
    // info, no other clients' data).
    const inv = target.invoiceData;
    const pdfPayload: InvoiceData = {
      invoiceNumber: inv.invoiceNumber || invoiceId.slice(-8).toUpperCase(),
      clientName: inv.clientName || 'Customer',
      clientEmail: inv.clientEmail || '',
      workOrderName: inv.workOrderTitle || undefined,
      vendorName: inv.subcontractorName || undefined,
      serviceDescription: inv.workOrderDescription || undefined,
      lineItems: Array.isArray(inv.lineItems) && inv.lineItems.length > 0
        ? inv.lineItems.map((li: any) => ({
            description: String(li.description ?? 'Item'),
            quantity: Number(li.quantity ?? 1),
            unitPrice: Number(li.unitPrice ?? li.rate ?? 0),
            amount: Number(li.amount ?? (Number(li.quantity ?? 1) * Number(li.unitPrice ?? 0))),
          }))
        : [{
            description: inv.workOrderTitle || 'Service',
            quantity: 1,
            unitPrice: Number(inv.totalAmount || 0),
            amount: Number(inv.totalAmount || 0),
          }],
      subtotal: Number(inv.subtotal ?? inv.totalAmount ?? 0),
      discountAmount: Number(inv.discountAmount ?? 0),
      totalAmount: Number(inv.totalAmount || 0),
      dueDate: inv.dueDate?.toDate?.()?.toLocaleDateString?.() || (inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : ''),
      notes: inv.notes || undefined,
      terms: inv.terms || undefined,
    };

    let pdfBase64: string;
    try {
      const pdfDoc = generateInvoicePDF(pdfPayload);
      // jsPDF returns a data URL like 'data:application/pdf;base64,...';
      // strip the prefix for the email attachment.
      const dataUri = pdfDoc.output('datauristring');
      const commaIdx = dataUri.indexOf(',');
      pdfBase64 = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;
    } catch (pdfErr: any) {
      const message = pdfErr?.message || String(pdfErr);
      console.error('[me-approve] PDF generation failed:', message);
      await updateDoc(doc(db, 'invoices', invoiceId), {
        marginEdgeError: `PDF generation failed: ${message}`,
      }).catch(() => {});
      return NextResponse.json({ error: `Could not generate invoice PDF: ${message}` }, { status: 500 });
    }

    // Fire the ME send via the shared helper (handles idempotency,
    // logging, and the marginEdgeSentAt write).
    const result = await sendInvoiceToMarginEdge({
      invoiceId,
      pdfBase64,
      workOrderTitle: inv.workOrderTitle,
      totalAmount: Number(inv.totalAmount || 0),
      dueDate: pdfPayload.dueDate,
      vendorName: inv.subcontractorName || undefined,
    });

    if (!result.attempted) {
      // Shouldn't happen since we resolved successfully above, but keep
      // the type narrow.
      return NextResponse.json({ success: false, skipped: result.skipped }, { status: 500 });
    }

    if (!result.sent) {
      return NextResponse.json({
        error: result.error || 'Margin Edge send failed.',
      }, { status: 502 });
    }

    // Stamp the approval status + audit. We keep status as-is when the
    // invoice was already past 'draft' / 'pending_approval' (e.g. sent
    // earlier) so we don't backslide the lifecycle.
    const currentStatus = String(inv.status || '').toLowerCase();
    const FORWARD_OK = new Set(['draft', 'pending_approval', '']);
    await updateDoc(doc(db, 'invoices', invoiceId), {
      ...(FORWARD_OK.has(currentStatus) ? { status: 'approved' } : {}),
      approvedForMarginEdgeAt: serverTimestamp(),
      approvedForMarginEdgeBy: uid,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      sent: true,
      messageId: result.messageId || null,
      sentTo: target.marginEdgeEmail,
    });
  } catch (err: any) {
    console.error('[me-approve] uncaught error:', err);
    return NextResponse.json({ error: err?.message || 'Approval failed' }, { status: 500 });
  }
}
