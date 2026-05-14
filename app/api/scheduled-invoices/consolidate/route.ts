import { NextRequest, NextResponse } from 'next/server';
import {
  collection, doc, getDocs, query, where, addDoc, updateDoc, writeBatch,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { generateInvoiceNumber } from '@/lib/invoice-number';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function fmtDate(val: any): string {
  const d = val?.toDate ? val.toDate() : val instanceof Date ? val : new Date(val);
  if (isNaN(d?.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Whether the consolidation window for this schedule has ended as of `now`.
 *   'weekly'    → today's day-of-week matches consolidationEndDayOfWeek
 *                 AND at least 6 days have elapsed since windowStart
 *   'bi-weekly' → same weekday check, at least 13 days elapsed
 *   'monthly'   → today is the last day of the month (or first day triggers
 *                 the previous month's window close)
 */
function isWindowEnded(si: any, now: Date): boolean {
  const windowStart: Date | null = (() => {
    const v = si.consolidationWindowStart;
    if (!v) return null;
    if (v?.toDate) return v.toDate();
    return v instanceof Date ? v : new Date(v);
  })();
  if (!windowStart) return false;

  const period: string = si.consolidationPeriod || 'weekly';

  if (period === 'weekly' || period === 'bi-weekly') {
    const endDay: number = si.consolidationEndDayOfWeek ?? 0;
    if (now.getDay() !== endDay) return false;
    const minDays = period === 'bi-weekly' ? 13 : 6;
    const elapsed = Math.floor((now.getTime() - windowStart.getTime()) / 86_400_000);
    return elapsed >= minDays;
  }

  if (period === 'monthly') {
    // Window ends on the last day of the month
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return now.getDate() === lastDayOfMonth;
  }

  return false;
}

/**
 * Start of the next consolidation window after `now`.
 */
function nextWindowStart(si: any, now: Date): Date {
  const period: string = si.consolidationPeriod || 'weekly';
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);

  if (period === 'weekly') {
    // Next window starts the day after today
    return next;
  }
  if (period === 'bi-weekly') {
    return next;
  }
  if (period === 'monthly') {
    // First day of next month
    return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
  }
  return next;
}

/**
 * POST /api/scheduled-invoices/consolidate
 *
 * Called by the daily cron (via vercel.json) or the "Consolidate Now"
 * button on the scheduled invoice detail page.
 *
 * When called with { scheduledInvoiceId } in the body, it only processes
 * that single schedule (used by the manual "Consolidate Now" button).
 * When called without a body (or from the cron), it scans all active
 * schedules that have consolidationEnabled.
 *
 * Idempotent: skips schedules whose window hasn't ended yet, and skips
 * windows that already have a consolidated invoice.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const targetId: string | undefined = body?.scheduledInvoiceId;

  const db = await getServerDb();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://groundopscos.vercel.app');

  const now = new Date();
  const processed: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  // Fetch schedules to process
  let scheduleSnap;
  if (targetId) {
    const { getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'scheduledInvoices', targetId));
    scheduleSnap = snap.exists() ? [{ id: snap.id, data: () => snap.data() }] : [];
  } else {
    const q = query(
      collection(db, 'scheduledInvoices'),
      where('consolidationEnabled', '==', true),
      where('status', '==', 'active'),
    );
    const snap = await getDocs(q);
    scheduleSnap = snap.docs.map(d => ({ id: d.id, data: () => d.data() }));
  }

  for (const schedDoc of scheduleSnap) {
    const siId = schedDoc.id;
    const si = schedDoc.data() as any;

    try {
      // If manually triggered, skip window-end check but still require
      // at least one accumulated invoice.
      if (!targetId && !isWindowEnded(si, now)) {
        skipped.push(siId);
        continue;
      }

      const windowStart: Date | null = (() => {
        const v = si.consolidationWindowStart;
        if (!v) return null;
        if (v?.toDate) return v.toDate();
        return v instanceof Date ? v : new Date(v);
      })();

      if (!windowStart) {
        skipped.push(siId);
        continue;
      }

      // Idempotency: check if a consolidated invoice already exists for
      // this schedule covering the current window.
      const existingConsolidated = await getDocs(query(
        collection(db, 'consolidatedInvoices'),
        where('scheduledInvoiceId', '==', siId),
        where('periodStart', '>=', Timestamp.fromDate(windowStart)),
      ));
      if (!existingConsolidated.empty) {
        skipped.push(siId);
        continue;
      }

      // Collect accumulated draft invoices for this window
      const accumulatedSnap = await getDocs(query(
        collection(db, 'invoices'),
        where('scheduledInvoiceId', '==', siId),
        where('consolidatedPending', '==', true),
      ));

      const windowInvoices = accumulatedSnap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(inv => {
          const createdAt = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt);
          return createdAt >= windowStart && (inv.status === 'draft' || inv.status === 'sent');
        });

      if (windowInvoices.length === 0) {
        skipped.push(siId);
        // Advance window even if no invoices accumulated
        await updateDoc(doc(db, 'scheduledInvoices', siId), {
          consolidationWindowStart: Timestamp.fromDate(nextWindowStart(si, now)),
          updatedAt: serverTimestamp(),
        });
        continue;
      }

      const totalAmount = windowInvoices.reduce((s: number, inv: any) => s + Number(inv.totalAmount || 0), 0);
      const invoiceIds = windowInvoices.map((inv: any) => inv.id);
      const lineItems = windowInvoices.map((inv: any) => ({
        description: `Invoice ${inv.invoiceNumber || inv.id} — ${fmtDate(inv.createdAt)}`,
        amount: Number(inv.totalAmount || 0),
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
      }));

      const consolidatedInvoiceNumber = generateInvoiceNumber();
      let chargeStatus: 'succeeded' | 'failed' | null = null;
      let paymentIntentId: string | undefined;

      const shouldAutoCharge = si.consolidationAutoCharge === true
        && si.consolidationAutoChargePaymentMethodId;

      // Attempt auto-charge if configured
      if (shouldAutoCharge) {
        try {
          const chargeRes = await fetch(`${baseUrl}/api/stripe/charge-client-now`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientId: si.clientId,
              paymentMethodId: si.consolidationAutoChargePaymentMethodId,
              amount: totalAmount,
              description: `Consolidated invoice ${consolidatedInvoiceNumber} — ${invoiceIds.length} invoice${invoiceIds.length !== 1 ? 's' : ''}`,
            }),
          });
          const chargeData = await chargeRes.json().catch(() => ({}));
          if (chargeRes.ok && chargeData?.success) {
            chargeStatus = 'succeeded';
            paymentIntentId = chargeData.paymentIntentId;
          } else {
            chargeStatus = 'failed';
          }
        } catch (e) {
          chargeStatus = 'failed';
          console.error('[consolidate] auto-charge threw:', e);
        }
      }

      const isPaid = chargeStatus === 'succeeded';

      // Create the consolidated invoice doc
      const consolidatedRef = await addDoc(collection(db, 'consolidatedInvoices'), {
        scheduledInvoiceId: siId,
        clientId: si.clientId,
        clientName: si.clientName,
        invoiceIds,
        invoiceCount: invoiceIds.length,
        totalAmount,
        periodStart: Timestamp.fromDate(windowStart),
        periodEnd: Timestamp.fromDate(now),
        consolidationPeriod: si.consolidationPeriod || 'weekly',
        status: isPaid ? 'paid' : 'draft',
        autoCharged: isPaid,
        autoChargeStatus: chargeStatus || null,
        stripePaymentIntentId: paymentIntentId || null,
        paidAt: isPaid ? serverTimestamp() : null,
        lineItems,
        invoiceNumber: consolidatedInvoiceNumber,
        createdAt: serverTimestamp(),
      });

      // If charged, batch-mark all linked invoices + work orders as paid
      if (isPaid) {
        const batch = writeBatch(db);
        for (const inv of windowInvoices) {
          batch.update(doc(db, 'invoices', inv.id), {
            status: 'paid',
            paidAt: serverTimestamp(),
            consolidatedInvoiceId: consolidatedRef.id,
          });
          if (inv.workOrderId) {
            batch.update(doc(db, 'workOrders', inv.workOrderId), {
              status: 'completed',
              updatedAt: serverTimestamp(),
            });
          }
        }
        await batch.commit();
      } else {
        // Mark invoices as referenced by this consolidated invoice
        const batch = writeBatch(db);
        for (const inv of windowInvoices) {
          batch.update(doc(db, 'invoices', inv.id), {
            consolidatedInvoiceId: consolidatedRef.id,
          });
        }
        await batch.commit();

        // Fire-and-forget: send consolidated invoice email to client
        fetch(`${baseUrl}/api/email/send-invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: si.clientEmail,
            toName: si.clientName,
            invoiceNumber: consolidatedInvoiceNumber,
            workOrderTitle: `Consolidated Invoice — ${invoiceIds.length} invoice${invoiceIds.length !== 1 ? 's' : ''}`,
            totalAmount,
            dueDate: new Date(now.getTime() + 30 * 86_400_000).toLocaleDateString(),
            lineItems,
            notes: `Consolidated invoice for period ${fmtDate(windowStart)} – ${fmtDate(now)}`,
            invoiceId: consolidatedRef.id,
          }),
        }).catch(e => console.error('[consolidate] email send threw:', e));
      }

      // Advance the window start to the next period
      await updateDoc(doc(db, 'scheduledInvoices', siId), {
        consolidationWindowStart: Timestamp.fromDate(nextWindowStart(si, now)),
        updatedAt: serverTimestamp(),
      });

      processed.push(siId);
    } catch (e: any) {
      console.error(`[consolidate] error for schedule ${siId}:`, e);
      errors.push({ id: siId, error: e?.message || String(e) });
    }
  }

  return NextResponse.json({
    success: true,
    processed: processed.length,
    skipped: skipped.length,
    errors,
    processedIds: processed,
  });
}
