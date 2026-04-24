import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Approves a quote server-side (using admin credentials) to bypass Firestore
 * client rules that block clients from updating work orders they don't own directly.
 * Called by the client portal when a client approves a quote.
 */
export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quoteId } = await request.json();
    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 });
    }

    const db = await getServerDb();

    // Fetch quote and verify the requesting user is the client
    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    const quoteData = quoteDoc.data();

    if (quoteData.clientId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!quoteData.workOrderId) {
      return NextResponse.json({ error: 'Quote has no associated work order' }, { status: 400 });
    }

    // Get client's display name
    let clientName: string = quoteData.clientName || 'Client';
    const clientDoc = await getDoc(doc(db, 'clients', uid));
    if (clientDoc.exists()) {
      clientName = clientDoc.data().fullName || clientName;
    }

    // Fetch work order
    const workOrderDoc = await getDoc(doc(db, 'workOrders', quoteData.workOrderId));
    if (!workOrderDoc.exists()) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }
    const workOrderData = workOrderDoc.data();

    const quoteIsDiagnostic = quoteData.isDiagnosticQuote === true;

    // Mark the quote accepted (shared between both paths)
    const existingQuoteTimeline = quoteData.timeline || [];
    const existingQuoteSysInfo = quoteData.systemInformation || {};
    const acceptedEvent = createQuoteTimelineEvent({
      type: 'accepted',
      userId: uid,
      userName: clientName,
      userRole: 'client',
      details: quoteIsDiagnostic
        ? `Diagnostic Request from ${quoteData.subcontractorName} accepted by ${clientName}.`
        : `Quote approved by ${clientName}. Work order assigned to ${quoteData.subcontractorName}.`,
      metadata: quoteData.workOrderNumber ? { workOrderNumber: quoteData.workOrderNumber } : undefined,
    });
    await updateDoc(doc(db, 'quotes', quoteId), {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
      timeline: [...existingQuoteTimeline, acceptedEvent],
      systemInformation: {
        ...existingQuoteSysInfo,
        acceptedBy: {
          id: uid,
          name: clientName,
          timestamp: Timestamp.now(),
        },
      },
      updatedAt: serverTimestamp(),
    });

    // Resolve the subcontractor's auth UID for consistent ID usage
    let resolvedSubId = quoteData.subcontractorId;
    try {
      const subDoc = await getDoc(doc(db, 'subcontractors', quoteData.subcontractorId));
      if (subDoc.exists()) {
        const subData = subDoc.data();
        resolvedSubId = (subData.uid && String(subData.uid).trim()) || subDoc.id;
      }
    } catch (e) {
      console.warn('Could not resolve subcontractor auth UID, using quote subcontractorId:', e);
    }

    const existingTimeline = workOrderData.timeline || [];
    const existingSysInfo = workOrderData.systemInformation || {};

    // ───────────────────────── DIAGNOSTIC FLOW ─────────────────────────
    // Client accepted a Diagnostic Request. No assignment yet — the sub now
    // submits a regular repair quote from /bidding. Just pin the fee and
    // move the WO to 'diagnostic_accepted'.
    if (quoteIsDiagnostic) {
      const diagFee = Number(quoteData.diagnosticFee ?? quoteData.totalAmount ?? 0);
      await updateDoc(doc(db, 'workOrders', quoteData.workOrderId), {
        status: 'diagnostic_accepted',
        diagnosticFee: diagFee,
        diagnosticAcceptedAt: serverTimestamp(),
        approvedDiagnosticQuoteId: quoteId,
        updatedAt: serverTimestamp(),
        timeline: [
          ...existingTimeline,
          createTimelineEvent({
            type: 'diagnostic_accepted',
            userId: uid,
            userName: clientName,
            userRole: 'client',
            details: `Diagnostic Request from ${quoteData.subcontractorName} accepted by ${clientName}.`,
            metadata: { quoteId, subcontractorName: quoteData.subcontractorName, diagnosticFee: diagFee },
          }),
        ],
        systemInformation: {
          ...existingSysInfo,
          diagnosticAcceptedBy: {
            quoteId,
            acceptedBy: { id: uid, name: clientName },
            timestamp: Timestamp.now(),
          },
        },
      });

      // Flip the sub's bidding card to diagnostic_accepted state so the
      // Submit Quote path on /subcontractor-portal/bidding opens up.
      try {
        const bwoSnap = await getDocs(query(
          collection(db, 'biddingWorkOrders'),
          where('workOrderId', '==', quoteData.workOrderId),
          where('subcontractorId', '==', resolvedSubId),
        ));
        for (const d of bwoSnap.docs) {
          await updateDoc(d.ref, {
            status: 'diagnostic_accepted',
            diagnosticAcceptedAt: serverTimestamp(),
            diagnosticFee: diagFee,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.warn('Could not sync biddingWorkOrders to diagnostic_accepted:', e);
      }

      return NextResponse.json({
        success: true,
        diagnostic: true,
        workOrderData: {
          workOrderNumber: workOrderData.workOrderNumber || quoteData.workOrderId,
          locationName: workOrderData.locationName,
          locationAddress: workOrderData.locationAddress,
          workOrderTitle: quoteData.workOrderTitle,
          subcontractorEmail: quoteData.subcontractorEmail,
          subcontractorName: quoteData.subcontractorName,
          clientName: quoteData.clientName,
          subcontractorId: resolvedSubId,
          workOrderId: quoteData.workOrderId,
          diagnosticFee: diagFee,
        },
      });
    }

    // ───────────────────────── REGULAR QUOTE FLOW ──────────────────────
    // Don't move the work order backward through the pipeline on repeat approvals.
    const currentWoStatus = (workOrderData.status as string | undefined) || '';
    const EARLY_STAGES = new Set(['pending', 'approved', 'bidding', 'quotes_received', 'diagnostic_accepted']);
    const shouldSetAssigned = EARLY_STAGES.has(currentWoStatus);
    await updateDoc(doc(db, 'workOrders', quoteData.workOrderId), {
      ...(shouldSetAssigned ? { status: 'assigned' } : {}),
      assignedSubcontractor: resolvedSubId,
      assignedSubcontractorName: quoteData.subcontractorName,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      approvedQuoteId: quoteId,
      approvedQuoteAmount: quoteData.clientAmount || quoteData.totalAmount,
      approvedQuoteLaborCost: quoteData.laborCost,
      approvedQuoteMaterialCost: quoteData.materialCost,
      approvedQuoteLineItems: quoteData.lineItems || [],
      timeline: [
        ...existingTimeline,
        createTimelineEvent({
          type: 'quote_approved_by_client',
          userId: uid,
          userName: clientName,
          userRole: 'client',
          details: `Quote from ${quoteData.subcontractorName} approved by ${clientName}. Work order assigned.`,
          metadata: {
            quoteId,
            subcontractorName: quoteData.subcontractorName,
            amount: quoteData.clientAmount || quoteData.totalAmount,
          },
        }),
      ],
      systemInformation: {
        ...existingSysInfo,
        quoteApprovalByClient: {
          quoteId,
          approvedBy: { id: uid, name: clientName },
          timestamp: Timestamp.now(),
        },
      },
    });

    // Create assignedJobs record using resolved auth UID
    await addDoc(collection(db, 'assignedJobs'), {
      workOrderId: quoteData.workOrderId,
      subcontractorId: resolvedSubId,
      assignedAt: serverTimestamp(),
      status: 'pending_acceptance',
    });

    // Also update assignedTo on the work order for consistency with manual assignment flow
    await updateDoc(doc(db, 'workOrders', quoteData.workOrderId), {
      assignedTo: resolvedSubId,
      assignedToName: quoteData.subcontractorName,
      assignedToEmail: quoteData.subcontractorEmail,
    });

    return NextResponse.json({
      success: true,
      diagnostic: false,
      workOrderData: {
        workOrderNumber: workOrderData.workOrderNumber || quoteData.workOrderId,
        locationName: workOrderData.locationName,
        locationAddress: workOrderData.locationAddress,
        workOrderTitle: quoteData.workOrderTitle,
        subcontractorEmail: quoteData.subcontractorEmail,
        subcontractorName: quoteData.subcontractorName,
        clientName: quoteData.clientName,
        subcontractorId: resolvedSubId,
        workOrderId: quoteData.workOrderId,
      },
    });
  } catch (error: any) {
    console.error('Error approving quote server-side:', error);
    return NextResponse.json({ error: error.message || 'Failed to approve quote' }, { status: 500 });
  }
}
