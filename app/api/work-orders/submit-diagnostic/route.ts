import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Subcontractor submits a diagnostic visit for a work order.
 * Moves status accepted_by_subcontractor → diagnostic_submitted.
 * Idempotency: refuses if diagnosticSubmittedAt is already set.
 */
export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { workOrderId, diagnosticFee, diagnosticNotes, subName } = await request.json();

    if (!workOrderId) {
      return NextResponse.json({ error: 'Missing workOrderId' }, { status: 400 });
    }
    const feeNum = Number(diagnosticFee);
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      return NextResponse.json({ error: 'Invalid diagnostic fee' }, { status: 400 });
    }

    const db = await getServerDb();
    const woRef = doc(db, 'workOrders', workOrderId);
    const woSnap = await getDoc(woRef);
    if (!woSnap.exists()) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }
    const woData = woSnap.data();

    // Authorization: the caller must be the assigned subcontractor
    const assignedSub = woData.assignedSubcontractor || woData.assignedTo;
    if (assignedSub !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Idempotency guard: only one diagnostic per work order
    if (woData.diagnosticSubmittedAt || woData.status === 'diagnostic_submitted'
        || woData.status === 'repair_approved' || woData.status === 'repair_declined') {
      return NextResponse.json({ error: 'Diagnostic has already been submitted for this work order' }, { status: 409 });
    }

    // Must be in the accepted state to submit diagnostic
    if (woData.status !== 'accepted_by_subcontractor' && woData.status !== 'assigned') {
      return NextResponse.json(
        { error: `Cannot submit diagnostic from status "${woData.status}"` },
        { status: 409 },
      );
    }

    const existingTimeline = woData.timeline || [];
    const existingSysInfo = woData.systemInformation || {};
    const now = Timestamp.now();

    const timelineEvent = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      type: 'diagnostic_submitted',
      userId: uid,
      userName: subName || 'Subcontractor',
      userRole: 'subcontractor',
      details: `Diagnostic submitted by ${subName || 'Subcontractor'} — fee $${feeNum.toFixed(2)}`,
      metadata: {
        diagnosticFee: feeNum,
        diagnosticNotes: (diagnosticNotes || '').substring(0, 200),
      },
    };

    await updateDoc(woRef, {
      status: 'diagnostic_submitted',
      diagnosticFee: feeNum,
      diagnosticNotes: diagnosticNotes || '',
      diagnosticSubmittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      timeline: [...existingTimeline, timelineEvent],
      systemInformation: {
        ...existingSysInfo,
        diagnosticSubmission: {
          submittedBy: { id: uid, name: subName || 'Subcontractor' },
          timestamp: now,
          fee: feeNum,
          notes: diagnosticNotes || '',
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error submitting diagnostic:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit diagnostic' },
      { status: 500 },
    );
  }
}
