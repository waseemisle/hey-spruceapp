/**
 * POST /api/invoices/approve
 *
 * Client confirms a `pending_approval` invoice. Transitions status → 'sent',
 * stamps approvedAt, sends the customer-facing invoice email (idempotent via
 * `invoiceEmailSentAt` guard), and notifies admins.
 *
 * Auth: requires Bearer ID token; the caller must be the invoice's clientId.
 */
import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import { getAllAdminUserIds, createNotifications } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { invoiceId } = await request.json();
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 });

    const db = await getServerDb();
    const invRef = doc(db, 'invoices', invoiceId);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const inv = invSnap.data();
    if (inv.clientId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (inv.status !== 'pending_approval' || inv.clientApprovalStatus !== 'pending') {
      return NextResponse.json({ error: `Invoice is not pending approval (status=${inv.status})` }, { status: 400 });
    }

    // Resolve client display name for the timeline event.
    let clientName = inv.clientName || 'Client';
    try {
      const cs = await getDoc(doc(db, 'clients', uid));
      if (cs.exists()) clientName = cs.data().fullName || clientName;
    } catch {}

    const approvedEvent = createInvoiceTimelineEvent({
      type: 'sent',
      userId: uid,
      userName: clientName,
      userRole: 'client',
      details: `Invoice approved by ${clientName} — finalizing and emailing.`,
      metadata: { invoiceNumber: inv.invoiceNumber, action: 'client_approved' },
    });

    const existingTimeline = inv.timeline || [];
    const existingSysInfo = inv.systemInformation || {};

    await updateDoc(invRef, {
      status: 'sent',
      clientApprovalStatus: 'approved',
      approvedAt: serverTimestamp(),
      sentAt: serverTimestamp(),
      timeline: [...existingTimeline, approvedEvent],
      systemInformation: {
        ...existingSysInfo,
        approvedBy: { id: uid, name: clientName, timestamp: Timestamp.now() },
      },
      updatedAt: serverTimestamp(),
    });

    // Send the customer-facing invoice email — idempotent via invoiceEmailSentAt.
    if (!inv.invoiceEmailSentAt) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
          || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const emailRes = await fetch(`${baseUrl}/api/email/send-invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: inv.clientEmail,
            toName: inv.clientName,
            invoiceNumber: inv.invoiceNumber,
            workOrderTitle: inv.workOrderTitle,
            totalAmount: inv.totalAmount,
            dueDate: inv.dueDate?.toDate?.()?.toLocaleDateString?.() || new Date(inv.dueDate).toLocaleDateString(),
            lineItems: inv.lineItems,
            notes: inv.notes,
            stripePaymentLink: inv.stripePaymentLink,
            subcontractorId: inv.subcontractorId || undefined,
          }),
        });
        if (emailRes.ok) {
          await updateDoc(invRef, { invoiceEmailSentAt: serverTimestamp() });
        } else {
          console.error('[invoices/approve] email send failed', await emailRes.text());
        }
      } catch (e) {
        console.error('[invoices/approve] email send error', e);
      }
    }

    // Notify admins (fire-and-forget, in-app only).
    try {
      const adminIds = await getAllAdminUserIds();
      if (adminIds.length > 0) {
        await createNotifications(adminIds.map(adminId => ({
          userId: adminId,
          userRole: 'admin' as const,
          type: 'invoice',
          title: 'Invoice approved by client',
          message: `${clientName} approved invoice ${inv.invoiceNumber} ($${Number(inv.totalAmount || 0).toLocaleString()}).`,
          link: `/admin-portal/invoices`,
          referenceId: invoiceId,
          referenceType: 'invoice',
        })));
      }
    } catch (e) {
      console.error('[invoices/approve] admin notify failed', e);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[invoices/approve] error:', error);
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}
