import { NextRequest, NextResponse } from 'next/server';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
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

    // Resolve auth UIDs for subcontractors
    const subAuthIds: string[] = subs.map((s) => {
      const u = s.uid != null && String(s.uid).trim() !== '' ? String(s.uid).trim() : '';
      return u || s.id;
    });

    const isFirstShare = !group.biddingSubcontractors?.length;
    const actorUid = clientUid || group.clientId || 'unknown';
    const actorName = clientName || 'Client';

    // Load each work order and do all writes
    await Promise.all(ids.map(async (woId: string) => {
      const woRef = doc(db, 'workOrders', woId);
      const woSnap = await getDoc(woRef);
      const woData = woSnap.exists() ? (woSnap.data() as any) : {};

      await updateDoc(woRef, {
        status: 'bidding',
        biddingSubcontractors: arrayUnion(...subAuthIds),
        ...(isFirstShare ? { sharedForBiddingAt: serverTimestamp() } : { biddersLastAddedAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
        timeline: [
          ...(woData.timeline || []),
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

      // Create biddingWorkOrders for each sub
      await Promise.all(subs.map(async (sub: any) => {
        const authId = sub.uid?.trim() || sub.id;
        await addDoc(collection(db, 'biddingWorkOrders'), {
          workOrderId: woId,
          workOrderNumber: woData.workOrderNumber || woId,
          subcontractorId: authId,
          subcontractorName: sub.fullName,
          subcontractorEmail: sub.email,
          workOrderTitle: woData.title || '',
          workOrderDescription: woData.description || '',
          clientId: woData.clientId || group.clientId || actorUid,
          clientName: woData.clientName || '',
          priority: woData.priority || '',
          category: woData.category || '',
          locationName: woData.locationName || '',
          locationAddress: woData.locationAddress || '',
          images: woData.images || [],
          estimateBudget: woData.estimateBudget ?? null,
          groupId,
          status: 'pending',
          sharedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }));
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
