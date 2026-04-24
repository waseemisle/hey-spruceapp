import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, collection, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Client-side quote rejection — used for both regular quotes and Diagnostic
 * Requests. For Diagnostic Requests, also flips the sub's biddingWorkOrders
 * card to 'diagnostic_rejected' so the bidding page reflects the outcome.
 */
export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { quoteId, reason } = await request.json();
    if (!quoteId) return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 });

    const db = await getServerDb();
    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    const quoteData = quoteDoc.data();

    if (quoteData.clientId !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let clientName: string = quoteData.clientName || 'Client';
    const clientDoc = await getDoc(doc(db, 'clients', uid));
    if (clientDoc.exists()) clientName = clientDoc.data().fullName || clientName;

    const quoteIsDiagnostic = quoteData.isDiagnosticQuote === true;
    const label = quoteIsDiagnostic ? 'Diagnostic Request' : 'Quote';

    // Mark the quote rejected
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
          reason: reason || undefined,
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

    return NextResponse.json({ success: true, diagnostic: quoteIsDiagnostic });
  } catch (error: any) {
    console.error('Error rejecting quote server-side:', error);
    return NextResponse.json({ error: error.message || 'Failed to reject quote' }, { status: 500 });
  }
}
