import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Saves a confirmed payment method to the client's Firestore profile.
 * Call this after stripe.confirmCardSetup() succeeds on the client.
 * Body: { clientId, paymentMethodId }
 */
export async function POST(request: NextRequest) {
  try {
    const { clientId, paymentMethodId } = await request.json();
    if (!clientId || !paymentMethodId) {
      return NextResponse.json({ error: 'Missing clientId or paymentMethodId' }, { status: 400 });
    }

    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data();

    // Retrieve payment method from Stripe
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const card = pm.card;

    // Check for duplicates
    const existingMethods: any[] = clientData.paymentMethods || [];
    const alreadyExists = existingMethods.some((m: any) => m.id === paymentMethodId);
    if (alreadyExists) {
      return NextResponse.json({ success: true, message: 'Card already saved' });
    }

    // Attach payment method to Stripe customer if not already
    if (clientData.stripeCustomerId && pm.customer !== clientData.stripeCustomerId) {
      try {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: clientData.stripeCustomerId,
        });
      } catch (e: any) {
        if (!e.message?.includes('already been attached')) throw e;
      }
    }

    const newCard = {
      id: paymentMethodId,
      last4: card?.last4 || '',
      brand: card?.brand || '',
      expMonth: card?.exp_month || null,
      expYear: card?.exp_year || null,
      isDefault: true,
      createdAt: Timestamp.now(),
    };

    // New card becomes default; all existing cards are non-default
    const updatedMethods = [
      ...existingMethods.map((m: any) => ({ ...m, isDefault: false })),
      newCard,
    ];

    await updateDoc(doc(db, 'clients', clientId), {
      paymentMethods: updatedMethods,
      defaultPaymentMethodId: paymentMethodId,
      savedCardLast4: card?.last4 || '',
      savedCardBrand: card?.brand || '',
      savedCardExpMonth: card?.exp_month || null,
      savedCardExpYear: card?.exp_year || null,
      autoPayEnabled: true,
      updatedAt: serverTimestamp(),
    });

    // Set as default on Stripe customer
    if (clientData.stripeCustomerId) {
      await stripe.customers.update(clientData.stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving payment method:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save payment method' },
      { status: 500 }
    );
  }
}
