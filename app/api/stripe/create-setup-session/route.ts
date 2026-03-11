import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Creates a Stripe Checkout session in "setup" mode.
 * The client completes card entry; the webhook saves the payment method.
 */
export async function POST(request: NextRequest) {
  try {
    const { clientId } = await request.json();

    if (!clientId) {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
    }

    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data();

    // Ensure Stripe customer exists
    let stripeCustomerId = clientData.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: clientData.email,
        name: clientData.fullName,
        metadata: { clientId, companyName: clientData.companyName || '' },
      });
      stripeCustomerId = customer.id;
      await updateDoc(doc(db, 'clients', clientId), {
        stripeCustomerId,
        updatedAt: serverTimestamp(),
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://groundopscos.vercel.app';

    // Create Checkout session in setup mode
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      customer: stripeCustomerId,
      success_url: `${baseUrl}/client-portal/payment-methods?setup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/client-portal/payment-methods?setup=cancelled`,
      metadata: {
        clientId,
        type: 'save_card',
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Error creating setup session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create setup session' },
      { status: 500 }
    );
  }
}
