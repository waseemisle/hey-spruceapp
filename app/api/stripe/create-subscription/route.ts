import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Creates a fixed recurring Stripe Subscription for a client.
 * Uses billing_cycle_anchor to charge on a specific day each month.
 *
 * Body: { clientId, amount (USD), billingDay (1-28), description }
 */
export async function POST(request: NextRequest) {
  try {
    const { clientId, amount, billingDay, description } = await request.json();

    if (!clientId || !amount || !billingDay) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, amount, billingDay' },
        { status: 400 }
      );
    }
    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }
    if (billingDay < 1 || billingDay > 28) {
      return NextResponse.json({ error: 'billingDay must be between 1 and 28' }, { status: 400 });
    }

    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data();

    // Client must have a saved payment method (collected via setup session)
    if (!clientData.stripeCustomerId || !clientData.defaultPaymentMethodId) {
      return NextResponse.json(
        { error: 'Client must have a saved payment method before creating a subscription.' },
        { status: 400 }
      );
    }

    // Set default payment method on the Stripe customer
    await stripe.customers.update(clientData.stripeCustomerId, {
      invoice_settings: { default_payment_method: clientData.defaultPaymentMethodId },
    });

    // Create a Price (inline product)
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: Math.round(amount * 100),
      recurring: { interval: 'month' },
      product_data: {
        name: description || `Monthly Service — ${clientData.fullName}`,
      },
    });

    // Calculate billing_cycle_anchor: next occurrence of billingDay
    const now = new Date();
    let anchor = new Date(now.getFullYear(), now.getMonth(), billingDay);
    // If that day is in the past (or today), move to next month
    if (anchor <= now) {
      anchor = new Date(now.getFullYear(), now.getMonth() + 1, billingDay);
    }
    const anchorTimestamp = Math.floor(anchor.getTime() / 1000);

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: clientData.stripeCustomerId,
      items: [{ price: price.id }],
      billing_cycle_anchor: anchorTimestamp,
      proration_behavior: 'none',
      default_payment_method: clientData.defaultPaymentMethodId,
      metadata: {
        clientId,
        type: 'fixed_recurring',
      },
    });

    // Save subscription info to client
    await updateDoc(doc(db, 'clients', clientId), {
      stripeSubscriptionId: subscription.id,
      subscriptionAmount: amount,
      subscriptionBillingDay: billingDay,
      subscriptionStatus: 'active',
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      nextBillingDate: new Date(anchorTimestamp * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
