import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, getDoc, addDoc, setDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Verify cron authorization
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` ||
      authHeader === cronSecret;
    if (!isAuthorized) {
      console.error('[CRON AUTH FAILED]', {
        headerPrefix: authHeader.substring(0, 30),
        secretLength: cronSecret.length,
        userAgent: request.headers.get('user-agent')?.substring(0, 50),
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const startedAt = new Date();
  console.log(`[CRON] Started at ${startedAt.toISOString()}`);

  // Detect trigger source
  const userAgent = request.headers.get('user-agent') || '';
  const triggeredBy = userAgent.includes('vercel-cron') || userAgent.includes('Vercel')
    ? 'vercel_cron'
    : 'manual_api';

  let db: any;
  try {
    db = await getServerDb();
  } catch (error) {
    console.error('[CRON] Failed to connect to Firestore:', error);
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  try {
    const now = new Date();

    // ── Check user-configured schedule ──
    // Vercel fires every 5 min, but we only proceed if enough time has passed
    // based on the admin-configured interval. Manual triggers always run.
    if (triggeredBy === 'vercel_cron') {
      try {
        const settingsSnap = await getDoc(doc(db, 'emailLogs', '_schedule'));
        if (settingsSnap.exists()) {
          const settings = settingsSnap.data();
          const intervalMinutes = settings.intervalMinutes || 60;
          const lastRunAt = settings.lastRunAt?.toDate?.();
          if (lastRunAt) {
            const minutesSinceLastRun = (now.getTime() - lastRunAt.getTime()) / 60000;
            if (minutesSinceLastRun < intervalMinutes - 1) {
              // Not time yet — skip this run silently
              return NextResponse.json({
                message: 'Skipped — not due yet',
                nextRunIn: `${Math.ceil(intervalMinutes - minutesSinceLastRun)} minutes`,
                intervalMinutes,
              });
            }
          }
        }
      } catch (e) {
        console.log('[CRON] No schedule settings found, running anyway');
      }

      // Lock: update lastRunAt NOW to prevent duplicate runs
      try {
        await setDoc(doc(db, 'emailLogs', '_schedule'), { lastRunAt: serverTimestamp() }, { merge: true });
      } catch {}
    }

    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // Find all active recurring work orders whose nextExecution is today or past
    const recurringWorkOrdersQuery = query(
      collection(db, 'recurringWorkOrders'),
      where('status', '==', 'active'),
      where('nextExecution', '<=', endOfDay)
    );

    const snapshot = await getDocs(recurringWorkOrdersQuery);
    const recurringWorkOrders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const totalEligible = recurringWorkOrders.length;
    console.log(`[CRON] Found ${totalEligible} eligible recurring work orders`);

    const results: Array<{
      rwoId: string;
      rwoTitle: string;
      status: 'success' | 'error';
      message: string;
      executionId?: string;
      nextExecution?: string;
    }> = [];

    let totalSucceeded = 0;
    let totalFailed = 0;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://groundopscos.vercel.app');
    console.log(`[CRON] Using base URL: ${baseUrl}`);

    for (let i = 0; i < recurringWorkOrders.length; i++) {
      const rwo = recurringWorkOrders[i];
      // Delay between executions to avoid Mailgun rate limits (each execution sends 2-3 emails)
      if (i > 0) await new Promise(r => setTimeout(r, 2000));
      try {
        const executeResponse = await fetch(`${baseUrl}/api/recurring-work-orders/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recurringWorkOrderId: rwo.id,
            triggeredBy: 'cron',
          }),
        });

        const responseText = await executeResponse.text();
        let executeResult: any;
        try {
          executeResult = JSON.parse(responseText);
        } catch {
          // Response is not JSON (likely HTML error page)
          totalFailed++;
          results.push({
            rwoId: rwo.id,
            rwoTitle: (rwo as any).title || rwo.id,
            status: 'error',
            message: `HTTP ${executeResponse.status}: ${responseText.substring(0, 100)}`,
          });
          continue;
        }

        if (executeResponse.ok) {
          totalSucceeded++;
          results.push({
            rwoId: rwo.id,
            rwoTitle: (rwo as any).title || rwo.id,
            status: 'success',
            message: executeResult.message || 'Executed successfully',
            executionId: executeResult.executionId,
            nextExecution: executeResult.nextExecution,
          });
        } else {
          totalFailed++;
          results.push({
            rwoId: rwo.id,
            rwoTitle: (rwo as any).title || rwo.id,
            status: 'error',
            message: executeResult.error || executeResult.details || 'Execution failed',
          });
        }
      } catch (error) {
        totalFailed++;
        console.error(`[CRON] Error executing ${rwo.id}:`, error);
        results.push({
          rwoId: rwo.id,
          rwoTitle: (rwo as any).title || rwo.id,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // ── Log this cron run to Firestore ──
    const runStatus = totalFailed === 0
      ? 'completed'
      : totalSucceeded === 0
      ? 'failed'
      : 'partial';

    try {
      await addDoc(collection(db, 'emailLogs'), {
        type: 'cron_run',
        startedAt,
        completedAt,
        durationMs,
        totalEligible,
        totalSucceeded,
        totalFailed,
        status: runStatus,
        triggeredBy,
        results,
        createdAt: serverTimestamp(),
      });
      // Update lastRunAt so the schedule check knows when we last ran
      try {
        const settingsRef = doc(db, 'emailLogs', '_schedule');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          await updateDoc(settingsRef, { lastRunAt: serverTimestamp() });
        }
      } catch {}
      console.log(`[CRON] Logged run: ${runStatus} | ${totalSucceeded}/${totalEligible} succeeded | ${durationMs}ms`);
    } catch (logError) {
      console.error('[CRON] Failed to log run to Firestore:', logError);
    }

    return NextResponse.json({
      message: `Processed ${totalEligible} recurring work orders`,
      status: runStatus,
      totalEligible,
      totalSucceeded,
      totalFailed,
      durationMs,
      triggeredBy,
      results,
    });

  } catch (error) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    console.error('[CRON] Fatal error:', error);

    // Log the failure
    try {
      await addDoc(collection(db, 'emailLogs'), {
        type: 'cron_run',
        startedAt,
        completedAt,
        durationMs,
        totalEligible: 0,
        totalSucceeded: 0,
        totalFailed: 0,
        status: 'error',
        triggeredBy,
        error: error instanceof Error ? error.message : 'Unknown error',
        results: [],
        createdAt: serverTimestamp(),
      });
    } catch {}

    if (error instanceof Error && error.message.includes('index')) {
      return NextResponse.json({
        error: 'Firestore index required',
        details: error.message,
      }, { status: 500 });
    }

    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
