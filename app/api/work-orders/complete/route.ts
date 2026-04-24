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

    const { workOrderId, completionDetails, completionNotes, completionImageUrls, subName, billingPhase } =
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

    // Determine billing phase:
    // - If caller explicitly passes 'diagnostic' or 'repair', honor it.
    // - Else fall back to woData.billingPhase if already set (e.g. by repair-decision route).
    // - Else leave undefined (regular non-diagnostic flow — nothing to set).
    const resolvedBillingPhase: 'diagnostic' | 'repair' | undefined =
      billingPhase === 'diagnostic' || billingPhase === 'repair'
        ? billingPhase
        : (woData?.billingPhase === 'diagnostic' || woData?.billingPhase === 'repair')
          ? woData.billingPhase
          : undefined;

    const detailsSuffix =
      resolvedBillingPhase === 'diagnostic'
        ? ' (diagnostic fee will be billed)'
        : resolvedBillingPhase === 'repair'
          ? ' (repair will be billed)'
          : '';

    const timelineEvent = {
      type: 'completed',
      userId: uid,
      userName: subName || 'Subcontractor',
      userRole: 'subcontractor',
      details: `Work order completed by ${subName || 'Subcontractor'}${detailsSuffix}`,
      metadata: {
        completionDetails: (completionDetails || '').substring(0, 100),
        ...(resolvedBillingPhase ? { billingPhase: resolvedBillingPhase } : {}),
      },
      timestamp: Timestamp.now(),
    };

    const updates: Record<string, any> = {
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
    };
    if (resolvedBillingPhase) updates.billingPhase = resolvedBillingPhase;

    await updateDoc(woRef, updates);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking work order complete:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to mark work order complete' },
      { status: 500 },
    );
  }
}
