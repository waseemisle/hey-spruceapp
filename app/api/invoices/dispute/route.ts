/**
 * POST /api/invoices/dispute
 *
 * Client disputes a `pending_approval` invoice. Status → 'disputed', stamps
 * disputedAt + disputeReason, pauses auto-finalize, notifies admins.
 *
 * Auth: requires Bearer ID token; caller must be the invoice's clientId.
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

    const { invoiceId, reason } = await request.json();
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 });
    const trimmedReason = typeof reason === 'string' ? reason.trim().slice(0, 2000) : '';

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

    let clientName = inv.clientName || 'Client';
    try {
      const cs = await getDoc(doc(db, 'clients', uid));
      if (cs.exists()) clientName = cs.data().fullName || clientName;
    } catch {}

    const disputedEvent = createInvoiceTimelineEvent({
      type: 'created',
      userId: uid,
      userName: clientName,
      userRole: 'client',
      details: `Invoice disputed by ${clientName}${trimmedReason ? `. Reason: ${trimmedReason}` : '.'}`,
      metadata: { invoiceNumber: inv.invoiceNumber, action: 'client_disputed', reason: trimmedReason || '' },
    });

    const existingTimeline = inv.timeline || [];
    const existingSysInfo = inv.systemInformation || {};

    await updateDoc(invRef, {
      status: 'disputed',
      clientApprovalStatus: 'disputed',
      disputedAt: serverTimestamp(),
      disputeReason: trimmedReason || null,
      timeline: [...existingTimeline, disputedEvent],
      systemInformation: {
        ...existingSysInfo,
        disputedBy: { id: uid, name: clientName, timestamp: Timestamp.now(), reason: trimmedReason || undefined },
      },
      updatedAt: serverTimestamp(),
    });

    // Notify all admins. Required so ops can intervene before auto-finalize would have fired.
    try {
      const adminIds = await getAllAdminUserIds();
      if (adminIds.length > 0) {
        await createNotifications(adminIds.map(adminId => ({
          userId: adminId,
          userRole: 'admin' as const,
          type: 'invoice',
          title: 'Invoice DISPUTED by client',
          message: `${clientName} disputed invoice ${inv.invoiceNumber}${trimmedReason ? `: "${trimmedReason.slice(0, 100)}"` : ''}.`,
          link: `/admin-portal/invoices`,
          referenceId: invoiceId,
          referenceType: 'invoice',
        })));
      }
    } catch (e) {
      console.error('[invoices/dispute] admin notify failed', e);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[invoices/dispute] error:', error);
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}
