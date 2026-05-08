import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, getDoc, doc, deleteDoc, query } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';

// Deletes biddingWorkOrders docs whose referenced work orders no longer exist.
// Called once manually; also useful for scheduled cleanup.
export async function POST(_req: NextRequest) {
  try {
    const db = await getServerDb();

    const snap = await getDocs(query(collection(db, 'biddingWorkOrders')));

    const stale: string[] = [];

    await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data() as any;

        // For combined docs, check all workOrderIds; for single docs check workOrderId.
        const ids: string[] = Array.isArray(data.workOrderIds) && data.workOrderIds.length > 0
          ? data.workOrderIds
          : data.workOrderId ? [data.workOrderId] : [];

        if (ids.length === 0) {
          stale.push(d.id);
          return;
        }

        const woSnaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'workOrders', id))));
        const allDeleted = woSnaps.every((s) => !s.exists());
        if (allDeleted) stale.push(d.id);
      }),
    );

    await Promise.all(stale.map((id) => deleteDoc(doc(db, 'biddingWorkOrders', id))));

    return NextResponse.json({ success: true, deleted: stale.length, ids: stale });
  } catch (err: any) {
    console.error('cleanup-bidding error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
