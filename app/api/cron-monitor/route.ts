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
      const snap = await getDocs(query(
        collection(db, 'cronJobRuns'),
        orderBy('createdAt', 'desc'),
        limit(50),
      ));
      runs = snap.docs.filter(d => d.id !== '_schedule').map(d => {
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
    } catch (e: any) {
      // Collection might not exist yet
      console.log('cronJobRuns query error:', e.message);
    }

    // Fetch schedule settings
    let schedule = { intervalMinutes: 60, lastRunAt: null as string | null };
    try {
      const settingsSnap = await getDoc(doc(db, 'cronJobRuns', '_schedule'));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        schedule.intervalMinutes = data.intervalMinutes || 60;
        schedule.lastRunAt = data.lastRunAt?.toDate?.()?.toISOString() || null;
      }
    } catch {}

    return NextResponse.json({ runs, schedule });
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

    await setDoc(doc(db, 'cronJobRuns', '_schedule'), {
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

    for (const rwo of recurringWorkOrders) {
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
    await addDoc(collection(db, 'cronJobRuns'), {
      startedAt, completedAt, durationMs,
      totalEligible, totalSucceeded, totalFailed,
      status: runStatus, triggeredBy: 'manual_api',
      results, createdAt: serverTimestamp(),
    });

    // Update lastRunAt
    try {
      await setDoc(doc(db, 'cronJobRuns', '_schedule'), { lastRunAt: serverTimestamp() }, { merge: true });
    } catch {}

    return NextResponse.json({
      message: `Processed ${totalEligible} recurring work orders`,
      status: runStatus, totalEligible, totalSucceeded, totalFailed, durationMs, results,
    });
  } catch (error: any) {
    // Log failure
    try {
      await addDoc(collection(db, 'cronJobRuns'), {
        startedAt, completedAt: new Date(), durationMs: Date.now() - startedAt.getTime(),
        totalEligible: 0, totalSucceeded: 0, totalFailed: 0,
        status: 'error', triggeredBy: 'manual_api',
        error: error.message, results: [], createdAt: serverTimestamp(),
      });
    } catch {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
