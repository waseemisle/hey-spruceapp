import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/work-orders/edit-diagnostic
 *
 * type: 'request'
 *   Body: { type, biddingWorkOrderId, diagnosticFee, proposedServiceDate?, proposedServiceTime?, diagnosticQuoteId? }
 *
 * type: 'results'
 *   Body: { type, biddingWorkOrderId, workOrderId, diagnosticResults, diagnosticResultsImages? }
 *
 * Auth: Bearer token — must match biddingWorkOrders.subcontractorId.
 */
export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, biddingWorkOrderId } = body;

    if (!type || !biddingWorkOrderId) {
      return NextResponse.json({ error: 'Missing type or biddingWorkOrderId' }, { status: 400 });
    }

    const db = await getServerDb();
    const biddingRef = doc(db, 'biddingWorkOrders', biddingWorkOrderId);
    const biddingSnap = await getDoc(biddingRef);

    if (!biddingSnap.exists()) {
      return NextResponse.json({ error: 'Bidding record not found' }, { status: 404 });
    }

    const biddingData = biddingSnap.data();

    if (biddingData.subcontractorId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (type === 'request') {
      const { diagnosticFee, proposedServiceDate, proposedServiceTime, diagnosticQuoteId } = body;

      if (biddingData.status !== 'diagnostic_requested') {
        return NextResponse.json(
          { error: 'Diagnostic request can only be edited while awaiting acceptance' },
          { status: 409 },
        );
      }

      const feeNum = Number(diagnosticFee);
      if (!Number.isFinite(feeNum) || feeNum <= 0) {
        return NextResponse.json({ error: 'Invalid diagnostic fee' }, { status: 400 });
      }

      await updateDoc(biddingRef, {
        diagnosticFee: feeNum,
        diagnosticEditedAt: serverTimestamp(),
        diagnosticEditedBy: uid,
        updatedAt: serverTimestamp(),
      });

      if (diagnosticQuoteId && proposedServiceDate) {
        try {
          const quoteRef = doc(db, 'quotes', diagnosticQuoteId);
          const quoteSnap = await getDoc(quoteRef);
          if (quoteSnap.exists()) {
            await updateDoc(quoteRef, {
              proposedServiceDate: new Date(proposedServiceDate),
              proposedServiceTime: proposedServiceTime ?? quoteSnap.data().proposedServiceTime,
              editedAt: serverTimestamp(),
              editedBy: uid,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.error('[edit-diagnostic] Quote date update failed (best-effort):', err);
        }
      }

      return NextResponse.json({ ok: true });
    }

    if (type === 'results') {
      const { workOrderId, diagnosticResults, diagnosticResultsImages } = body;

      if (biddingData.status !== 'diagnostic_results_submitted') {
        return NextResponse.json(
          { error: 'Results can only be edited after they have been submitted' },
          { status: 409 },
        );
      }

      if (!diagnosticResults?.trim()) {
        return NextResponse.json({ error: 'diagnosticResults is required' }, { status: 400 });
      }

      await updateDoc(biddingRef, {
        diagnosticResults: diagnosticResults.trim(),
        diagnosticResultsImages: diagnosticResultsImages ?? [],
        diagnosticResultsEditedAt: serverTimestamp(),
        diagnosticResultsEditedBy: uid,
        updatedAt: serverTimestamp(),
      });

      if (workOrderId) {
        try {
          await updateDoc(doc(db, 'workOrders', workOrderId), {
            diagnosticResults: diagnosticResults.trim(),
            diagnosticResultsImages: diagnosticResultsImages ?? [],
            diagnosticResultsEditedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error('[edit-diagnostic] workOrders mirror failed (best-effort):', err);
        }
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (err: any) {
    console.error('[edit-diagnostic] Unexpected error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
