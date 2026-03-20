import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Updates a client's fixed recurring subscription (Scenario 1).
 * Cancels the existing subscription and creates a new one with the updated params.
 *
 * Body: { clientId, amount (USD), billingDay (1-28), paymentMethodId? }
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
  try {
    const { clientId, amount, billingDay, paymentMethodId: specificCardId } = await request.json();

    if (!clientId || !amount || !billingDay) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, amount, billingDay' },
        { status: 400 }
      );
    }
    if (Number(amount) <= 0) {
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

    if (!clientData.stripeCustomerId || !clientData.defaultPaymentMethodId) {
      return NextResponse.json(
        { error: 'Client must have a saved payment method before creating a subscription.' },
        { status: 400 }
      );
    }

    const cardToUse = specificCardId || clientData.defaultPaymentMethodId;

    // Verify card belongs to this client
    const paymentMethods: any[] = clientData.paymentMethods || [];
    if (specificCardId && !paymentMethods.some((m: any) => m.id === specificCardId)) {
      return NextResponse.json({ error: 'Specified card not found on this client' }, { status: 400 });
    }

    // Cancel existing subscription if present
    if (clientData.stripeSubscriptionId && clientData.subscriptionStatus === 'active') {
      try {
        await stripe.subscriptions.cancel(clientData.stripeSubscriptionId);
      } catch (e: any) {
        // Ignore "no such subscription" errors (already cancelled on Stripe side)
        if (!e.message?.toLowerCase().includes('no such subscription')) throw e;
      }
    }

    // Set default payment method on Stripe customer
    await stripe.customers.update(clientData.stripeCustomerId, {
      invoice_settings: { default_payment_method: cardToUse },
    });

    // Create inline Price
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: Math.round(Number(amount) * 100),
      recurring: { interval: 'month' },
      product_data: {
        name: `Monthly Service — ${clientData.companyName || clientData.fullName || 'Client'}`,
      },
    });

    // Calculate billing_cycle_anchor: next occurrence of billingDay
    const now = new Date();
    let anchor = new Date(now.getFullYear(), now.getMonth(), billingDay);
    if (anchor <= now) {
      anchor = new Date(now.getFullYear(), now.getMonth() + 1, billingDay);
    }
    const anchorTimestamp = Math.floor(anchor.getTime() / 1000);

    // Create new subscription
    const subscription = await stripe.subscriptions.create({
      customer: clientData.stripeCustomerId,
      items: [{ price: price.id }],
      billing_cycle_anchor: anchorTimestamp,
      proration_behavior: 'none',
      default_payment_method: cardToUse,
      metadata: { clientId, type: 'fixed_recurring' },
    });

    await updateDoc(doc(db, 'clients', clientId), {
      stripeSubscriptionId: subscription.id,
      subscriptionAmount: Number(amount),
      subscriptionBillingDay: billingDay,
      subscriptionStatus: 'active',
      subscriptionPaymentMethodId: cardToUse,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      nextBillingDate: new Date(anchorTimestamp * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update subscription' },
      { status: 500 }
    );
  }
}
