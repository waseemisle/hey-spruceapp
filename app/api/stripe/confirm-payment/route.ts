import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { enrichFromPaymentIntent } from '@/lib/stripe-invoice-enrichment';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Confirms a payment by checking the Stripe Checkout Session status
 * and updating the invoice if payment succeeded or is processing (ACH).
 *
 * Called from the payment-success page as a fallback in case the webhook
 * was delayed or didn't fire.
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
  try {
    const { sessionId, invoiceId } = await request.json();

    if (!sessionId && !invoiceId) {
      return NextResponse.json({ error: 'Missing sessionId or invoiceId' }, { status: 400 });
    }

    // If we have a session ID, verify with Stripe
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const metaInvoiceId = session.metadata?.invoiceId || invoiceId;
      if (!metaInvoiceId) {
        return NextResponse.json({ error: 'No invoice linked to this session' }, { status: 400 });
      }

      // Only mark the invoice paid when Stripe says the payment ACTUALLY
      // settled. `payment_status` is the canonical signal:
      //   • 'paid'                 → money received (card cleared, ACH settled)
      //   • 'unpaid'               → ACH still processing (`checkout.session.async_payment_succeeded`
      //                              will fire later — DO NOT mark paid yet,
      //                              wait for the webhook)
      //   • 'no_payment_required'  → \$0 session, no money moved (don't pretend)
      // The previous version flipped to paid on `session.status === 'complete'`
      // alone, which is true for ACH-not-yet-settled and for $0 sessions —
      // both wrote a paid invoice with no money received. Hard-gate on
      // `payment_status === 'paid'` and surface the in-progress state to the
      // caller so the success page can show "processing" without lying.
      if (session.payment_status !== 'paid') {
        return NextResponse.json({
          success: true,
          updated: false,
          paymentStatus: session.payment_status,
          sessionStatus: session.status,
          message:
            session.payment_status === 'unpaid'
              ? 'Payment is processing — Stripe will confirm settlement via webhook.'
              : session.payment_status === 'no_payment_required'
                ? 'Session collected no payment.'
                : 'Payment not completed.',
        });
      }

      const invSnap = await getDoc(doc(db, 'invoices', metaInvoiceId));
      if (invSnap.exists()) {
        const invData = invSnap.data();
        // If the webhook already wrote AND enriched, just report success.
        if (invData.status === 'paid' && invData.stripeChargeId) {
          return NextResponse.json({ success: true, updated: false, status: 'already_paid' });
        }

        const paymentType = session.metadata?.paymentType || 'card';
        const paymentLabel = paymentType === 'ach_bank_transfer' ? 'ACH bank transfer' : 'Stripe';

        // Resolve charge / receipt / card details from Stripe so the
        // success-page redirect (which calls this route) lands on a fully
        // enriched invoice even if the webhook is delayed or never fires.
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null;
        const enrichment = paymentIntentId
          ? await enrichFromPaymentIntent(stripe, paymentIntentId)
          : { fields: {}, error: null };
        const sessionCustomerEmail = session.customer_details?.email || session.customer_email || null;
        const customerEmail = enrichment.fields.stripeCustomerEmail || sessionCustomerEmail || null;

        await updateDoc(doc(db, 'invoices', metaInvoiceId), {
          status: 'paid',
          paidAt: serverTimestamp(),
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          ...enrichment.fields,
          ...(customerEmail ? { stripeCustomerEmail: customerEmail } : {}),
          ...(enrichment.error ? { stripeEnrichmentError: enrichment.error } : {}),
          timeline: [
            ...(invData.timeline || []),
            {
              id: `paid_${Date.now()}`,
              timestamp: new Date(),
              type: 'paid',
              userId: 'system',
              userName: 'Payment System',
              userRole: 'system',
              details: `Payment received via ${paymentLabel}`,
              metadata: { stripeSessionId: session.id },
            },
          ],
          systemInformation: {
            ...(invData.systemInformation || {}),
            paidAt: Timestamp.now(),
            paidBy: { id: 'system', name: 'Payment System', timestamp: Timestamp.now() },
          },
          updatedAt: serverTimestamp(),
        });

        return NextResponse.json({ success: true, updated: true, status: 'paid' });
      }

      return NextResponse.json({ success: true, updated: false, paymentStatus: session.payment_status });
    }

    return NextResponse.json({ success: false, error: 'No session ID provided' });
  } catch (error: any) {
    console.error('Error confirming payment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
