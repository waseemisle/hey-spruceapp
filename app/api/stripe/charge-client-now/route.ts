import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Charges a specific saved card for a client immediately (off-session).
 * Records the charge in the clientCharges Firestore collection for transaction history.
 * Scenario 1 only — for manual/admin-initiated charges.
 *
 * Body: { clientId, paymentMethodId, amount (USD dollars), description? }
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
  const body = await request.json();
  const { clientId, paymentMethodId, amount, description } = body;

  if (!clientId || !paymentMethodId || !amount) {
    return NextResponse.json(
      { error: 'Missing required fields: clientId, paymentMethodId, amount' },
      { status: 400 }
    );
  }
  if (Number(amount) <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
  }

  // Load client
  const clientDoc = await getDoc(doc(db, 'clients', clientId));
  if (!clientDoc.exists()) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
  const clientData = clientDoc.data();

  if (!clientData.stripeCustomerId) {
    return NextResponse.json({ error: 'Client has no Stripe customer. Save a card first.' }, { status: 400 });
  }

  // Verify payment method belongs to this client
  const paymentMethods: any[] = clientData.paymentMethods || [];
  const card = paymentMethods.find((m: any) => m.id === paymentMethodId);
  if (!card) {
    return NextResponse.json({ error: 'Payment method not found on this client' }, { status: 400 });
  }

  const amountCents = Math.round(Number(amount) * 100);
  const chargeDescription = description?.trim() || `Manual charge — ${clientData.companyName || clientData.fullName}`;

  const chargeBase = {
    clientId,
    clientName: clientData.companyName || clientData.fullName || '',
    paymentMethodId,
    cardLast4: card.last4,
    cardBrand: card.brand,
    amount: Number(amount),
    description: chargeDescription,
    source: 'manual_admin',
    chargedAt: Timestamp.now(),
    createdAt: serverTimestamp(),
  };

  try {
    // Create off-session PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: clientData.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: chargeDescription,
      metadata: { clientId, cardLast4: card.last4, source: 'manual_admin' },
    });

    const status = paymentIntent.status === 'succeeded' ? 'succeeded' : 'requires_action';

    await addDoc(collection(db, 'clientCharges'), {
      ...chargeBase,
      status,
      stripePaymentIntentId: paymentIntent.id,
    });

    if (status === 'succeeded') {
      return NextResponse.json({
        success: true,
        status: 'succeeded',
        paymentIntentId: paymentIntent.id,
        amount: Number(amount),
      });
    }

    return NextResponse.json({
      success: false,
      status: paymentIntent.status,
      paymentIntentId: paymentIntent.id,
      message: 'Payment requires additional customer authentication (3D Secure).',
    });
  } catch (stripeError: any) {
    // Save the failed attempt so it appears in transaction history
    await addDoc(collection(db, 'clientCharges'), {
      ...chargeBase,
      status: 'failed',
      stripePaymentIntentId: stripeError.payment_intent?.id || '',
      error: stripeError.message,
    });

    return NextResponse.json(
      { error: stripeError.message || 'Card was declined' },
      { status: 400 }
    );
  }
}
