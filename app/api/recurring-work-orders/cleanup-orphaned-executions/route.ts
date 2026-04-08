import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One-time cleanup: finds execution records whose linked workOrderId points to
 * a work order that no longer exists, and deletes them.
 */
export async function POST(request: NextRequest) {
  try {
    const db = await getServerDb();

    const execSnapshot = await getDocs(collection(db, 'recurringWorkOrderExecutions'));

    const deleted: { execId: string; rwoId: string; workOrderId: string; scheduledDate: string }[] = [];
    const kept: number = execSnapshot.docs.length;

    // Cache work order existence checks to avoid redundant reads
    const workOrderExists = new Map<string, boolean>();

    for (const execDoc of execSnapshot.docs) {
      const data = execDoc.data();
      const workOrderId = data.workOrderId;

      // Only check executions that claim to have a linked work order
      if (!workOrderId) continue;

      // Check cache first
      if (!workOrderExists.has(workOrderId)) {
        const woDoc = await getDoc(doc(db, 'workOrders', workOrderId));
        workOrderExists.set(workOrderId, woDoc.exists());
      }

      if (!workOrderExists.get(workOrderId)) {
        // Work order doesn't exist — delete this execution record
        const scheduledDate = data.scheduledDate?.toDate?.()?.toISOString() || 'unknown';
        deleted.push({
          execId: execDoc.id,
          rwoId: data.recurringWorkOrderId || 'unknown',
          workOrderId,
          scheduledDate,
        });
        await deleteDoc(doc(db, 'recurringWorkOrderExecutions', execDoc.id));
      }
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${deleted.length} orphaned execution records (out of ${kept} total). ${kept - deleted.length} remain.`,
      deleted,
    });
  } catch (error: any) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
