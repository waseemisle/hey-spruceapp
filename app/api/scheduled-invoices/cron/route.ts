import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, getDoc, addDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Daily cron — fires every active scheduled invoice whose nextExecution
 * lands within the configured lead-time window. Mirrors the RWO cron at
 * /api/recurring-work-orders/cron exactly so the operator gets identical
 * audit shape, status pills, and lead-time semantics on the
 * /admin-portal/cron-jobs page.
 *
 * Auth + lock + result logging:
 *   • CRON_SECRET bearer guard (shared with RWO cron).
 *   • emailLogs/_schedule.lastRunAt 23h dedupe (per-cron lock — stored
 *     under a separate doc id so SI doesn't fight RWO for the lock).
 *   • emailLogs row written with type='cron_run_scheduled_invoices' so
 *     the cron-jobs page can filter SI runs distinctly from RWO runs.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    const ok = authHeader === `Bearer ${cronSecret}` || authHeader === cronSecret;
    if (!ok) {
      console.error('[SI CRON AUTH FAILED]', {
        headerPrefix: authHeader.substring(0, 30),
        secretLength: cronSecret.length,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const startedAt = new Date();
  const userAgent = request.headers.get('user-agent') || '';
  const triggeredBy = userAgent.includes('vercel-cron') || userAgent.includes('Vercel')
    ? 'vercel_cron'
    : 'manual_api';

  let db: any;
  try {
    db = await getServerDb();
  } catch (e) {
    console.error('[SI CRON] DB connect failed:', e);
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  try {
    const now = new Date();

    // ── Duplicate-run guard (Vercel cron firings only) ──
    if (triggeredBy === 'vercel_cron') {
      try {
        const settingsSnap = await getDoc(doc(db, 'emailLogs', '_schedule_si'));
        if (settingsSnap.exists()) {
          const lastRunAt = settingsSnap.data()?.lastRunAt?.toDate?.();
          if (lastRunAt) {
            const hoursSinceLast = (now.getTime() - lastRunAt.getTime()) / 3_600_000;
            if (hoursSinceLast < 23) {
              return NextResponse.json({
                message: 'Skipped — already ran today',
                lastRunAt: lastRunAt.toISOString(),
                hoursSinceLastRun: Math.round(hoursSinceLast * 10) / 10,
              });
            }
          }
        }
      } catch {}
      try {
        await setDoc(doc(db, 'emailLogs', '_schedule_si'), { lastRunAt: serverTimestamp() }, { merge: true });
      } catch {}
    }

    // ── Lead-time window — reuses the SAME admin-configurable doc the
    // RWO cron reads (emailLogs/_schedule.leadTimeDays). One config,
    // both crons honour it; if you bump it for RWO, SI follows.
    let leadTimeDays = 0;
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
    console.log(`[SI CRON] leadTimeDays=${leadTimeDays}, cutoff=${cutoff.toISOString()}`);

    const eligibleSnap = await getDocs(query(
      collection(db, 'scheduledInvoices'),
      where('status', '==', 'active'),
      where('nextExecution', '<=', cutoff),
    ));
    const eligible = eligibleSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Array<any>;
    const totalEligible = eligible.length;
    console.log(`[SI CRON] Found ${totalEligible} eligible scheduled invoices`);

    const results: Array<{
      siId: string;
      siNumber?: string;
      title?: string;
      status: 'success' | 'error' | 'skipped';
      message: string;
      invoiceNumber?: string;
      nextExecution?: string;
    }> = [];

    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://groundopscos.vercel.app');

    for (let i = 0; i < eligible.length; i++) {
      const si = eligible[i];
      // Same 5s spacing as RWO cron — guards against Mailgun rate limits
      // when many schedules fire on the same day.
      if (i > 0) await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(`${baseUrl}/api/scheduled-invoices/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledInvoiceId: si.id, triggeredBy: 'cron' }),
        });
        const text = await res.text();
        let parsed: any = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
        if (!res.ok) {
          totalFailed++;
          results.push({
            siId: si.id,
            siNumber: si.scheduledInvoiceNumber,
            title: si.title,
            status: 'error',
            message: parsed?.error || `HTTP ${res.status}: ${text.substring(0, 100)}`,
          });
          continue;
        }
        if (parsed?.alreadyExecuted) {
          totalSkipped++;
          results.push({
            siId: si.id,
            siNumber: si.scheduledInvoiceNumber,
            title: si.title,
            status: 'skipped',
            message: parsed.message || 'Already executed for this date',
            invoiceNumber: parsed.invoiceNumber,
          });
          continue;
        }
        totalSucceeded++;
        results.push({
          siId: si.id,
          siNumber: si.scheduledInvoiceNumber,
          title: si.title,
          status: 'success',
          message: parsed?.message || 'Executed',
          invoiceNumber: parsed?.invoiceNumber,
          nextExecution: parsed?.nextExecution,
        });
      } catch (e: any) {
        totalFailed++;
        console.error(`[SI CRON] Error executing ${si.id}:`, e);
        results.push({
          siId: si.id,
          siNumber: si.scheduledInvoiceNumber,
          title: si.title,
          status: 'error',
          message: e?.message || 'Unknown error',
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

    try {
      await addDoc(collection(db, 'emailLogs'), {
        type: 'cron_run_scheduled_invoices',
        startedAt,
        completedAt,
        durationMs,
        totalEligible,
        totalSucceeded,
        totalFailed,
        totalSkipped,
        status: runStatus,
        triggeredBy,
        results,
        createdAt: serverTimestamp(),
      });
      try {
        await setDoc(doc(db, 'emailLogs', '_schedule_si'), { lastRunAt: serverTimestamp() }, { merge: true });
      } catch {}
    } catch (logErr) {
      console.error('[SI CRON] Failed to log run:', logErr);
    }

    return NextResponse.json({
      message: `Processed ${totalEligible} scheduled invoices`,
      status: runStatus,
      totalEligible,
      totalSucceeded,
      totalFailed,
      totalSkipped,
      durationMs,
      triggeredBy,
      results,
    });
  } catch (error: any) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    console.error('[SI CRON] Fatal:', error);
    try {
      await addDoc(collection(db, 'emailLogs'), {
        type: 'cron_run_scheduled_invoices',
        startedAt,
        completedAt,
        durationMs,
        totalEligible: 0,
        totalSucceeded: 0,
        totalFailed: 0,
        status: 'error',
        triggeredBy,
        error: error?.message || 'Unknown error',
        results: [],
        createdAt: serverTimestamp(),
      });
    } catch {}
    return NextResponse.json({
      error: 'Internal server error',
      details: error?.message || 'Unknown error',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
