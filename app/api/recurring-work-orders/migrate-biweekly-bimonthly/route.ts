import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One-time migration: updates existing BI-WEEKLY and BI-MONTHLY recurring work orders
 * to use the corrected interval values.
 *
 * BI-WEEKLY: was interval=1, mode=daily (twice a week) → now interval=2, mode=weekly (every 2 weeks)
 * BI-MONTHLY: was interval=1, mode=monthly (twice a month) → now interval=2, mode=monthly (every 2 months)
 *
 * Also recalculates nextExecution based on the new interval.
 */
export async function POST(request: NextRequest) {
  try {
    const db = await getServerDb();
    const snapshot = await getDocs(collection(db, 'recurringWorkOrders'));

    const updates: { id: string; label: string; changes: Record<string, any> }[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const label = (data.recurrencePatternLabel || '').toUpperCase();
      const pattern = data.recurrencePattern || {};

      if (label === 'BI-WEEKLY') {
        // Fix: interval 1 → 2, type daily → weekly
        const newPattern = {
          ...pattern,
          type: 'weekly',
          interval: 2,
        };

        // Recalculate nextExecution: from the last execution or start date, advance 2 weeks
        let nextExecution: Date | null = null;
        const lastExec = data.lastExecution?.toDate?.() || data.nextExecution?.toDate?.();
        const startDate = pattern.startDate?.toDate?.() || pattern.startDate;
        const anchor = lastExec || (startDate ? new Date(startDate) : new Date());

        if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
          // Use the first (and now only) day of week
          const targetDay = pattern.daysOfWeek[0];
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          let candidate = new Date(anchor);
          candidate.setDate(candidate.getDate() + 1); // advance past current
          // Find the next occurrence of targetDay
          while (candidate.getDay() !== targetDay) {
            candidate.setDate(candidate.getDate() + 1);
          }
          // If that's in the past, keep advancing by 2 weeks until future
          while (candidate <= now) {
            candidate.setDate(candidate.getDate() + 14);
          }
          nextExecution = candidate;
          // Keep only the first day in daysOfWeek
          newPattern.daysOfWeek = [targetDay];
        } else {
          // No daysOfWeek — just advance 2 weeks from anchor
          const candidate = new Date(anchor);
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          candidate.setDate(candidate.getDate() + 14);
          while (candidate <= now) {
            candidate.setDate(candidate.getDate() + 14);
          }
          nextExecution = candidate;
        }

        const changes: Record<string, any> = {
          recurrencePattern: newPattern,
          updatedAt: serverTimestamp(),
        };
        if (nextExecution) {
          changes.nextExecution = nextExecution;
        }

        updates.push({ id: docSnap.id, label, changes });
      } else if (label === 'BI-MONTHLY') {
        // Fix: interval 1 → 2, keep type monthly
        const newPattern = {
          ...pattern,
          type: 'monthly',
          interval: 2,
        };

        // If daysOfMonth had 2 entries (old "twice a month"), keep only the first
        if (Array.isArray(pattern.daysOfMonth) && pattern.daysOfMonth.length > 1) {
          newPattern.daysOfMonth = [pattern.daysOfMonth[0]];
          newPattern.dayOfMonth = pattern.daysOfMonth[0];
        }

        // Recalculate nextExecution: from anchor, find next occurrence on the target day of month, every 2 months
        let nextExecution: Date | null = null;
        const lastExec = data.lastExecution?.toDate?.() || data.nextExecution?.toDate?.();
        const startDate = pattern.startDate?.toDate?.() || pattern.startDate;
        const anchor = lastExec || (startDate ? new Date(startDate) : new Date());
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const targetDays = newPattern.daysOfMonth || (newPattern.dayOfMonth ? [newPattern.dayOfMonth] : [1]);
        const targetDay = targetDays[0];

        // Start from anchor month, find next valid date every 2 months
        let cursor = new Date(anchor);
        cursor.setDate(1); // start of month
        let iters = 0;
        while (iters < 24) {
          const lastDayOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
          const actualDay = Math.min(targetDay, lastDayOfMonth);
          const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), actualDay, 9, 0, 0);
          if (candidate > now) {
            nextExecution = candidate;
            break;
          }
          cursor.setMonth(cursor.getMonth() + 2); // advance 2 months
          iters++;
        }

        const changes: Record<string, any> = {
          recurrencePattern: newPattern,
          updatedAt: serverTimestamp(),
        };
        if (nextExecution) {
          changes.nextExecution = nextExecution;
        }

        updates.push({ id: docSnap.id, label, changes });
      }
    }

    // Apply all updates
    for (const update of updates) {
      await updateDoc(doc(db, 'recurringWorkOrders', update.id), update.changes);
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updates.length} recurring work orders`,
      details: updates.map(u => ({
        id: u.id,
        label: u.label,
        nextExecution: u.changes.nextExecution?.toISOString?.() || u.changes.nextExecution || 'unchanged',
      })),
    });
  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
