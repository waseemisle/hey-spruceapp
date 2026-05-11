import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';
import { createNotification, notifySubcontractorAssignment } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The handler does up to 8 sequential Firestore round-trips plus a
// signed-in cold-start. On a slow cold lambda that totalled >10s and
// Vercel killed the function with its generic HTML 500 page — bypassing
// our catch block entirely so the operator never saw a real error
// message. The reads are now parallelised (see Promise.all batches
// below) and the duplicate workOrder updates merged, but we also bump
// maxDuration as a safety net so a momentarily-slow cold start can't
// silently truncate the response.
export const maxDuration = 30;

/**
 * Approves a quote server-side (using admin credentials) to bypass Firestore
 * client rules that block clients from updating work orders they don't own directly.
 * Called by the client portal when a client approves a quote.
 */
export async function POST(request: Request) {
  // Step tracker — updates as we move through the handler so that a
  // surprise throw lands a JSON response telling the client *exactly*
  // which step blew up instead of a useless generic 500. Previously the
  // route hit a Vercel HTML 500 page in production and the operator
  // couldn't tell whether it was auth, the quote read, the workOrder
  // read, the workOrder write, or the assignedJobs insert.
  let step: string = 'init';
  try {
    step = 'verify-bearer';
    const uid = await getBearerUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized', step }, { status: 401 });
    }

    step = 'parse-body';
    const { quoteId } = await request.json();
    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId', step }, { status: 400 });
    }

    step = 'get-server-db';
    const db = await getServerDb();

    // Fetch quote and verify the requesting user is the client
    step = 'fetch-quote';
    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) {
      return NextResponse.json({ error: 'Quote not found', step }, { status: 404 });
    }
    const quoteData = quoteDoc.data();

    if (quoteData.clientId !== uid) {
      return NextResponse.json({ error: 'Forbidden', step }, { status: 403 });
    }
    const quoteWorkOrderIds: string[] = Array.isArray(quoteData.workOrderIds)
      ? quoteData.workOrderIds.map(String).filter(Boolean)
      : [];
    const workOrderIds = (quoteWorkOrderIds.length >= 2
      ? quoteWorkOrderIds
      : quoteData.workOrderId
        ? [String(quoteData.workOrderId)]
        : []);
    if (workOrderIds.length === 0) {
      return NextResponse.json({ error: 'Quote has no associated work order(s)', step }, { status: 400 });
    }
    // De-dupe defensively (prevents duplicate writes / assignedJobs if client data is malformed).
    const uniqueWorkOrderIds = Array.from(new Set(workOrderIds));
    // Idempotency guard — if this quote is already accepted (user double-
    // clicked, slow network retried, etc.) short-circuit with success
    // instead of running the full assignment flow twice and creating
    // duplicate assignedJobs rows + duplicate timeline entries.
    if (quoteData.status === 'accepted') {
      return NextResponse.json({
        success: true,
        alreadyAccepted: true,
        diagnostic: quoteData.isDiagnosticQuote === true,
        workOrderData: {
          workOrderNumber: quoteData.workOrderNumber || quoteData.workOrderId,
          workOrderTitle: quoteData.workOrderTitle || '',
          locationName: quoteData.locationName || '',
          locationAddress: quoteData.locationAddress || '',
          subcontractorEmail: quoteData.subcontractorEmail || '',
          subcontractorName: quoteData.subcontractorName || '',
          clientName: quoteData.clientName || '',
          subcontractorId: quoteData.subcontractorId || '',
          workOrderId: quoteData.workOrderId || uniqueWorkOrderIds[0],
          workOrderIds: uniqueWorkOrderIds,
        },
      });
    }

    // Parallelise the next three reads — client, work order, and the
    // subcontractor's profile (for resolving their auth uid). Doing
    // them sequentially used to add ~600-1000ms to the wall-clock and
    // was the main contributor to cold-start lambdas exceeding the
    // 10s function timeout (which surfaces as Vercel's HTML 500 page,
    // bypassing our catch block — *exactly* the symptom the operator
    // reported in production).
    step = 'parallel-reads';
    const [clientDoc, ...rest] = await Promise.all([
      getDoc(doc(db, 'clients', uid)),
      quoteData.subcontractorId
        ? getDoc(doc(db, 'subcontractors', quoteData.subcontractorId)).catch(() => null)
        : Promise.resolve(null),
      ...uniqueWorkOrderIds.map((woId) => getDoc(doc(db, 'workOrders', woId))),
    ]);
    const subDoc = rest[0] as any;
    const workOrderDocs = rest.slice(1) as any[];

    let clientName: string = quoteData.clientName || 'Client';
    if (clientDoc.exists()) {
      clientName = clientDoc.data().fullName || clientName;
    }

    const firstWorkOrderDoc = workOrderDocs.find((d) => d?.exists?.());
    if (!firstWorkOrderDoc) {
      return NextResponse.json({ error: 'Work order not found', step }, { status: 404 });
    }
    const workOrderData = firstWorkOrderDoc.data();

    // Resolve subcontractor auth uid up-front from the parallel read so
    // we don't have to re-fetch it later.
    let resolvedSubId = quoteData.subcontractorId;
    if (subDoc && subDoc.exists()) {
      const subData = subDoc.data();
      resolvedSubId = (subData.uid && String(subData.uid).trim()) || subDoc.id;
    }

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
    step = 'update-quote-accepted';
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

    const existingTimeline = workOrderData.timeline || [];
    const existingSysInfo = workOrderData.systemInformation || {};

    // ───────────────────────── DIAGNOSTIC FLOW ─────────────────────────
    // Client accepted a Diagnostic Request. No assignment yet — the sub now
    // submits a regular repair quote from /bidding. Just pin the fee and
    // move the WO to 'diagnostic_accepted'.
    if (quoteIsDiagnostic) {
      if (uniqueWorkOrderIds.length >= 2) {
        return NextResponse.json({ error: 'Diagnostic approval is not supported for combined work orders', step }, { status: 400 });
      }
      step = 'update-wo-diagnostic-accepted';
      const diagFee = Number(quoteData.diagnosticFee ?? quoteData.totalAmount ?? 0);
      await updateDoc(doc(db, 'workOrders', uniqueWorkOrderIds[0]), {
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

      // Notify the sub their diagnostic was accepted so they know to come
      // back and submit the repair quote. Previously this branch was silent
      // — no bell, no email path triggered. Fire-and-forget.
      if (resolvedSubId) {
        const woNumber = workOrderData.workOrderNumber || quoteData.workOrderId;
        createNotification({
          userId: resolvedSubId,
          userRole: 'subcontractor',
          type: 'quote',
          title: 'Diagnostic Request Accepted',
          message: `${clientName} accepted your diagnostic request for WO ${woNumber}. Submit your repair quote from the Bidding page.`,
          link: `/subcontractor-portal/bidding`,
          referenceId: quoteData.workOrderId,
          referenceType: 'workOrder',
        }).catch((e) => console.error('[quotes/approve] diagnostic notify fail (non-fatal):', e));
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
          workOrderId: uniqueWorkOrderIds[0],
          workOrderIds: uniqueWorkOrderIds,
          diagnosticFee: diagFee,
        },
      });
    }

    // ───────────────────────── REGULAR QUOTE FLOW ──────────────────────
    // Don't move the work order backward through the pipeline on repeat approvals.
    const EARLY_STAGES = new Set(['pending', 'approved', 'bidding', 'quotes_received', 'diagnostic_accepted', 'diagnostic_results_submitted']);

    // Firestore rejects updateDoc payloads that contain `undefined` and
    // throws "Function setDoc() called with invalid data. Unsupported field
    // value: undefined". Quote docs commonly have missing optional numerics
    // (laborCost/materialCost on a quote that wasn't itemised, totalAmount
    // on a quote that only set clientAmount, etc.) so we coalesce every
    // value to a Firestore-safe default (null for numerics, '' for strings,
    // [] for arrays). This was the root cause of the 500 the client portal
    // hit on Approve Quote — one missing field nuked the entire write.
    const safeAmount = Number(quoteData.clientAmount ?? quoteData.totalAmount ?? 0) || 0;
    const safeLabor = Number(quoteData.laborCost ?? 0) || 0;
    const safeMaterial = Number(quoteData.materialCost ?? 0) || 0;
    const safeSubName = String(quoteData.subcontractorName || '');
    const safeSubEmail = String(quoteData.subcontractorEmail || '');
    const safeSubId = String(resolvedSubId || quoteData.subcontractorId || '');
    // Sanitize line items individually — Firestore rejects updateDoc payloads
    // containing any `undefined` field, and previously the route copied
    // quoteData.lineItems through unchanged. A line item shaped like
    // `{description, quantity: undefined, unitPrice: 5, amount: undefined}`
    // would nuke the entire write with a generic "invalid data" error which
    // the platform sometimes surfaced as an HTML 500 instead of our JSON.
    const safeLineItems = (Array.isArray(quoteData.lineItems) ? quoteData.lineItems : []).map(
      (li: any) => ({
        description: String(li?.description || ''),
        quantity: Number(li?.quantity ?? 0) || 0,
        unitPrice: Number(li?.unitPrice ?? 0) || 0,
        amount: Number(li?.amount ?? 0) || 0,
      }),
    );

    // Combined workOrder write — previously the route fired TWO sequential
    // updateDoc calls against the same workOrder doc (assigned-with-line-
    // items + assignedTo), adding ~200-400ms of unnecessary serial wall
    // time. Both payloads touch the same document so they can land in a
    // single update. The assignedJobs insert touches a different doc and
    // can run in parallel.
    step = 'parallel-writes';
    for (const woDoc of workOrderDocs) {
      if (!woDoc?.exists?.()) continue;
      const woId = woDoc.id as string;
      const woData = woDoc.data();
      const existingTimeline = woData?.timeline || [];
      const existingSysInfo = woData?.systemInformation || {};
      const currentWoStatus = (woData?.status as string | undefined) || '';
      const shouldSetAssigned = EARLY_STAGES.has(currentWoStatus);
      // Idempotency guard per work order (in addition to the quote-level guard above).
      if (woData?.approvedQuoteId === quoteId && (woData?.assignedTo || woData?.assignedSubcontractor)) {
        continue;
      }

      await updateDoc(doc(db, 'workOrders', woId), {
        ...(shouldSetAssigned ? { status: 'assigned' } : {}),
        assignedSubcontractor: safeSubId,
        assignedSubcontractorName: safeSubName,
        assignedTo: safeSubId,
        assignedToName: safeSubName,
        assignedToEmail: safeSubEmail,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        approvedQuoteId: quoteId,
        approvedQuoteAmount: safeAmount,
        approvedQuoteLaborCost: safeLabor,
        approvedQuoteMaterialCost: safeMaterial,
        approvedQuoteLineItems: safeLineItems,
        timeline: [
          ...existingTimeline,
          createTimelineEvent({
            type: 'quote_approved_by_client',
            userId: uid,
            userName: clientName,
            userRole: 'client',
            details: `Quote from ${safeSubName || 'subcontractor'} approved by ${clientName}. Work order assigned.`,
            metadata: {
              quoteId,
              subcontractorName: safeSubName,
              amount: safeAmount,
              ...(quoteData.workOrderGroupId ? { workOrderGroupId: quoteData.workOrderGroupId } : {}),
            },
          }),
        ],
        systemInformation: {
          ...existingSysInfo,
          quoteApprovalByClient: {
            quoteId,
            approvedBy: { id: uid, name: clientName },
            timestamp: Timestamp.now(),
            ...(quoteData.workOrderGroupId ? { workOrderGroupId: quoteData.workOrderGroupId } : {}),
          },
        },
      });

      // assignedJobs idempotency: ensure we don't insert duplicates for this WO/sub pair.
      try {
        const existingAssigned = await getDocs(query(
          collection(db, 'assignedJobs'),
          where('workOrderId', '==', woId),
          where('subcontractorId', '==', safeSubId),
        ));
        if (existingAssigned.empty) {
          await addDoc(collection(db, 'assignedJobs'), {
            workOrderId: woId,
            subcontractorId: safeSubId,
            assignedAt: serverTimestamp(),
            status: 'pending_acceptance',
          });
        }
      } catch (e) {
        console.warn('[quotes/approve] assignedJobs insert check failed (non-fatal):', e);
      }
    }

    // Notify the sub of their assignment from the server too. The client
    // UI also fires this after the API returns, so subs may see two bell
    // entries on a fast network — that's a known cosmetic dupe vs. the
    // worst case (silence) when the client UI never reaches the
    // notification call (closed tab, page nav, network blip). Better dupe
    // than silent. Idempotency / dedupe at the bell is a follow-up.
    if (safeSubId) {
      notifySubcontractorAssignment(
        safeSubId,
        quoteData.workOrderId,
        workOrderData.workOrderNumber || quoteData.workOrderId,
      ).catch((e) => console.error('[quotes/approve] assignment notify fail (non-fatal):', e));
    }

    // Fire-and-forget SMS + WhatsApp to the subcontractor whose quote was approved
    if (safeSubId) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        'http://localhost:3000';
      fetch(`${baseUrl}/api/messaging/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'quote-approved',
          subcontractorId: safeSubId,
          context: {
            quoteId,
            workOrderId: quoteData.workOrderId || uniqueWorkOrderIds[0],
            workOrderNumber: workOrderData.workOrderNumber || quoteData.workOrderId,
            workOrderTitle: quoteData.workOrderTitle || '',
          },
        }),
      }).catch((e) => console.error('[quotes/approve] messaging send fail (non-fatal):', e));
    }

    return NextResponse.json({
      success: true,
      diagnostic: false,
      workOrderData: {
        workOrderNumber: workOrderData.workOrderNumber || quoteData.workOrderId,
        locationName: workOrderData.locationName || '',
        locationAddress: workOrderData.locationAddress || '',
        workOrderTitle: quoteData.workOrderTitle || '',
        subcontractorEmail: safeSubEmail,
        subcontractorName: safeSubName,
        clientName: quoteData.clientName || '',
        subcontractorId: safeSubId,
        workOrderId: quoteData.workOrderId || uniqueWorkOrderIds[0],
        workOrderIds: uniqueWorkOrderIds,
      },
    });
  } catch (error: any) {
    // Surface the underlying error so the client toast actually says what
    // broke instead of a generic "Failed to approve quote". Includes the
    // Firestore error code (e.g. 'invalid-argument', 'permission-denied')
    // and the step we were on when it threw. The step makes the
    // difference between "the quote read failed" and "the assignedJobs
    // insert failed" — same generic Firestore error message, totally
    // different debug paths.
    const message = error?.message || String(error) || 'Failed to approve quote';
    const code = error?.code ? ` [${error.code}]` : '';
    console.error(`[quotes/approve] failed at step=${step}:`, message, error?.stack);
    return NextResponse.json(
      { error: `${message}${code} (step: ${step})`, step },
      { status: 500 },
    );
  }
}
