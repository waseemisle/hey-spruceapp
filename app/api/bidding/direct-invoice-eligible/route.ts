import { NextResponse } from 'next/server';
import { getBearerUid } from '@/lib/api-verify-firebase';
import { getServerDb } from '@/lib/firebase-server';
import { doc, getDoc } from 'firebase/firestore';

export async function GET(request: Request) {
  const uid = await getBearerUid(request);
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.get('ids') ?? '';
  const ids = rawIds.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);

  if (ids.length === 0) return NextResponse.json({ eligibleIds: [] });

  const db = await getServerDb();
  const eligibleIds: string[] = [];

  await Promise.all(ids.map(async (biddingId) => {
    try {
      const bSnap = await getDoc(doc(db, 'biddingWorkOrders', biddingId));
      if (!bSnap.exists()) return;
      const bData = bSnap.data();
      if (bData.subcontractorId !== uid) return;

      // Fast path: flag already denormalized on the doc
      if (bData.allowSubDirectInvoiceFromBidding === true) {
        eligibleIds.push(biddingId);
        return;
      }

      // Resolve companyId — try biddingWorkOrders.companyId first, then
      // workOrders.companyId, then clients.companyId
      let companyId: string | null = bData.companyId || null;

      if (!companyId && bData.workOrderId) {
        const woSnap = await getDoc(doc(db, 'workOrders', bData.workOrderId));
        if (woSnap.exists()) {
          companyId = woSnap.data().companyId || null;
        }
      }

      if (!companyId && bData.clientId) {
        const clientSnap = await getDoc(doc(db, 'clients', bData.clientId));
        if (clientSnap.exists()) {
          companyId = clientSnap.data().companyId || null;
        }
      }

      if (!companyId) return;

      const compSnap = await getDoc(doc(db, 'companies', companyId));
      if (compSnap.exists() && compSnap.data().allowSubDirectInvoiceFromBidding === true) {
        eligibleIds.push(biddingId);
      }
    } catch {
      // Non-fatal: skip this ID
    }
  }));

  return NextResponse.json({ eligibleIds });
}
