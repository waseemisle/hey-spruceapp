import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Creates a Stripe SetupIntent for inline card collection.
 * Body: { clientId }
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
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

    // Test whether the stored customer ID is valid in the current Stripe mode.
    // If it was created in test mode and we're now in live mode (or vice versa),
    // create a fresh customer and persist the new ID.
    try {
      await stripe.customers.retrieve(stripeCustomerId);
    } catch (e: any) {
      if (e?.code === 'resource_missing') {
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
      } else {
        throw e;
      }
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session',
      metadata: { clientId },
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (error: any) {
    console.error('Error creating setup intent:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create setup intent' },
      { status: 500 }
    );
  }
}
