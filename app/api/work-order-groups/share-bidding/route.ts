import { NextRequest, NextResponse } from 'next/server';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
  query,
  where,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';

function makeTimelineEvent(params: {
  type: string;
  userId: string;
  userName: string;
  userRole: string;
  details: string;
  metadata?: Record<string, any>;
}) {
  return {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Timestamp.now(),
    type: params.type,
    userId: params.userId,
    userName: params.userName,
    userRole: params.userRole,
    details: params.details,
    metadata: params.metadata ?? {},
  };
}

export async function POST(req: NextRequest) {
  try {
    const { groupId, selectedSubcontractorIds, clientUid, clientName } = await req.json();

    if (!groupId || !Array.isArray(selectedSubcontractorIds) || selectedSubcontractorIds.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = await getServerDb();

    // Load group
    const groupSnap = await getDoc(doc(db, 'workOrderGroups', groupId));
    if (!groupSnap.exists()) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    const group = { id: groupSnap.id, ...(groupSnap.data() as any) };

    const ids: string[] = Array.isArray(group.workOrderIds) ? group.workOrderIds.map(String) : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Group has no work orders' }, { status: 400 });
    }

    // Load all member work orders
    const woSnaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'workOrders', id))));
    const wos = woSnaps.map((s, i) => s.exists() ? { id: s.id, ...(s.data() as any) } : { id: ids[i] });

    const primaryWo = wos.find((w: any) => w.id === group.primaryWorkOrderId) || wos[0] || {};

    // Load each selected subcontractor
    const subSnaps = await Promise.all(
      selectedSubcontractorIds.map((id: string) => getDoc(doc(db, 'subcontractors', id))),
    );
    const subs = subSnaps
      .filter((s) => s.exists())
      .map((s) => ({ id: s.id, ...(s.data() as any) }));

    if (subs.length === 0) {
      return NextResponse.json({ error: 'No valid subcontractors found' }, { status: 400 });
    }

    // Resolve auth UIDs
    const subAuthIds: string[] = subs.map((s: any) => {
      const u = s.uid != null && String(s.uid).trim() !== '' ? String(s.uid).trim() : '';
      return u || s.id;
    });

    const isFirstShare = !group.biddingSubcontractors?.length;
    const actorUid = clientUid || group.clientId || 'unknown';
    const actorName = clientName || 'Client';

    // Update every member workOrder to status 'bidding'
    await Promise.all(wos.map(async (wo: any) => {
      const woRef = doc(db, 'workOrders', wo.id);
      await updateDoc(woRef, {
        status: 'bidding',
        biddingSubcontractors: arrayUnion(...subAuthIds),
        ...(isFirstShare ? { sharedForBiddingAt: serverTimestamp() } : { biddersLastAddedAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
        timeline: [
          ...(wo.timeline || []),
          makeTimelineEvent({
            type: 'shared_for_bidding',
            userId: actorUid,
            userName: actorName,
            userRole: 'client',
            details: isFirstShare
              ? `Shared with ${subs.length} subcontractor(s) for bidding (via combined group)`
              : `Added ${subs.length} more bidder(s) (via combined group)`,
            metadata: { groupId, subcontractorIds: subAuthIds },
          }),
        ],
      });
    }));

    // For each subcontractor: delete any stale per-WO docs for this group, then create ONE group doc
    await Promise.all(subs.map(async (sub: any, idx: number) => {
      const authId = subAuthIds[idx];

      // Delete stale individual biddingWorkOrders docs that were created for this group
      const staleSnap = await getDocs(
        query(
          collection(db, 'biddingWorkOrders'),
          where('groupId', '==', groupId),
          where('subcontractorId', '==', authId),
        ),
      );
      await Promise.all(staleSnap.docs.map((d) => deleteDoc(d.ref)));

      // Create ONE combined biddingWorkOrders doc for this subcontractor
      await addDoc(collection(db, 'biddingWorkOrders'), {
        // Group identity
        groupId,
        workOrderIds: ids,
        workOrderId: primaryWo.id || ids[0],

        // Display fields (from primary WO)
        workOrderNumber: `GROUP-${groupId.slice(0, 8)}`,
        workOrderTitle: `Combined Work Orders (${ids.length} orders)`,
        workOrderDescription: primaryWo.description || '',
        clientId: primaryWo.clientId || group.clientId || actorUid,
        clientName: primaryWo.clientName || '',
        priority: primaryWo.priority || '',
        category: primaryWo.category || '',
        locationName: primaryWo.locationName || '',
        locationAddress: primaryWo.locationAddress || '',
        images: primaryWo.images || [],
        estimateBudget: null,

        // All WO summaries for the detail view
        workOrderDetails: wos.map((w: any) => ({
          id: w.id,
          workOrderNumber: w.workOrderNumber || w.id,
          title: w.title || '',
          category: w.category || '',
          description: w.description || '',
          priority: w.priority || '',
          locationName: w.locationName || '',
          locationAddress: w.locationAddress || '',
          status: w.status || '',
          images: w.images || [],
        })),

        // Subcontractor
        subcontractorId: authId,
        subcontractorName: sub.fullName,
        subcontractorEmail: sub.email,

        status: 'pending',
        sharedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    }));

    // Update the group doc
    await updateDoc(doc(db, 'workOrderGroups', groupId), {
      status: 'bidding',
      biddingSubcontractors: arrayUnion(...subAuthIds),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      subAuthIds,
      subcontractors: subs.map((s: any) => ({
        id: s.id,
        fullName: s.fullName,
        email: s.email,
      })),
      isFirstShare,
      woCount: ids.length,
    });
  } catch (err: any) {
    console.error('share-bidding API error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
