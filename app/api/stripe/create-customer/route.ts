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

    // Get client document
    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data();

    // Return existing customer if already created
    if (clientData.stripeCustomerId) {
      return NextResponse.json({ stripeCustomerId: clientData.stripeCustomerId });
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: clientData.email,
      name: clientData.fullName,
      metadata: {
        clientId,
        companyName: clientData.companyName || '',
      },
    });

    // Save stripeCustomerId to Firestore
    await updateDoc(doc(db, 'clients', clientId), {
      stripeCustomerId: customer.id,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ stripeCustomerId: customer.id });
  } catch (error: any) {
    console.error('Error creating Stripe customer:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create Stripe customer' },
      { status: 500 }
    );
  }
}
