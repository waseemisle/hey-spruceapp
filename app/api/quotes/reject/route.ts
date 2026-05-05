import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, collection, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';
import { notifyQuoteRejection } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Client-side quote rejection — used for both regular quotes and Diagnostic
 * Requests. For Diagnostic Requests, also flips the sub's biddingWorkOrders
 * card to 'diagnostic_rejected' so the bidding page reflects the outcome.
 */
export async function POST(request: Request) {
  let step: string = 'init';
  try {
    step = 'verify-bearer';
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized', step }, { status: 401 });

    step = 'parse-body';
    const { quoteId, reason } = await request.json();
    if (!quoteId) return NextResponse.json({ error: 'Missing quoteId', step }, { status: 400 });

    step = 'get-server-db';
    const db = await getServerDb();
    step = 'fetch-quote';
    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) return NextResponse.json({ error: 'Quote not found', step }, { status: 404 });
    const quoteData = quoteDoc.data();

    if (quoteData.clientId !== uid) return NextResponse.json({ error: 'Forbidden', step }, { status: 403 });

    step = 'fetch-client';
    let clientName: string = quoteData.clientName || 'Client';
    const clientDoc = await getDoc(doc(db, 'clients', uid));
    if (clientDoc.exists()) clientName = clientDoc.data().fullName || clientName;

    const quoteIsDiagnostic = quoteData.isDiagnosticQuote === true;
    const label = quoteIsDiagnostic ? 'Diagnostic Request' : 'Quote';

    // Mark the quote rejected
    step = 'update-quote-rejected';
    const existingQuoteTimeline = quoteData.timeline || [];
    const existingQuoteSysInfo = quoteData.systemInformation || {};
    await updateDoc(doc(db, 'quotes', quoteId), {
      status: 'rejected',
      rejectedAt: serverTimestamp(),
      rejectionReason: reason || 'No reason provided',
      timeline: [
        ...existingQuoteTimeline,
        createQuoteTimelineEvent({
          type: 'rejected',
          userId: uid,
          userName: clientName,
          userRole: 'client',
          details: `${label} from ${quoteData.subcontractorName} rejected by ${clientName}${reason ? `. Reason: ${reason}` : ''}`,
          metadata: { reason: reason || '' },
        }),
      ],
      systemInformation: {
        ...existingQuoteSysInfo,
        rejectedBy: {
          id: uid,
          name: clientName,
          timestamp: Timestamp.now(),
          // Coalesce to '' — Firestore rejects payloads with any undefined
          // field with "invalid data" + sometimes surfaces as platform 500.
          reason: typeof reason === 'string' ? reason : '',
        },
      },
      updatedAt: serverTimestamp(),
    });

    // Work order timeline + (for diagnostics) status flip to diagnostic_rejected
    if (quoteData.workOrderId) {
      try {
        const woRef = doc(db, 'workOrders', quoteData.workOrderId);
        const woSnap = await getDoc(woRef);
        if (woSnap.exists()) {
          const woData = woSnap.data();
          const existingTimeline = woData.timeline || [];
          const updates: Record<string, any> = {
            updatedAt: serverTimestamp(),
            timeline: [
              ...existingTimeline,
              createTimelineEvent({
                type: quoteIsDiagnostic ? 'diagnostic_rejected' : 'quote_rejected_by_client',
                userId: uid,
                userName: clientName,
                userRole: 'client',
                details: `${label} from ${quoteData.subcontractorName} rejected by ${clientName}${reason ? `. Reason: ${reason}` : ''}`,
                metadata: { quoteId, subcontractorName: quoteData.subcontractorName, reason: reason || '', isDiagnosticQuote: quoteIsDiagnostic },
              }),
            ],
          };
          // Only move a work order to 'diagnostic_rejected' if it hasn't already
          // progressed beyond the diagnostic stage.
          const currentStatus = (woData.status as string | undefined) || '';
          if (quoteIsDiagnostic && ['pending', 'approved', 'bidding'].includes(currentStatus)) {
            updates.status = 'diagnostic_rejected';
          }
          await updateDoc(woRef, updates);
        }
      } catch (e) {
        console.error('Failed to update work order after rejection:', e);
      }
    }

    // For diagnostic rejections, also flip the sub's biddingWorkOrders card
    if (quoteIsDiagnostic && quoteData.subcontractorId) {
      try {
        const bwoSnap = await getDocs(query(
          collection(db, 'biddingWorkOrders'),
          where('workOrderId', '==', quoteData.workOrderId),
          where('subcontractorId', '==', quoteData.subcontractorId),
        ));
        for (const d of bwoSnap.docs) {
          await updateDoc(d.ref, {
            status: 'diagnostic_rejected',
            diagnosticRejectedAt: serverTimestamp(),
            rejectionReason: reason || '',
            updatedAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.warn('Could not sync biddingWorkOrders to diagnostic_rejected:', e);
      }
    }

    // Fire notifications — fan-out to admins (audit) AND the affected
    // subcontractor's bell so they see the rejection in real time and the
    // My Quotes nav badge ticks up. This route was previously silent on
    // the diagnostic-reject path (the regular-quote reject in the
    // client/quotes UI fires this client-side, but the diagnostic page
    // calls the API only). Fire-and-forget so it never blocks the
    // response.
    notifyQuoteRejection(
      quoteData.workOrderId || '',
      quoteData.workOrderNumber || quoteData.workOrderId || '',
      quoteData.subcontractorId || null,
      quoteData.subcontractorName || 'Subcontractor',
      reason || undefined,
    ).catch((e) => console.error('[quotes/reject] notify fail (non-fatal):', e));

    return NextResponse.json({ success: true, diagnostic: quoteIsDiagnostic });
  } catch (error: any) {
    const message = error?.message || String(error) || 'Failed to reject quote';
    const code = error?.code ? ` [${error.code}]` : '';
    console.error(`[quotes/reject] failed at step=${step}:`, message, error?.stack);
    return NextResponse.json(
      { error: `${message}${code} (step: ${step})`, step },
      { status: 500 },
    );
  }
}
