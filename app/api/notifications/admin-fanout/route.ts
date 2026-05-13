import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, getPortalUserProfile } from '@/lib/api-verify-firebase';
import {
  fanOutToAllAdmins,
  notifyQuoteRejectionWithServerDb,
} from '@/lib/server-admin-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FanoutType =
  | 'work_order_pending'
  | 'location_pending'
  | 'bidding_declined'
  | 'diagnostic_results_submitted'
  | 'diagnostic_submitted_repair_pending'
  | 'work_order_completed_admins'
  | 'quote_rejected'
  | 'assignment_response'
  | 'work_order_scheduled_admins';

async function loadWorkOrder(db: Awaited<ReturnType<typeof getServerDb>>, workOrderId: string) {
  const snap = await getDoc(doc(db, 'workOrders', workOrderId));
  if (!snap.exists()) return null;
  return snap.data() as Record<string, unknown>;
}

async function clientMayAccessWorkOrder(
  db: Awaited<ReturnType<typeof getServerDb>>,
  uid: string,
  wo: Record<string, unknown>,
): Promise<boolean> {
  if (wo.clientId === uid) return true;
  const cid = wo.companyId;
  if (typeof cid === 'string' && cid.length > 0) {
    const cSnap = await getDoc(doc(db, 'clients', uid));
    if (cSnap.exists() && cSnap.data()?.companyId === cid) return true;
  }
  return false;
}

async function clientMayAccessLocation(
  db: Awaited<ReturnType<typeof getServerDb>>,
  uid: string,
  locationId: string,
): Promise<boolean> {
  const snap = await getDoc(doc(db, 'locations', locationId));
  if (!snap.exists()) return false;
  const loc = snap.data() as Record<string, unknown>;
  if (loc.clientId === uid) return true;
  const cid = loc.companyId;
  if (typeof cid === 'string' && cid.length > 0) {
    const cSnap = await getDoc(doc(db, 'clients', uid));
    if (cSnap.exists() && cSnap.data()?.companyId === cid) return true;
  }
  return false;
}

async function subMayActOnWorkOrder(
  uid: string,
  wo: Record<string, unknown> | null,
): Promise<boolean> {
  if (!wo) return false;
  if (wo.assignedSubcontractor === uid || wo.assignedTo === uid) return true;
  const bidding = wo.biddingSubcontractors;
  return Array.isArray(bidding) && bidding.includes(uid);
}

