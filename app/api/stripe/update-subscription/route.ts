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

    // Set default payment method on Stripe customer (used as the
    // fallback when a subscription doesn't pin its own).
    await stripe.customers.update(clientData.stripeCustomerId, {
      invoice_settings: { default_payment_method: cardToUse },
    });

    // Always create a fresh Price — Stripe's pricing model is "Prices
    // are immutable, change a sub's price by swapping the Price object
    // attached to its item." The previous Price (if any) is left in
    // place; Stripe doesn't bill against detached Prices.
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: Math.round(Number(amount) * 100),
      recurring: { interval: 'month' },
      product_data: {
        name: `Monthly Service — ${clientData.companyName || clientData.fullName || 'Client'}`,
      },
    });

    // Calculate next billing anchor: same billingDay this month if
    // upcoming, else next month. Date-only comparison so submitting
    // "billingDay = today" doesn't push the anchor a month out (the
    // previous version used `<=` against the same instant, which
    // skipped the current cycle and gave the customer a month free).
    const now = new Date();
    const todayDayOfMonth = now.getDate();
    let anchor = new Date(now.getFullYear(), now.getMonth(), billingDay);
    if (billingDay < todayDayOfMonth) {
      anchor = new Date(now.getFullYear(), now.getMonth() + 1, billingDay);
    }
    const anchorTimestamp = Math.floor(anchor.getTime() / 1000);

    // ── Two paths: update an existing sub vs. create a new one ──────────
    //
    // Stripe's documented pattern for plan/price changes is
    // `subscriptions.update(id, { items: [{ id: <item.id>, price: newPriceId }] })`
    // — keeps the same subscription, allows explicit proration, and
    // preserves the customer's existing Stripe history. Cancelling +
    // recreating (the previous behaviour) loses the link to past
    // invoices, double-counts cancelled-and-recreated subs in Stripe
    // dashboards, and risks money-loss when an old sub is cancelled
    // immediately while the new one's anchor is in the future.
    let subscription: Stripe.Subscription;
    const existingSubId = clientData.stripeSubscriptionId;
    const existingActive =
      existingSubId &&
      ['active', 'past_due', 'trialing', 'pending_cancellation'].includes(
        clientData.subscriptionStatus,
      );

    if (existingActive) {
      // Look up the current sub to find its only item id (we model one
      // sub per client, single Price item).
      const existing = await stripe.subscriptions.retrieve(existingSubId);
      const itemId = existing.items.data[0]?.id;
      if (!itemId) {
        return NextResponse.json(
          { error: 'Existing subscription has no items — cannot update.' },
          { status: 500 }
        );
      }

      subscription = await stripe.subscriptions.update(
        existingSubId,
        {
          items: [{ id: itemId, price: price.id }],
          // Leave proration up to Stripe's invoice — switch behaviour
          // is "no proration" because the admin is reconfiguring the
          // recurring amount, not bridging two cycles.
          proration_behavior: 'none',
          billing_cycle_anchor: 'unchanged',
          default_payment_method: cardToUse,
          // Clear any pending cancel — the admin re-configured the sub,
          // which is a clear signal they don't want it ending.
          cancel_at_period_end: false,
          metadata: {
            clientId,
            type: 'fixed_recurring',
            ...(existing.metadata || {}),
          },
        },
        // Idempotency — a network blip retry of this exact update
        // shouldn't double-write a Price object; Stripe returns the
        // cached response for the same key.
        { idempotencyKey: `sub-update-${existingSubId}-${price.id}` },
      );
    } else {
      // No active sub — create one. (`stripeSubscriptionId` may still
      // be set from a previously cancelled sub; we leave it for audit.)
      subscription = await stripe.subscriptions.create(
        {
          customer: clientData.stripeCustomerId,
          items: [{ price: price.id }],
          billing_cycle_anchor: anchorTimestamp,
          proration_behavior: 'none',
          default_payment_method: cardToUse,
          metadata: { clientId, type: 'fixed_recurring' },
        },
        { idempotencyKey: `sub-create-${clientId}-${price.id}` },
      );
    }

    await updateDoc(doc(db, 'clients', clientId), {
      stripeSubscriptionId: subscription.id,
      subscriptionAmount: Number(amount),
      subscriptionBillingDay: billingDay,
      subscriptionStatus: 'active',
      subscriptionPaymentMethodId: cardToUse,
      subscriptionCancelAtPeriodEnd: false,
      subscriptionEndsAt: null,
      updatedAt: serverTimestamp(),
    });

    const nextBillingTs = subscription.current_period_end
      ? subscription.current_period_end * 1000
      : anchorTimestamp * 1000;

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      nextBillingDate: new Date(nextBillingTs).toISOString(),
      reused: existingActive,
    });
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update subscription' },
      { status: 500 }
    );
  }
}
