import { NextRequest, NextResponse } from 'next/server';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
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
    } catch (e: any) {
      // Collection might not exist yet
      console.log('cronJobRuns query error:', e.message);
    }

    // Fetch schedule settings
    let schedule = { intervalMinutes: 60, lastRunAt: null as string | null };
    try {
      const settingsSnap = await getDoc(doc(db, 'systemSettings', 'cronSchedule'));
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

    await setDoc(doc(db, 'systemSettings', 'cronSchedule'), {
      intervalMinutes,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true, intervalMinutes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
