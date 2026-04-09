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
    let schedule = { intervalMinutes: 60, lastRunAt: null as string | null };
    try {
      const settingsSnap = await getDoc(doc(db, 'emailLogs', '_schedule'));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        schedule.intervalMinutes = data.intervalMinutes || 60;
        schedule.lastRunAt = data.lastRunAt?.toDate?.()?.toISOString() || null;
      }
    } catch {}

    // Fetch overdue/eligible RWOs
    let overdue: any[] = [];
    try {
      const now = new Date();
      const rwoSnap = await getDocs(query(
        collection(db, 'recurringWorkOrders'),
        where('status', '==', 'active'),
      ));
      rwoSnap.docs.forEach(d => {
        const data = d.data();
        const next = data.nextExecution?.toDate?.();
        if (next && next <= now) {
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

    return NextResponse.json({ runs, schedule, overdue });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await getServerDb();
    const { intervalMinutes } = await request.json();

    if (!intervalMinutes || typeof intervalMinutes !== 'number' || intervalMinutes < 5) {
      return NextResponse.json({ error: 'Invalid interval' }, { status: 400 });
    }

    await setDoc(doc(db, 'emailLogs', '_schedule'), {
      intervalMinutes,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true, intervalMinutes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT — Manually trigger the cron logic (no CRON_SECRET needed)
 * This is called by the "Run Cron Now" button on the admin page.
 */
export async function PUT(request: NextRequest) {
  const startedAt = new Date();
  let db: any;
  try {
    db = await getServerDb();
  } catch (error: any) {
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  try {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const snapshot = await getDocs(query(
      collection(db, 'recurringWorkOrders'),
      where('status', '==', 'active'),
      where('nextExecution', '<=', endOfDay),
    ));

    const recurringWorkOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalEligible = recurringWorkOrders.length;

    const results: any[] = [];
    let totalSucceeded = 0;
    let totalFailed = 0;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;

    for (let i = 0; i < recurringWorkOrders.length; i++) {
      const rwo = recurringWorkOrders[i];
      if (i > 0) await new Promise(r => setTimeout(r, 5000)); // 5s gap to avoid rate limits
      try {
        const res = await fetch(`${baseUrl}/api/recurring-work-orders/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recurringWorkOrderId: rwo.id, triggeredBy: 'manual_admin' }),
        });
        const data = await res.json();
        if (res.ok) {
          totalSucceeded++;
          results.push({ rwoId: rwo.id, rwoTitle: (rwo as any).title || rwo.id, status: 'success', message: data.message || 'OK', executionId: data.executionId });
        } else {
          totalFailed++;
          results.push({ rwoId: rwo.id, rwoTitle: (rwo as any).title || rwo.id, status: 'error', message: data.error || data.details || 'Failed' });
        }
      } catch (e: any) {
        totalFailed++;
        results.push({ rwoId: rwo.id, rwoTitle: (rwo as any).title || rwo.id, status: 'error', message: e.message });
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const runStatus = totalFailed === 0 ? 'completed' : totalSucceeded === 0 ? 'failed' : 'partial';

    // Log to Firestore
    await addDoc(collection(db, 'emailLogs'), {
      type: 'cron_run',
      startedAt, completedAt, durationMs,
      totalEligible, totalSucceeded, totalFailed,
      status: runStatus, triggeredBy: 'manual_api',
      results, createdAt: serverTimestamp(),
    });

    // NOTE: Do NOT update _schedule.lastRunAt here.
    // Only the Vercel cron route updates lastRunAt.
    // If we update it here, the next Vercel cron trigger will see
    // "ran recently" and skip, pushing execution out another full day.

    return NextResponse.json({
      message: `Processed ${totalEligible} recurring work orders`,
      status: runStatus, totalEligible, totalSucceeded, totalFailed, durationMs, results,
    });
  } catch (error: any) {
    // Log failure
    try {
      await addDoc(collection(db, 'emailLogs'), {
        type: 'cron_run',
        startedAt, completedAt: new Date(), durationMs: Date.now() - startedAt.getTime(),
        totalEligible: 0, totalSucceeded: 0, totalFailed: 0,
        status: 'error', triggeredBy: 'manual_api',
        error: error.message, results: [], createdAt: serverTimestamp(),
      });
    } catch {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