export async function POST(request: NextRequest) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as { type?: FanoutType } & Record<string, unknown>;
    const t = body.type;
    if (!t) return NextResponse.json({ error: 'Missing type' }, { status: 400 });

    const db = await getServerDb();
    const profile = await getPortalUserProfile(db, uid);
    if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    switch (t) {
      case 'work_order_pending': {
        if (profile.role !== 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const workOrderId = String(body.workOrderId || '');
        const workOrderNumber = String(body.workOrderNumber || '');
        const clientName = String(body.clientName || 'Client');
        if (!workOrderId || !workOrderNumber) {
          return NextResponse.json({ error: 'Missing work order fields' }, { status: 400 });
        }
        const wo = await loadWorkOrder(db, workOrderId);
        if (!wo || !(await clientMayAccessWorkOrder(db, uid, wo))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        await fanOutToAllAdmins(db, {
          type: 'work_order',
          title: 'New Work Order Pending Approval',
          message: `Work Order ${workOrderNumber} from ${clientName} requires your approval`,
          link: `/admin-portal/work-orders/${workOrderId}`,
          referenceId: workOrderId,
          referenceType: 'workOrder',
        });
        return NextResponse.json({ success: true });
      }

      case 'location_pending': {
        if (profile.role !== 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const locationId = String(body.locationId || '');
        const locationName = String(body.locationName || '');
        const clientName = String(body.clientName || 'Client');
        if (!locationId || !locationName) {
          return NextResponse.json({ error: 'Missing location fields' }, { status: 400 });
        }
        if (!(await clientMayAccessLocation(db, uid, locationId))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        await fanOutToAllAdmins(db, {
          type: 'location',
          title: 'New Location Pending Approval',
          message: `Location "${locationName}" from ${clientName} requires your approval`,
          link: `/admin-portal/locations`,
          referenceId: locationId,
          referenceType: 'location',
        });
        return NextResponse.json({ success: true });
      }

      case 'bidding_declined': {
        if (profile.role !== 'subcontractor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const workOrderId = String(body.workOrderId || '');
        const workOrderNumber = String(body.workOrderNumber || '');
        const workOrderTitle = String(body.workOrderTitle || '');
        const subcontractorName = String(body.subcontractorName || 'Subcontractor');
        if (!workOrderId) return NextResponse.json({ error: 'Missing workOrderId' }, { status: 400 });
        const wo = await loadWorkOrder(db, workOrderId);
        if (!(await subMayActOnWorkOrder(uid, wo))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        await fanOutToAllAdmins(db, {
          type: 'work_order',
          title: 'Bidding Opportunity Declined',
          message: `${subcontractorName} declined the bidding opportunity for "${workOrderTitle}" (WO ${workOrderNumber}).`,
          link: `/admin-portal/work-orders/${workOrderId}`,
          referenceId: workOrderId,
          referenceType: 'workOrder',
        });
        return NextResponse.json({ success: true });
      }

      case 'diagnostic_results_submitted': {
        if (profile.role !== 'subcontractor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const workOrderId = String(body.workOrderId || '');
        const workOrderNumber = String(body.workOrderNumber || '');
        const subcontractorName = String(body.subcontractorName || 'Subcontractor');
        if (!workOrderId) return NextResponse.json({ error: 'Missing workOrderId' }, { status: 400 });
        const wo = await loadWorkOrder(db, workOrderId);
        if (!(await subMayActOnWorkOrder(uid, wo))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        await fanOutToAllAdmins(db, {
          type: 'diagnostic_request',
          title: 'Diagnostic Results Submitted',
          message: `${subcontractorName} submitted diagnostic results for WO ${workOrderNumber}.`,
          link: `/admin-portal/work-orders/${workOrderId}`,
          referenceId: workOrderId,
          referenceType: 'workOrder',
        });
        return NextResponse.json({ success: true });
      }

      case 'diagnostic_submitted_repair_pending': {
        if (profile.role !== 'subcontractor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const workOrderId = String(body.workOrderId || '');
        const workOrderNumber = String(body.workOrderNumber || '');
        const subcontractorName = String(body.subcontractorName || 'Subcontractor');
        if (!workOrderId) return NextResponse.json({ error: 'Missing workOrderId' }, { status: 400 });
        const wo = await loadWorkOrder(db, workOrderId);
        if (!(await subMayActOnWorkOrder(uid, wo))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        await fanOutToAllAdmins(db, {
          type: 'work_order',
          title: 'Diagnostic Submitted',
          message: `Diagnostic submitted for Work Order ${workOrderNumber}. Awaiting repair decision.`,
          link: `/admin-portal/work-orders/${workOrderId}`,
          referenceId: workOrderId,
          referenceType: 'workOrder',
        });
        return NextResponse.json({ success: true });
      }

      case 'work_order_completed_admins': {
        const workOrderId = String(body.workOrderId || '');
        const workOrderNumber = String(body.workOrderNumber || '');
        if (!workOrderId) return NextResponse.json({ error: 'Missing workOrderId' }, { status: 400 });
        const wo = await loadWorkOrder(db, workOrderId);
        if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        if (profile.role === 'subcontractor') {
          if (!(await subMayActOnWorkOrder(uid, wo))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
        } else if (profile.role === 'client') {
          if (!(await clientMayAccessWorkOrder(db, uid, wo))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
        } else {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        await fanOutToAllAdmins(db, {
          type: 'completion',
          title: 'Work Order Completed',
          message: `Work Order ${workOrderNumber} marked as complete`,
          link: `/admin-portal/work-orders/${workOrderId}`,
          referenceId: workOrderId,
          referenceType: 'workOrder',
        });
        return NextResponse.json({ success: true });
      }

      case 'quote_rejected': {
        if (profile.role !== 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const quoteId = String(body.quoteId || '');
        const reason = typeof body.reason === 'string' ? body.reason : undefined;
        if (!quoteId) return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 });
        const qSnap = await getDoc(doc(db, 'quotes', quoteId));
        if (!qSnap.exists()) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
        const quoteData = qSnap.data() as Record<string, unknown>;
        if (quoteData.clientId !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        await notifyQuoteRejectionWithServerDb(db, quoteData, reason);
        return NextResponse.json({ success: true });
      }

      case 'assignment_response': {
        if (profile.role !== 'subcontractor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const workOrderId = String(body.workOrderId || '');
        const workOrderNumber = String(body.workOrderNumber || '');
        const subcontractorName = String(body.subcontractorName || 'Subcontractor');
        const decision = body.decision === 'rejected' ? 'rejected' : 'accepted';
        const reason = typeof body.reason === 'string' ? body.reason : undefined;
        if (!workOrderId) return NextResponse.json({ error: 'Missing workOrderId' }, { status: 400 });
        const wo = await loadWorkOrder(db, workOrderId);
        if (!(await subMayActOnWorkOrder(uid, wo))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const accepted = decision === 'accepted';
        await fanOutToAllAdmins(db, {
          type: accepted ? 'assignment' : 'work_order',
          title: accepted ? 'Assignment Accepted' : 'Assignment Rejected',
          message: accepted
            ? `${subcontractorName} accepted the assignment for WO ${workOrderNumber}.`
            : reason
              ? `${subcontractorName} rejected the assignment for WO ${workOrderNumber}. Reason: ${reason}`
              : `${subcontractorName} rejected the assignment for WO ${workOrderNumber}.`,
          link: `/admin-portal/work-orders/${workOrderId}`,
          referenceId: workOrderId,
          referenceType: 'workOrder',
        });
        return NextResponse.json({ success: true });
      }

      case 'work_order_scheduled_admins': {
        if (profile.role !== 'subcontractor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const workOrderId = String(body.workOrderId || '');
        const message = String(body.message || '');
        if (!workOrderId || !message) {
          return NextResponse.json({ error: 'Missing workOrderId or message' }, { status: 400 });
        }
        const wo = await loadWorkOrder(db, workOrderId);
        if (!(await subMayActOnWorkOrder(uid, wo))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        await fanOutToAllAdmins(db, {
          type: 'schedule',
          title: 'Work Order Scheduled',
          message,
          link: `/admin-portal/work-orders/${workOrderId}`,
          referenceId: workOrderId,
          referenceType: 'workOrder',
        });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
    }
  } catch (e: unknown) {
    console.error('[admin-fanout]', e);
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
