import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createInvoiceTimelineEvent } from '@/lib/timeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature')!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    switch (event.type) {
      // ── One-time checkout (original flow) ────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'payment') {
          await handleSuccessfulPayment(session);
        } else if (session.mode === 'setup') {
          await handleSetupCompleted(session);
        }
        break;
      }

      case 'checkout.session.expired': {
        const expiredSession = event.data.object as Stripe.Checkout.Session;
        await handleExpiredPayment(expiredSession);
        break;
      }

      // ── Off-session PaymentIntent (variable auto-charge) ─────────────────
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentSucceeded(pi);
        break;
      }

      case 'payment_intent.payment_failed': {
        const failedPi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentFailed(failedPi);
        break;
      }

      // ── Stripe Subscription invoices (fixed recurring) ───────────────────
      case 'invoice.paid': {
        const stripeInvoice = event.data.object as Stripe.Invoice;
        await handleSubscriptionInvoicePaid(stripeInvoice);
        break;
      }

      case 'invoice.payment_failed': {
        const stripeInvoice = event.data.object as Stripe.Invoice;
        await handleSubscriptionInvoiceFailed(stripeInvoice);
        break;
      }

      // ── Subscription lifecycle ────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sub);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/** One-time payment checkout completed */
async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  try {
    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId) {
      console.error('No invoice ID found in session metadata');
      return;
    }

    const invSnap = await getDoc(doc(db, 'invoices', invoiceId));
    const invData = invSnap.data();
    const existingTimeline = invData?.timeline || [];
    const existingSysInfo = invData?.systemInformation || {};

    const paidEvent = createInvoiceTimelineEvent({
      type: 'paid',
      userId: 'system',
      userName: 'Payment System',
      userRole: 'system',
      details: 'Payment received via Stripe',
      metadata: { stripeSessionId: session.id },
    });

    await updateDoc(doc(db, 'invoices', invoiceId), {
      status: 'paid',
      paidAt: serverTimestamp(),
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent,
      timeline: [...existingTimeline, paidEvent],
      systemInformation: {
        ...existingSysInfo,
        paidAt: Timestamp.now(),
        paidBy: { id: 'system', name: 'Payment System', timestamp: Timestamp.now() },
      },
      updatedAt: serverTimestamp(),
    });

    console.log(`Invoice ${invoiceId} marked as paid (checkout)`);
  } catch (error) {
    console.error('Error updating invoice status:', error);
  }
}

