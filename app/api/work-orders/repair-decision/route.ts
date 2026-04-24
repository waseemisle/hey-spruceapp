import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, isUserAdmin } from '@/lib/api-verify-firebase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin approves or declines a diagnostic, driving the repair billing phase.
 * - approve  → status=repair_approved, billingPhase='repair'    (sub will submit repair quote next)
 * - decline  → status=repair_declined, billingPhase='diagnostic' (sub will mark complete, bill $69)
 */
export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getServerDb();
    if (!(await isUserAdmin(db, uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { workOrderId, decision, adminName } = await request.json();
    if (!workOrderId) {
      return NextResponse.json({ error: 'Missing workOrderId' }, { status: 400 });
    }
    if (decision !== 'approve' && decision !== 'decline') {
      return NextResponse.json({ error: 'decision must be "approve" or "decline"' }, { status: 400 });
    }

    const woRef = doc(db, 'workOrders', workOrderId);
    const woSnap = await getDoc(woRef);
    if (!woSnap.exists()) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }
    const woData = woSnap.data();

    if (woData.status !== 'diagnostic_submitted') {
      return NextResponse.json(
        { error: `Repair decision requires status "diagnostic_submitted" (current: ${woData.status})` },
        { status: 409 },
      );
    }

    const now = Timestamp.now();
    const existingTimeline = woData.timeline || [];
    const existingSysInfo = woData.systemInformation || {};
    const approved = decision === 'approve';

    const timelineEvent = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      type: approved ? 'repair_approved' : 'repair_declined',
      userId: uid,
      userName: adminName || 'Admin',
      userRole: 'admin',
      details: approved
        ? `Repair approved by ${adminName || 'Admin'} — diagnostic fee waived; repair will be billed.`
        : `Repair declined by ${adminName || 'Admin'} — diagnostic fee ($${Number(woData.diagnosticFee || 0).toFixed(2)}) will be billed.`,
      metadata: { decision },
    };

    const updates: Record<string, any> = {
      status: approved ? 'repair_approved' : 'repair_declined',
      billingPhase: approved ? 'repair' : 'diagnostic',
      updatedAt: serverTimestamp(),
      timeline: [...existingTimeline, timelineEvent],
      systemInformation: {
        ...existingSysInfo,
        repairDecision: {
          decision,
          by: { id: uid, name: adminName || 'Admin' },
          timestamp: now,
        },
      },
    };
    if (approved) updates.repairApprovedAt = serverTimestamp();
    else updates.repairDeclinedAt = serverTimestamp();

    await updateDoc(woRef, updates);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error processing repair decision:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process repair decision' },
      { status: 500 },
    );
  }
}
