import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

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

    if (!clientData.defaultPaymentMethodId) {
      return NextResponse.json({ error: 'No saved payment method found' }, { status: 400 });
    }

    // Detach the payment method from Stripe
    await stripe.paymentMethods.detach(clientData.defaultPaymentMethodId);

    // Clear billing fields from Firestore
    await updateDoc(doc(db, 'clients', clientId), {
      defaultPaymentMethodId: null,
      savedCardLast4: null,
      savedCardBrand: null,
      savedCardExpMonth: null,
      savedCardExpYear: null,
      autoPayEnabled: false,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing payment method:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove payment method' },
      { status: 500 }
    );
  }
}
