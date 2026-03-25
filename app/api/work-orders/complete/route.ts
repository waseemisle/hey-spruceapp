import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Marks a work order as complete (status → pending_invoice) server-side,
 * bypassing Firestore client rules that restrict subcontractors from writing
 * to the workOrders collection.
 */
export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workOrderId, completionDetails, completionNotes, completionImageUrls, subName } =
      await request.json();

    if (!workOrderId) {
      return NextResponse.json({ error: 'Missing workOrderId' }, { status: 400 });
    }

    const db = await getServerDb();

    const woRef = doc(db, 'workOrders', workOrderId);
    const woSnap = await getDoc(woRef);
    if (!woSnap.exists()) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }

    const woData = woSnap.data();
    const existingTimeline = woData?.timeline || [];
    const existingSysInfo = woData?.systemInformation || {};

    const timelineEvent = {
      type: 'completed',
      userId: uid,
      userName: subName || 'Subcontractor',
      userRole: 'subcontractor',
      details: `Work order completed by ${subName || 'Subcontractor'}`,
      metadata: { completionDetails: (completionDetails || '').substring(0, 100) },
      timestamp: Timestamp.now(),
    };

    await updateDoc(woRef, {
      status: 'pending_invoice',
      completedAt: serverTimestamp(),
      completionDetails: completionDetails || '',
      completionNotes: completionNotes || '',
      completionImages: completionImageUrls || [],
      updatedAt: serverTimestamp(),
      timeline: [...existingTimeline, timelineEvent],
      systemInformation: {
        ...existingSysInfo,
        completion: {
          completedBy: { id: uid, name: subName || 'Subcontractor' },
          timestamp: Timestamp.now(),
          notes: completionDetails || '',
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking work order complete:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to mark work order complete' },
      { status: 500 },
    );
  }
}