/** Setup mode checkout completed — save the payment method to the client */
async function handleSetupCompleted(session: Stripe.Checkout.Session) {
  try {
    const clientId = session.metadata?.clientId;
    if (!clientId) {
      console.error('No clientId in setup session metadata');
      return;
    }

    // Retrieve the setup intent to get the payment method
    const setupIntentId = session.setup_intent as string;
    if (!setupIntentId) {
      console.error('No setup_intent in session');
      return;
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = setupIntent.payment_method as string;
    if (!paymentMethodId) {
      console.error('No payment method on setup intent');
      return;
    }

    // Retrieve the payment method to get card details
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

    const card = pm.card;
    await updateDoc(doc(db, 'clients', clientId), {
      defaultPaymentMethodId: paymentMethodId,
      savedCardLast4: card?.last4 || '',
      savedCardBrand: card?.brand || '',
      savedCardExpMonth: card?.exp_month || null,
      savedCardExpYear: card?.exp_year || null,
      autoPayEnabled: true,
      updatedAt: serverTimestamp(),
    });

    // Set as default on the Stripe customer too
    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    const stripeCustomerId = clientDoc.data()?.stripeCustomerId;
    if (stripeCustomerId) {
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    console.log(`Saved payment method for client ${clientId}: ${paymentMethodId}`);
  } catch (error) {
    console.error('Error saving payment method from setup:', error);
  }
}

/** Off-session PaymentIntent succeeded (variable auto-charge) */
async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  try {
    const invoiceId = pi.metadata?.invoiceId;
    if (!invoiceId) return; // Not related to an invoice

    const invSnap = await getDoc(doc(db, 'invoices', invoiceId));
    if (!invSnap.exists()) return;
    const invData = invSnap.data();

    if (invData.status === 'paid') return; // Already handled

    const existingTimeline = invData.timeline || [];
    const existingSysInfo = invData.systemInformation || {};

    const paidEvent = createInvoiceTimelineEvent({
      type: 'paid',
      userId: 'system',
      userName: 'Auto-Pay System',
      userRole: 'system',
      details: 'Payment charged automatically via saved card',
      metadata: { stripePaymentIntentId: pi.id },
    });

    await updateDoc(doc(db, 'invoices', invoiceId), {
      status: 'paid',
      paidAt: serverTimestamp(),
      stripePaymentIntentId: pi.id,
      autoChargeAttempted: true,
      autoChargeStatus: 'succeeded',
      timeline: [...existingTimeline, paidEvent],
      systemInformation: {
        ...existingSysInfo,
        paidAt: Timestamp.now(),
        paidBy: { id: 'system', name: 'Auto-Pay System', timestamp: Timestamp.now() },
      },
      updatedAt: serverTimestamp(),
    });

    console.log(`Invoice ${invoiceId} marked as paid via PaymentIntent ${pi.id}`);
  } catch (error) {
    console.error('Error handling payment_intent.succeeded:', error);
  }
}

/** Off-session PaymentIntent failed */
async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  try {
    const invoiceId = pi.metadata?.invoiceId;
    if (!invoiceId) {
      console.log(`Payment failed for intent: ${pi.id} (no invoiceId in metadata)`);
      return;
    }

    await updateDoc(doc(db, 'invoices', invoiceId), {
      autoChargeAttempted: true,
      autoChargeStatus: 'failed',
      autoChargeError: pi.last_payment_error?.message || 'Payment failed',
      updatedAt: serverTimestamp(),
    });

    console.log(`Invoice ${invoiceId} auto-charge failed`);
  } catch (error) {
    console.error('Error handling payment_intent.payment_failed:', error);
  }
}

/** Subscription (fixed recurring) invoice paid — log it */
async function handleSubscriptionInvoicePaid(stripeInvoice: Stripe.Invoice) {
  try {
    // Subscription invoices don't map to our invoices directly
    // but we can log or update client record
    const clientId = stripeInvoice.metadata?.clientId;
    if (clientId) {
      console.log(`Subscription invoice paid for client ${clientId}: ${stripeInvoice.id}`);
    }
  } catch (error) {
    console.error('Error handling invoice.paid (subscription):', error);
  }
}

/** Subscription invoice payment failed */
async function handleSubscriptionInvoiceFailed(stripeInvoice: Stripe.Invoice) {
  try {
    const clientId = stripeInvoice.metadata?.clientId;
    if (clientId) {
      console.log(`Subscription invoice payment failed for client ${clientId}: ${stripeInvoice.id}`);
    }
  } catch (error) {
    console.error('Error handling invoice.payment_failed (subscription):', error);
  }
}

/** Subscription deleted/cancelled */
async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  try {
    const clientId = sub.metadata?.clientId;
    if (!clientId) return;

    await updateDoc(doc(db, 'clients', clientId), {
      subscriptionStatus: 'cancelled',
      stripeSubscriptionId: null,
      updatedAt: serverTimestamp(),
    });

    console.log(`Subscription cancelled for client ${clientId}`);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

/** Checkout session expired */
async function handleExpiredPayment(session: Stripe.Checkout.Session) {
  try {
    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId) return;

    await updateDoc(doc(db, 'invoices', invoiceId), {
      status: 'expired',
      updatedAt: serverTimestamp(),
    });

    console.log(`Invoice ${invoiceId} marked as expired`);
  } catch (error) {
    console.error('Error updating expired invoice status:', error);
  }
}
