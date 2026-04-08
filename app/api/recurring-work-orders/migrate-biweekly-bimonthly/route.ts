import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One-time migration (v3): fixes existing BI-WEEKLY and BI-MONTHLY recurring work orders.
 *
 * 1. Reads execution history to determine the correct target day (most reliable source).
 * 2. Updates recurrencePattern on the parent document (interval, type, daysOfMonth/daysOfWeek).
 * 3. Deletes future non-executed execution records generated on the old wrong schedule.
 * 4. Recalculates nextExecution on the parent document.
 */
export async function POST(request: NextRequest) {
  try {
    const db = await getServerDb();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Step 1: Find all BI-WEEKLY and BI-MONTHLY recurring work orders
    const rwoSnapshot = await getDocs(collection(db, 'recurringWorkOrders'));
    const results: any[] = [];

    for (const docSnap of rwoSnapshot.docs) {
      const data = docSnap.data();
      const label = (data.recurrencePatternLabel || '').toUpperCase();

      if (label !== 'BI-WEEKLY' && label !== 'BI-MONTHLY') continue;

      const pattern = data.recurrencePattern || {};

      // Read execution history to determine the correct target day
      const execQuery = query(
        collection(db, 'recurringWorkOrderExecutions'),
        where('recurringWorkOrderId', '==', docSnap.id)
      );
      const execSnapshot = await getDocs(execQuery);

      // Find executed records to determine the actual pattern day
      const executedDates: Date[] = [];
      const futureNonExecutedIds: string[] = [];

      for (const execDoc of execSnapshot.docs) {
        const execData = execDoc.data();
        const scheduledDate = execData.scheduledDate?.toDate?.();
        const status = execData.status;
        const hasWorkOrder = !!(execData as any).workOrderId;
        const isDone = status === 'executed' || status === 'failed' || hasWorkOrder;

        if (scheduledDate && isDone) {
          executedDates.push(scheduledDate);
        } else if (scheduledDate && scheduledDate >= now && !isDone) {
          futureNonExecutedIds.push(execDoc.id);
        }
      }

      // Sort executed dates descending
      executedDates.sort((a, b) => b.getTime() - a.getTime());

      if (label === 'BI-MONTHLY') {
        // Determine target day of month from execution history or existing pattern
        let targetDay: number;
        if (executedDates.length > 0) {
          // Use the most common day-of-month from executed records
          const dayCounts = new Map<number, number>();
          for (const d of executedDates) {
            const dom = d.getDate();
            dayCounts.set(dom, (dayCounts.get(dom) || 0) + 1);
          }
          targetDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        } else if (Array.isArray(pattern.daysOfMonth) && pattern.daysOfMonth.length > 0) {
          targetDay = pattern.daysOfMonth[0];
        } else if (pattern.dayOfMonth) {
          targetDay = pattern.dayOfMonth;
        } else {
          targetDay = 1;
        }

        const newPattern = {
          ...pattern,
          type: 'monthly',
          interval: 2,
          daysOfMonth: [targetDay],
          dayOfMonth: targetDay,
        };

        // Calculate nextExecution: find next occurrence of targetDay, every 2 months from last execution
        let nextExecution: Date | null = null;
        const lastExecDate = executedDates.length > 0 ? executedDates[0] : null;
        const startDate = pattern.startDate?.toDate?.() || (pattern.startDate ? new Date(pattern.startDate) : null);
        const anchor = lastExecDate || startDate || new Date();

        // Start from anchor month, advance by 2 months until we find a future date
        let cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 9, 0, 0);
        // Move to next interval from anchor
        cursor.setMonth(cursor.getMonth() + 2);
        let iters = 0;
        while (iters < 24) {
          const lastDayOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
          const actualDay = Math.min(targetDay, lastDayOfMonth);
          const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), actualDay, 9, 0, 0);
          if (candidate > now) {
            nextExecution = candidate;
            break;
          }
          cursor.setMonth(cursor.getMonth() + 2);
          iters++;
        }

        // Delete future non-executed records (generated on old monthly schedule)
        for (const execId of futureNonExecutedIds) {
          await deleteDoc(doc(db, 'recurringWorkOrderExecutions', execId));
        }

        const changes: Record<string, any> = {
          recurrencePattern: newPattern,
          updatedAt: serverTimestamp(),
        };
        if (nextExecution) changes.nextExecution = nextExecution;

        await updateDoc(doc(db, 'recurringWorkOrders', docSnap.id), changes);

        results.push({
          id: docSnap.id,
          label,
          targetDay,
          executedCount: executedDates.length,
          deletedFutureExecs: futureNonExecutedIds.length,
          nextExecution: nextExecution?.toISOString() || 'unchanged',
          previousDaysOfMonth: pattern.daysOfMonth,
          previousDayOfMonth: pattern.dayOfMonth,
        });

      } else if (label === 'BI-WEEKLY') {
        // Determine target day of week from execution history or existing pattern
        let targetDayOfWeek: number;
        if (executedDates.length > 0) {
          // Use the most common day-of-week from executed records
          const dayCounts = new Map<number, number>();
          for (const d of executedDates) {
            const dow = d.getDay();
            dayCounts.set(dow, (dayCounts.get(dow) || 0) + 1);
          }
          targetDayOfWeek = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        } else if (Array.isArray(pattern.daysOfWeek) && pattern.daysOfWeek.length > 0) {
          targetDayOfWeek = pattern.daysOfWeek[0];
        } else {
          targetDayOfWeek = 1; // default to Monday
        }

        const newPattern = {
          ...pattern,
          type: 'weekly',
          interval: 2,
          daysOfWeek: [targetDayOfWeek],
        };

        // Calculate nextExecution
        let nextExecution: Date | null = null;
        const lastExecDate = executedDates.length > 0 ? executedDates[0] : null;
        const startDate = pattern.startDate?.toDate?.() || (pattern.startDate ? new Date(pattern.startDate) : null);
        const anchor = lastExecDate || startDate || new Date();

        let candidate = new Date(anchor);
        candidate.setHours(9, 0, 0, 0);
        candidate.setDate(candidate.getDate() + 1); // advance past current
        // Find next occurrence of target day
        while (candidate.getDay() !== targetDayOfWeek) {
          candidate.setDate(candidate.getDate() + 1);
        }
        // If within 7 days of last execution, skip ahead to 2 weeks from last
        if (lastExecDate) {
          const twoWeeksAfterLast = new Date(lastExecDate);
          twoWeeksAfterLast.setDate(twoWeeksAfterLast.getDate() + 14);
          twoWeeksAfterLast.setHours(0, 0, 0, 0);
          while (candidate < twoWeeksAfterLast) {
            candidate.setDate(candidate.getDate() + 14);
          }
        }
        // Make sure it's in the future
        while (candidate <= now) {
          candidate.setDate(candidate.getDate() + 14);
        }
        nextExecution = candidate;

        // Delete future non-executed records
        for (const execId of futureNonExecutedIds) {
          await deleteDoc(doc(db, 'recurringWorkOrderExecutions', execId));
        }

        const changes: Record<string, any> = {
          recurrencePattern: newPattern,
          updatedAt: serverTimestamp(),
        };
        if (nextExecution) changes.nextExecution = nextExecution;

        await updateDoc(doc(db, 'recurringWorkOrders', docSnap.id), changes);

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        results.push({
          id: docSnap.id,
          label,
          targetDayOfWeek: dayNames[targetDayOfWeek],
          executedCount: executedDates.length,
          deletedFutureExecs: futureNonExecutedIds.length,
          nextExecution: nextExecution?.toISOString() || 'unchanged',
          previousDaysOfWeek: pattern.daysOfWeek,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migrated ${results.length} recurring work orders`,
      results,
    });
  } catch (error: any) {
    console.error('Migration v3 error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
