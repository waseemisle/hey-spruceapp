import { NextRequest, NextResponse } from 'next/server';
import { collection, query, orderBy, limit, getDocs, where, doc, getDoc, setDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';

/**
 * GET — Fetch cron run history + schedule settings
 * POST — Update schedule settings
 */
export async function GET() {
  try {
    const db = await getServerDb();

    // Fetch last 50 cron runs
    let runs: any[] = [];
    try {
      // Fetch all cron_run docs then sort client-side (avoids composite index requirement)
      const snap = await getDocs(query(
        collection(db, 'emailLogs'),
        where('type', '==', 'cron_run'),
      ));
      runs = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          startedAt: data.startedAt?.toDate?.()?.toISOString() || data.startedAt,
          completedAt: data.completedAt?.toDate?.()?.toISOString() || data.completedAt,
          durationMs: data.durationMs,
          totalEligible: data.totalEligible,
          totalSucceeded: data.totalSucceeded,
          totalFailed: data.totalFailed,
          status: data.status,
          triggeredBy: data.triggeredBy,
          results: data.results || [],
          error: data.error,
        };
      });
      // Sort by startedAt descending and limit
      runs.sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      runs = runs.slice(0, 50);
    } catch (e: any) {
      console.log('emailLogs cron query error:', e.message);
    }

    // Fetch schedule settings
    let schedule = { intervalMinutes: 60, lastRunAt: null as string | null, leadTimeDays: 7 };
    try {
      const settingsSnap = await getDoc(doc(db, 'emailLogs', '_schedule'));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        schedule.intervalMinutes = data.intervalMinutes || 60;
        schedule.lastRunAt = data.lastRunAt?.toDate?.()?.toISOString() || null;
        if (typeof data.leadTimeDays === 'number' && data.leadTimeDays >= 0) {
          schedule.leadTimeDays = data.leadTimeDays;
        }
      }
    } catch {}

    // Scheduled Invoices cron history + last-run lock. Same shape as the
    // RWO `runs` block above so the cron-jobs admin page can render an
    // identical-looking panel without a parallel data fetch.
    let scheduledInvoiceRuns: any[] = [];
    let scheduledInvoiceLastRunAt: string | null = null;
    try {
      const snap = await getDocs(query(
        collection(db, 'emailLogs'),
        where('type', '==', 'cron_run_scheduled_invoices'),
      ));
      scheduledInvoiceRuns = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          startedAt: data.startedAt?.toDate?.()?.toISOString() || data.startedAt,
          completedAt: data.completedAt?.toDate?.()?.toISOString() || data.completedAt,
          durationMs: data.durationMs,
          totalEligible: data.totalEligible,
          totalSucceeded: data.totalSucceeded,
          totalFailed: data.totalFailed,
          totalSkipped: data.totalSkipped,
          status: data.status,
          triggeredBy: data.triggeredBy,
          results: data.results || [],
          error: data.error,
        };
      });
      scheduledInvoiceRuns.sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      scheduledInvoiceRuns = scheduledInvoiceRuns.slice(0, 50);
    } catch (e: any) {
      console.log('emailLogs SI cron query error:', e.message);
    }
    try {
      const siSettingsSnap = await getDoc(doc(db, 'emailLogs', '_schedule_si'));
      if (siSettingsSnap.exists()) {
        const data = siSettingsSnap.data();
        scheduledInvoiceLastRunAt = data.lastRunAt?.toDate?.()?.toISOString() || null;
      } else if (scheduledInvoiceRuns.length > 0) {
        scheduledInvoiceLastRunAt = scheduledInvoiceRuns[0].completedAt || scheduledInvoiceRuns[0].startedAt || null;
      }
    } catch {}

    // Eligible = RWOs whose nextExecution falls within the lead-time window from today.
    // The cron fires leadTimeDays BEFORE the scheduled iteration date so admins have
    // time to assign the resulting work order to a subcontractor before the service date.
    let overdue: any[] = [];
    try {
      const now = new Date();
      const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      cutoff.setDate(cutoff.getDate() + schedule.leadTimeDays);
      const rwoSnap = await getDocs(query(
        collection(db, 'recurringWorkOrders'),
        where('status', '==', 'active'),
      ));
      rwoSnap.docs.forEach(d => {
        const data = d.data();
        const next = data.nextExecution?.toDate?.();
        if (next && next <= cutoff) {
          overdue.push({
            id: d.id,
            title: data.title || 'Untitled',
            nextExecution: next.toISOString(),
            clientName: data.clientName || '',
            locationName: data.locationName || '',
          });
        }
      });
      overdue.sort((a, b) => new Date(a.nextExecution).getTime() - new Date(b.nextExecution).getTime());
    } catch {}

    // Eligible scheduled invoices — same lead-time window as RWO so the
    // operator's "due soon" view stays consistent across both crons.
    let scheduledInvoiceOverdue: any[] = [];
    try {
      const now2 = new Date();
      const cutoff2 = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate(), 23, 59, 59);
      cutoff2.setDate(cutoff2.getDate() + schedule.leadTimeDays);
      const siSnap = await getDocs(query(
        collection(db, 'scheduledInvoices'),
        where('status', '==', 'active'),
      ));
      siSnap.docs.forEach(d => {
        const data = d.data();
        const next = data.nextExecution?.toDate?.();
        if (next && next <= cutoff2) {
          scheduledInvoiceOverdue.push({
            id: d.id,
            scheduledInvoiceNumber: data.scheduledInvoiceNumber || '',
            title: data.title || 'Untitled',
            nextExecution: next.toISOString(),
            clientName: data.clientName || '',
            totalAmount: data.totalAmount || 0,
          });
        }
      });
      scheduledInvoiceOverdue.sort((a, b) => new Date(a.nextExecution).getTime() - new Date(b.nextExecution).getTime());
    } catch {}

    return NextResponse.json({
      runs,
      schedule,
      overdue,
      scheduledInvoices: {
        runs: scheduledInvoiceRuns,
        lastRunAt: scheduledInvoiceLastRunAt,
        overdue: scheduledInvoiceOverdue,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await getServerDb();
    const body = await request.json();
    const { intervalMinutes, leadTimeDays } = body || {};

    const update: Record<string, any> = { updatedAt: serverTimestamp() };

    if (intervalMinutes !== undefined) {
      if (typeof intervalMinutes !== 'number' || intervalMinutes < 5) {
        return NextResponse.json({ error: 'Invalid interval' }, { status: 400 });
      }
      update.intervalMinutes = intervalMinutes;
    }

    if (leadTimeDays !== undefined) {
      if (typeof leadTimeDays !== 'number' || !Number.isFinite(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 60) {
        return NextResponse.json({ error: 'Invalid leadTimeDays (must be 0–60)' }, { status: 400 });
      }
      update.leadTimeDays = Math.floor(leadTimeDays);
    }

    if (Object.keys(update).length === 1) {
      return NextResponse.json({ error: 'No settings provided' }, { status: 400 });
    }

    await setDoc(doc(db, 'emailLogs', '_schedule'), update, { merge: true });

    return NextResponse.json({ success: true, ...update, updatedAt: undefined });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT — Manually trigger a cron from the admin "Run Cron Now" button.
 *
 * `target` query param picks which feature's cron to run:
 *   • absent / 'recurring_work_orders' — RWO cron (legacy default)
 *   • 'scheduled_invoices' — Scheduled Invoices cron
 *
 * Manual triggers do NOT update the corresponding lastRunAt lock — the
 * Vercel cron ping is the only thing that should advance that. If we
 * updated it here, a manual run mid-day would silence the next
 * scheduled firing.
 */
export async function PUT(request: NextRequest) {
  const target = (request.nextUrl.searchParams.get('target') || 'recurring_work_orders').toLowerCase();
  const isScheduledInvoices = target === 'scheduled_invoices';

  const startedAt = new Date();
  let db: any;
  try {
    db = await getServerDb();
  } catch (error: any) {
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  try {
    const now = new Date();
    // Honor leadTimeDays so manual "Run Cron Now" matches the scheduled cron's cutoff.
    let leadTimeDays = 7;
    try {
      const settingsSnap = await getDoc(doc(db, 'emailLogs', '_schedule'));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (typeof data.leadTimeDays === 'number' && data.leadTimeDays >= 0) {
          leadTimeDays = Math.floor(data.leadTimeDays);
        }
      }
    } catch {}

    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    cutoff.setDate(cutoff.getDate() + leadTimeDays);

    const collectionName = isScheduledInvoices ? 'scheduledInvoices' : 'recurringWorkOrders';
    const executeRoute = isScheduledInvoices
      ? '/api/scheduled-invoices/execute'
      : '/api/recurring-work-orders/execute';
    const idField = isScheduledInvoices ? 'scheduledInvoiceId' : 'recurringWorkOrderId';
    const titleField = isScheduledInvoices ? 'scheduledInvoiceNumber' : 'title';
    const logType = isScheduledInvoices ? 'cron_run_scheduled_invoices' : 'cron_run';

    const snapshot = await getDocs(query(
      collection(db, collectionName),
      where('status', '==', 'active'),
      where('nextExecution', '<=', cutoff),
    ));

    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const totalEligible = items.length;

    const results: any[] = [];
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (i > 0) await new Promise(r => setTimeout(r, 5000)); // 5s gap to avoid rate limits
      try {
        const res = await fetch(`${baseUrl}${executeRoute}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [idField]: item.id, triggeredBy: 'manual_admin' }),
        });
        const data = await res.json();
        if (!res.ok) {
          totalFailed++;
          results.push({
            ...(isScheduledInvoices
              ? { siId: item.id, siNumber: item[titleField], title: item.title }
              : { rwoId: item.id, rwoTitle: item[titleField] || item.id }),
            status: 'error',
            message: data.error || data.details || 'Failed',
          });
          continue;
        }
        if (data.alreadyExecuted) {
          totalSkipped++;
          results.push({
            ...(isScheduledInvoices
              ? { siId: item.id, siNumber: item[titleField], title: item.title }
              : { rwoId: item.id, rwoTitle: item[titleField] || item.id }),
            status: 'skipped',
            message: data.message || 'Already executed',
            invoiceNumber: data.invoiceNumber,
          });
          continue;
        }
        totalSucceeded++;
        results.push({
          ...(isScheduledInvoices
            ? { siId: item.id, siNumber: item[titleField], title: item.title }
            : { rwoId: item.id, rwoTitle: item[titleField] || item.id }),
          status: 'success',
          message: data.message || 'OK',
          executionId: data.executionId,
          invoiceNumber: data.invoiceNumber,
          nextExecution: data.nextExecution,
        });
      } catch (e: any) {
        totalFailed++;
        results.push({
          ...(isScheduledInvoices
            ? { siId: item.id, siNumber: item[titleField], title: item.title }
            : { rwoId: item.id, rwoTitle: item[titleField] || item.id }),
          status: 'error',
          message: e.message,
        });
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const runStatus = totalFailed === 0
      ? (totalSucceeded === 0 && totalSkipped === 0 ? 'idle' : 'completed')
      : totalSucceeded === 0
        ? 'failed'
        : 'partial';

    await addDoc(collection(db, 'emailLogs'), {
      type: logType,
      startedAt, completedAt, durationMs,
      totalEligible, totalSucceeded, totalFailed, totalSkipped,
      status: runStatus, triggeredBy: 'manual_api',
      results, createdAt: serverTimestamp(),
    });

    return NextResponse.json({
      message: `Processed ${totalEligible} ${isScheduledInvoices ? 'scheduled invoices' : 'recurring work orders'}`,
      status: runStatus,
      totalEligible,
      totalSucceeded,
      totalFailed,
      totalSkipped,
      durationMs,
      results,
    });
  } catch (error: any) {
    try {
      await addDoc(collection(db, 'emailLogs'), {
        type: isScheduledInvoices ? 'cron_run_scheduled_invoices' : 'cron_run',
        startedAt, completedAt: new Date(), durationMs: Date.now() - startedAt.getTime(),
        totalEligible: 0, totalSucceeded: 0, totalFailed: 0,
        status: 'error', triggeredBy: 'manual_api',
        error: error.message, results: [], createdAt: serverTimestamp(),
      });
    } catch {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
