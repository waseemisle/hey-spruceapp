/**
 * POST /api/invoices/[id]/admin-approve
 *
 * Admin "Approve & notify client" action for invoices that were created
 * under the per-client requireInvoiceApproval gate
 * (clients/{id}.requireInvoiceApproval = true).
 *
 * Effect:
 *   • Validates: requester is admin, invoice exists in pending_approval
 *     state with adminApprovalRequired = true, has a Stripe payment link
 *     (otherwise the customer would receive an email with no way to pay).
 *   • Generates the invoice PDF server-side.
 *   • Flips status: pending_approval → sent, stamps adminApprovedAt /
 *     adminApprovedBy.
 *   • Sends the customer-facing /api/email/send-invoice email with PDF.
 *   • Creates the in-app client notification via `notifyClientOfInvoiceWithServerDb`.
 *
 * Idempotency: if status is already 'sent' (or any post-sent state) AND
 * adminApprovedAt is set, returns 200 { skipped: true }. Re-clicking
 * Approve never double-emails the customer.
 *
 * NOT to be confused with /api/invoices/[id]/approve which is the
 * CLIENT's confirmation of a 72h-window invoice — different gate.
 */
import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, isUserAdmin } from '@/lib/api-verify-firebase';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import { notifyClientOfInvoiceWithServerDb } from '@/lib/server-admin-notifications';
import { generateInvoicePDF, type InvoiceData } from '@/lib/pdf-generator';
import { getBaseUrl } from '@/lib/base-url';

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
    const invRef = doc(db, 'invoices', invoiceId);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    const inv = invSnap.data();

    // Idempotency
    if (inv.adminApprovedAt && (inv.status === 'sent' || inv.status === 'paid')) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'Invoice was already approved and the client was already notified.',
      });
    }

    if (inv.status !== 'pending_approval' || inv.adminApprovalRequired !== true) {
      return NextResponse.json({
        error: 'Invoice is not in admin-pending-approval state.',
      }, { status: 400 });
    }

    if (!inv.stripePaymentLink) {
      return NextResponse.json({
        error: 'Invoice has no Stripe payment link yet. Generate one before approving so the customer email has a way to pay.',
      }, { status: 400 });
    }

    if (!inv.clientEmail) {
      return NextResponse.json({
        error: 'Invoice has no client email — cannot send.',
      }, { status: 400 });
    }

    const adminSnap = await getDoc(doc(db, 'adminUsers', uid));
    const adminName = adminSnap.exists() ? (adminSnap.data().fullName || adminSnap.data().email || 'Admin') : 'Admin';

    // Build PDF payload
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
      const dataUri = pdfDoc.output('datauristring');
      const commaIdx = dataUri.indexOf(',');
      pdfBase64 = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;
    } catch (pdfErr: any) {
      const message = pdfErr?.message || String(pdfErr);
      return NextResponse.json({ error: `Could not generate invoice PDF: ${message}` }, { status: 500 });
    }

    // Flip status and stamp audit FIRST so the client portal flips
    // immediately and downstream email failures don't roll back the
    // approval (admin can re-trigger the email manually if it fails).
    const sentEvent = createInvoiceTimelineEvent({
      type: 'sent',
      userId: uid,
      userName: adminName,
      userRole: 'admin',
      details: `Approved by ${adminName} — invoice released to client`,
      metadata: { invoiceNumber: pdfPayload.invoiceNumber, gate: 'admin' },
    });
    const existingTimeline = inv.timeline || [];
    const existingSysInfo = inv.systemInformation || {};
    await updateDoc(invRef, {
      status: 'sent',
      sentAt: serverTimestamp(),
      adminApprovedAt: serverTimestamp(),
      adminApprovedBy: uid,
      timeline: [...existingTimeline, sentEvent],
      systemInformation: {
        ...existingSysInfo,
        sentBy: { id: uid, name: adminName, timestamp: Timestamp.now() },
        adminApprovedBy: { id: uid, name: adminName, timestamp: Timestamp.now() },
      },
      updatedAt: serverTimestamp(),
    });

    // In-app notification + customer email — fire-and-forget so a slow
    // mail provider doesn't block the response. The status is already
    // flipped; failures land in /admin-portal/email-logs for retry.
    notifyClientOfInvoiceWithServerDb(db, {
      clientId: inv.clientId,
      invoiceId,
      invoiceNumber: pdfPayload.invoiceNumber,
      workOrderNumber: inv.workOrderNumber || inv.workOrderId || '',
      amount: Number(inv.totalAmount || 0),
    }).catch((e) => console.error('[admin-approve] notify failed (non-fatal):', e));

    const baseUrl = getBaseUrl();
    fetch(`${baseUrl}/api/email/send-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toEmail: inv.clientEmail,
        toName: inv.clientName,
        invoiceNumber: pdfPayload.invoiceNumber,
        workOrderTitle: inv.workOrderTitle,
        totalAmount: Number(inv.totalAmount || 0),
        dueDate: pdfPayload.dueDate,
        lineItems: inv.lineItems,
        notes: inv.notes,
        stripePaymentLink: inv.stripePaymentLink,
        invoiceId,
        pdfBase64,
        subcontractorId: inv.subcontractorId || undefined,
      }),
    }).catch((e) => console.error('[admin-approve] send-invoice email failed (non-fatal):', e));

    return NextResponse.json({
      success: true,
      message: 'Approved — client notified.',
    });
  } catch (err: any) {
    console.error('[admin-approve] uncaught error:', err);
    return NextResponse.json({ error: err?.message || 'Approval failed' }, { status: 500 });
  }
}
