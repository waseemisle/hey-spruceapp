import { NextResponse } from 'next/server';
import {
  doc, getDoc, updateDoc, addDoc, collection,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';
import { generateInvoiceNumber } from '@/lib/invoice-number';
import { BIDDING_OPEN_STATUSES } from '@/lib/bidding-eligibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/work-orders/bidding-direct-invoice
 *
 * Allows subcontractors to submit an invoice directly from the bidding page,
 * bypassing the normal quote → admin-approve → assign → complete flow.
 * Only available when the work order's company has allowSubDirectInvoiceFromBidding=true.
 *
 * Status path (Option A): direct invoice implies sub is the vendor of record.
 *   - WO advances to 'assigned' (sub flagged as assignedSubcontractor/assignedTo).
 *   - directInvoiceBypass=true recorded for reporting/audit.
 *   - Invoice created immediately in 'sent' status (or 'pending_approval' if
 *     the company has invoiceApprovalRequired=true, matching the normal invoice flow).
 *   - Sub still calls /api/work-orders/complete when the work is physically done
 *     to advance WO to pending_invoice.
 *   - biddingWorkOrders row is marked 'direct_invoice_submitted' (terminal success).
 */
export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { biddingWorkOrderId, workOrderId, lineItems, notes, totalAmount, subName: bodySubName } = body;

    if (!biddingWorkOrderId || !workOrderId) {
      return NextResponse.json({ error: 'Missing biddingWorkOrderId or workOrderId' }, { status: 400 });
    }
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }
    if (typeof totalAmount !== 'number' || totalAmount <= 0) {
      return NextResponse.json({ error: 'Invalid totalAmount' }, { status: 400 });
    }

    const db = await getServerDb();

    // 1. Verify bidding row exists and belongs to this sub in 'pending' state.
    const biddingRef = doc(db, 'biddingWorkOrders', biddingWorkOrderId);
    const biddingSnap = await getDoc(biddingRef);
    if (!biddingSnap.exists()) {
      return NextResponse.json({ error: 'Bidding record not found' }, { status: 404 });
    }
    const biddingData = biddingSnap.data();
    if (biddingData.subcontractorId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (biddingData.status !== 'pending') {
      return NextResponse.json(
        { error: 'This bidding opportunity is no longer open for a direct invoice' },
        { status: 409 },
      );
    }

    // 2. Load work order; verify it is still in the bidding window.
    const woRef = doc(db, 'workOrders', workOrderId);
    const woSnap = await getDoc(woRef);
    if (!woSnap.exists()) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }
    const woData = woSnap.data();

    const woStatus = (woData.status || '').toLowerCase();
    if (!BIDDING_OPEN_STATUSES.has(woStatus)) {
      return NextResponse.json({ error: 'Work order is no longer accepting submissions' }, { status: 409 });
    }
    if (woData.approvedQuoteId || woData.assignedTo || woData.assignedSubcontractor) {
      return NextResponse.json({ error: 'Work order has already been assigned' }, { status: 409 });
    }

    // 3. Resolve companyId (WO field preferred; fall back to client doc).
    let companyId: string | null = woData.companyId || null;
    if (!companyId && woData.clientId) {
      const clientSnap = await getDoc(doc(db, 'clients', woData.clientId));
      if (clientSnap.exists()) companyId = clientSnap.data().companyId || null;
    }
    if (!companyId) {
      return NextResponse.json({ error: 'Could not resolve company for this work order' }, { status: 422 });
    }

    // 4. Verify company has the direct-invoice flag enabled.
    const companySnap = await getDoc(doc(db, 'companies', companyId));
    if (!companySnap.exists()) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const companyData = companySnap.data();
    if (companyData.allowSubDirectInvoiceFromBidding !== true) {
      return NextResponse.json({ error: 'Direct invoice is not enabled for this company' }, { status: 403 });
    }

    // 5. Load subcontractor profile for name/email.
    const subSnap = await getDoc(doc(db, 'subcontractors', uid));
    const subData = subSnap.exists() ? subSnap.data() : {};
    const subName: string = bodySubName || (subData.fullName as string) || (subData.businessName as string) || 'Subcontractor';
    const subEmail: string = (subData.email as string) || '';

    // 6. Create invoice as 'draft' so admin can review, add markup, and send to
    //    client — matching the normal quote → admin-markup → client-invoice flow.
    //    The sub and client never see each other's amounts.

    // 7. Create invoice document server-side (bypasses the client Firestore rule
    //    that restricts invoice creates to isAdmin() only).
    const invoiceNumber = generateInvoiceNumber();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoiceRef = await addDoc(collection(db, 'invoices'), {
      invoiceNumber,
      clientId: woData.clientId || biddingData.clientId,
      clientName: woData.clientName || biddingData.clientName || '',
      clientEmail: woData.clientEmail || biddingData.clientEmail || '',
      workOrderId,
      workOrderTitle: woData.title || biddingData.workOrderTitle || '',
      workOrderDescription: woData.description || biddingData.workOrderDescription || '',
      category: woData.category || biddingData.category || '',
      priority: woData.priority || biddingData.priority || '',
      subcontractorId: uid,
      subcontractorName: subName,
      subcontractorEmail: subEmail,
      totalAmount,
      lineItems,
      discountAmount: 0,
      status: 'draft',
      dueDate,
      notes: notes || '',
      createdBy: uid,
      createdByName: subName,
      creationSource: 'subcontractor_direct_invoice_bidding',
      directInvoiceBypass: true,
      biddingWorkOrderId,
      systemInformation: {
        createdBy: { id: uid, name: subName, role: 'subcontractor', timestamp: Timestamp.now() },
      },
      timeline: [{
        id: `created_${Date.now()}`,
        timestamp: Timestamp.now(),
        type: 'created',
        userId: uid,
        userName: subName,
        userRole: 'subcontractor',
        details: `Invoice submitted directly from bidding by ${subName}`,
        metadata: { source: 'subcontractor_direct_invoice_bidding', invoiceNumber, workOrderId },
      }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 8. Update WO: assign sub as vendor of record, advance to 'assigned'.
    const existingTimeline = Array.isArray(woData.timeline) ? woData.timeline : [];
    const existingSysInfo = woData.systemInformation || {};

    const woTimelineEvent = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Timestamp.now(),
      type: 'direct_invoice_submitted',
      userId: uid,
      userName: subName,
      userRole: 'subcontractor',
      details: `Direct invoice submitted by ${subName} — $${totalAmount.toFixed(2)} (quote flow bypassed)`,
      metadata: { invoiceId: invoiceRef.id, invoiceNumber, amount: totalAmount, biddingWorkOrderId },
    };

    await updateDoc(woRef, {
      status: 'assigned',
      assignedSubcontractor: uid,
      assignedTo: uid,
      assignedSubcontractorName: subName,
      assignedToName: subName,
      assignedAt: serverTimestamp(),
      directInvoiceBypass: true,
      directInvoiceId: invoiceRef.id,
      updatedAt: serverTimestamp(),
      timeline: [...existingTimeline, woTimelineEvent],
      systemInformation: {
        ...existingSysInfo,
        directInvoice: {
          submittedBy: { id: uid, name: subName },
          timestamp: Timestamp.now(),
          invoiceId: invoiceRef.id,
          invoiceNumber,
          amount: totalAmount,
        },
      },
    });

    // 9. Mark bidding row as terminal success so the sub's list stays coherent.
    await updateDoc(biddingRef, {
      status: 'direct_invoice_submitted',
      directInvoiceId: invoiceRef.id,
      directInvoiceSubmittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true, invoiceId: invoiceRef.id, invoiceNumber });
  } catch (error: any) {
    console.error('[bidding-direct-invoice] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit direct invoice' },
      { status: 500 },
    );
  }
}
