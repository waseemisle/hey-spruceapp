/**
 * GET /api/invoices/auto-finalize  (cron)
 *
 * Runs hourly via Vercel Cron. Finds invoices in `pending_approval` whose
 * approvalDeadlineAt has passed, transitions them to `sent`, and emails the
 * customer-facing invoice. Idempotent: `invoiceEmailSentAt` guards against
 * double-sends across cron retries.
 *
 * Auth (mirrors /api/recurring-work-orders/cron):
 *   - When CRON_SECRET is set, require `Authorization: Bearer <secret>`.
 *   - When the env var is missing (local dev), allow unauthenticated calls.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  collection, query, where, getDocs, doc, updateDoc, serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import { getAllAdminUserIds, createNotifications, createNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_PER_RUN = 100;

export async function GET(request: NextRequest) {
  // Auth — same shape as the recurring-work-orders cron.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    const ok = authHeader === `Bearer ${cronSecret}` || authHeader === cronSecret;
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date();
  let db: any;
  try {
    db = await getServerDb();
  } catch (e) {
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  const results: Array<{ invoiceId: string; invoiceNumber: string; status: 'finalized' | 'skipped' | 'error'; reason?: string }> = [];

  try {
    const now = Timestamp.now();
    // Single composite-free query: status filter + deadline range. We rely on
    // the safe pattern of filtering one indexed field (status) plus a range on
    // approvalDeadlineAt — this only requires a single-field index Firestore
    // creates automatically on the timestamp.
    const snap = await getDocs(query(
      collection(db, 'invoices'),
      where('status', '==', 'pending_approval'),
      where('approvalDeadlineAt', '<=', now),
    ));

    const candidates = snap.docs.slice(0, MAX_PER_RUN);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    for (const d of candidates) {
      const inv = d.data() as any;
      const invoiceId = d.id;
      try {
        // Idempotency: an earlier cron run may have flipped status to 'sent'
        // but we still need to run if invoiceEmailSentAt is missing. We re-read
        // to avoid acting on stale local copies.
        if (inv.clientApprovalStatus !== 'pending' || inv.invoiceEmailSentAt) {
          results.push({ invoiceId, invoiceNumber: inv.invoiceNumber, status: 'skipped', reason: 'already finalized' });
          continue;
        }

        const finalizedEvent = createInvoiceTimelineEvent({
          type: 'sent',
          userId: 'system',
          userName: 'Auto-Finalize Cron',
          userRole: 'system',
          details: `Invoice auto-finalized: client did not respond within the 72-hour approval window. Deemed approved.`,
          metadata: { invoiceNumber: inv.invoiceNumber, action: 'auto_finalized' },
        });

        // Transition to sent FIRST. If the email send fails afterward, we'll
        // leave invoiceEmailSentAt unset so the next cron run retries the email
        // without re-doing the status flip.
        await updateDoc(doc(db, 'invoices', invoiceId), {
          status: 'sent',
          clientApprovalStatus: 'auto_finalized',
          finalizedAt: serverTimestamp(),
          sentAt: serverTimestamp(),
          timeline: [...(inv.timeline || []), finalizedEvent],
          systemInformation: {
            ...(inv.systemInformation || {}),
            finalizedBy: { id: 'system', name: 'Auto-Finalize Cron', timestamp: Timestamp.now() },
          },
          updatedAt: serverTimestamp(),
        });

        // Send invoice email — idempotent via invoiceEmailSentAt.
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
          await updateDoc(doc(db, 'invoices', invoiceId), { invoiceEmailSentAt: serverTimestamp() });
          // Notify the client (in-app) that their invoice was auto-finalized.
          try {
            await createNotification({
              userId: inv.clientId,
              userRole: 'client',
              type: 'invoice',
              title: 'Invoice finalized',
              message: `Invoice ${inv.invoiceNumber} was auto-approved after 72 hours and emailed for payment.`,
              link: `/client-portal/invoices/${invoiceId}`,
              referenceId: invoiceId,
              referenceType: 'invoice',
            });
            const adminIds = await getAllAdminUserIds();
            if (adminIds.length > 0) {
              await createNotifications(adminIds.map(adminId => ({
                userId: adminId,
                userRole: 'admin' as const,
                type: 'invoice',
                title: 'Invoice auto-finalized',
                message: `Invoice ${inv.invoiceNumber} (${inv.clientName}) finalized after 72h with no client response.`,
                link: `/admin-portal/invoices`,
                referenceId: invoiceId,
                referenceType: 'invoice',
              })));
            }
          } catch (notifyErr) {
            console.error('[invoices/auto-finalize] notify error:', notifyErr);
          }
          results.push({ invoiceId, invoiceNumber: inv.invoiceNumber, status: 'finalized' });
        } else {
          const text = await emailRes.text().catch(() => '');
          console.error('[invoices/auto-finalize] email failed:', invoiceId, text);
          results.push({ invoiceId, invoiceNumber: inv.invoiceNumber, status: 'error', reason: `email send failed: ${text.slice(0, 200)}` });
        }
      } catch (perInvErr: any) {
        console.error('[invoices/auto-finalize] per-invoice error:', invoiceId, perInvErr);
        results.push({ invoiceId, invoiceNumber: inv.invoiceNumber, status: 'error', reason: perInvErr?.message || 'unknown' });
      }
    }

    return NextResponse.json({
      message: `Processed ${candidates.length} pending invoice(s) past deadline`,
      durationMs: Date.now() - startedAt.getTime(),
      finalized: results.filter(r => r.status === 'finalized').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    });
  } catch (error: any) {
    console.error('[invoices/auto-finalize] fatal:', error);
    if (error?.message?.includes('index')) {
      return NextResponse.json({
        error: 'Firestore index required for invoices(status, approvalDeadlineAt)',
        details: error.message,
      }, { status: 500 });
    }
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
