import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Sets a specific saved card as the default payment method for a client.
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

    const paymentMethods: any[] = clientData.paymentMethods || [];
    const targetCard = paymentMethods.find((m: any) => m.id === paymentMethodId);

    if (!targetCard) {
      return NextResponse.json({ error: 'Payment method not found on this client' }, { status: 404 });
    }

    // Update isDefault flag in the array
    const updatedMethods = paymentMethods.map((m: any) => ({
      ...m,
      isDefault: m.id === paymentMethodId,
    }));

    // Update Stripe customer default
    if (clientData.stripeCustomerId) {
      await stripe.customers.update(clientData.stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    await updateDoc(doc(db, 'clients', clientId), {
      paymentMethods: updatedMethods,
      defaultPaymentMethodId: paymentMethodId,
      savedCardLast4: targetCard.last4,
      savedCardBrand: targetCard.brand,
      savedCardExpMonth: targetCard.expMonth,
      savedCardExpYear: targetCard.expYear,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error setting default payment method:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to set default payment method' },
      { status: 500 }
    );
  }
}
