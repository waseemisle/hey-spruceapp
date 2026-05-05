import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

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

    if (!clientData.stripeSubscriptionId) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 });
    }

    // Cancel at period end — the customer keeps the paid time they're
    // entitled to. `subscriptions.cancel()` (the previous call here) is
    // IMMEDIATE per Stripe docs, which would forfeit any unused time and
    // emit `customer.subscription.deleted` right away. The correct API
    // for "cancel at period end" is `subscriptions.update(id, {
    // cancel_at_period_end: true })`.
    const sub = await stripe.subscriptions.update(clientData.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Keep stripeSubscriptionId on the client doc — we need it to look
    // up the subscription when the final period-end webhook
    // (`customer.subscription.deleted`) fires. Nulling it would orphan
    // the webhook handler and leave the client doc out of sync.
    // Status flips to 'pending_cancellation' so the UI can show "ends on
    // <period end date>" until the deletion event arrives, at which
    // point handleSubscriptionDeleted flips it to 'cancelled'.
    await updateDoc(doc(db, 'clients', clientId), {
      subscriptionStatus: 'pending_cancellation',
      subscriptionCancelAtPeriodEnd: true,
      subscriptionEndsAt: sub.current_period_end
        ? Timestamp.fromMillis(sub.current_period_end * 1000)
        : null,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      cancelAtPeriodEnd: true,
      endsAt: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    });
  } catch (error: any) {
    console.error('Error cancelling subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}
