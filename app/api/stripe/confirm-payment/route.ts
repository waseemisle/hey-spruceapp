import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

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

      // Check if payment completed or is processing (ACH)
      const isComplete = session.payment_status === 'paid';
      const isProcessing = session.payment_status === 'no_payment_required' || session.status === 'complete';

      if (isComplete || isProcessing || session.status === 'complete') {
        const invSnap = await getDoc(doc(db, 'invoices', metaInvoiceId));
        if (invSnap.exists()) {
          const invData = invSnap.data();
          if (invData.status !== 'paid') {
            const paymentType = session.metadata?.paymentType || 'card';
            const paymentLabel = paymentType === 'ach_bank_transfer' ? 'ACH bank transfer' : 'Stripe';

            await updateDoc(doc(db, 'invoices', metaInvoiceId), {
              status: 'paid',
              paidAt: serverTimestamp(),
              stripeSessionId: session.id,
              stripePaymentIntentId: session.payment_intent || null,
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
          return NextResponse.json({ success: true, updated: false, status: 'already_paid' });
        }
      }

      return NextResponse.json({ success: true, updated: false, paymentStatus: session.payment_status });
    }

    return NextResponse.json({ success: false, error: 'No session ID provided' });
  } catch (error: any) {
    console.error('Error confirming payment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
