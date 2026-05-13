import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, getPortalUserProfile } from '@/lib/api-verify-firebase';
import { fanOutToAllAdmins } from '@/lib/server-admin-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fan-out in-app "quote submitted" notifications to every admin.
 *
 * Client-side `getAllAdminUserIds()` cannot run in the subcontractor browser
 * because Firestore rules only allow listing / reading adminUsers to admins.
 */
export async function POST(request: NextRequest) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workOrderId, workOrderNumber, subcontractorName, quoteAmount } = body as {
      workOrderId?: string;
      workOrderNumber?: string;
      subcontractorName?: string;
      quoteAmount?: number;
    };

    if (!workOrderId || !workOrderNumber || !subcontractorName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = await getServerDb();
    const profile = await getPortalUserProfile(db, uid);
    if (!profile || (profile.role !== 'subcontractor' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (profile.role === 'subcontractor') {
      const woSnap = await getDoc(doc(db, 'workOrders', workOrderId));
      if (!woSnap.exists()) {
        return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
      }
      const wo = woSnap.data() as Record<string, unknown>;
      const bidding = Array.isArray(wo.biddingSubcontractors) ? wo.biddingSubcontractors : [];
      const inBidding = bidding.includes(uid);
      const assigned =
        wo.assignedSubcontractor === uid ||
        wo.assignedTo === uid;
      if (!inBidding && !assigned) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    void quoteAmount;

    const notified = await fanOutToAllAdmins(db, {
      type: 'quote',
      title: 'Quote Submitted',
      message: `${subcontractorName} submitted a quote for WO ${workOrderNumber}`,
      link: '/admin-portal/quotes',
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });

    return NextResponse.json({
      success: true,
      notified,
      ...(notified === 0 ? { message: 'No admin users' } : {}),
    });
  } catch (e: unknown) {
    console.error('[quote-submitted]', e);
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
