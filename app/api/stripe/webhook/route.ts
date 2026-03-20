import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { collection, doc, addDoc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import { sendAutoChargeReceiptEmail } from '@/lib/auto-charge-email';

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
    const db = await getServerDb();
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

    // If session used setup_future_usage, save the payment method to the client
    const clientId = session.metadata?.clientId;
    if (clientId && session.payment_intent) {
      try {
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent.id;
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const paymentMethodId = typeof pi.payment_method === 'string'
          ? pi.payment_method
          : pi.payment_method?.id;

        if (paymentMethodId && pi.setup_future_usage === 'off_session') {
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

          // Set as default on Stripe customer too
          const clientDoc = await getDoc(doc(db, 'clients', clientId));
          const stripeCustomerId = clientDoc.data()?.stripeCustomerId;
          if (stripeCustomerId) {
            await stripe.customers.update(stripeCustomerId, {
              invoice_settings: { default_payment_method: paymentMethodId },
            });
          }

          console.log(`Saved payment method for client ${clientId} from first payment: ${paymentMethodId}`);
        }
      } catch (pmError) {
        console.error('Error saving payment method from checkout payment:', pmError);
      }
    }
  } catch (error) {
    console.error('Error updating invoice status:', error);
  }
}

/** Setup mode checkout completed — add the payment method to the client's card list */
async function handleSetupCompleted(session: Stripe.Checkout.Session) {
  try {
    const db = await getServerDb();
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

    // Load existing paymentMethods array
    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    const clientData = clientDoc.data();
    const existingMethods: any[] = clientData?.paymentMethods || [];

    // Check if this payment method already exists (idempotency)
    const alreadyExists = existingMethods.some((m: any) => m.id === paymentMethodId);
    if (alreadyExists) {
      console.log(`Payment method ${paymentMethodId} already saved for client ${clientId}`);
      return;
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

    // Mark all existing cards as non-default, new card becomes default
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

    // Set as default on the Stripe customer too
    const stripeCustomerId = clientData?.stripeCustomerId;
    if (stripeCustomerId) {
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    console.log(`Saved payment method for client ${clientId}: ${paymentMethodId} (total: ${updatedMethods.length} cards)`);
  } catch (error) {
    console.error('Error saving payment method from setup:', error);
  }
}

/** Off-session PaymentIntent succeeded (variable auto-charge) */
async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  try {
    const db = await getServerDb();
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
    const db = await getServerDb();
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

/** Subscription (fixed recurring) invoice paid — create invoice record + send receipt email */
async function handleSubscriptionInvoicePaid(stripeInvoice: Stripe.Invoice) {
  try {
    const db = await getServerDb();
    // Skip $0 invoices (e.g. trial or setup invoice)
    if (!stripeInvoice.amount_paid || stripeInvoice.amount_paid === 0) return;

    // Get clientId from subscription metadata (invoice metadata may be empty)
    let clientId = stripeInvoice.metadata?.clientId;
    let subscriptionId: string | undefined;
    if (!clientId && stripeInvoice.subscription) {
      subscriptionId = typeof stripeInvoice.subscription === 'string'
        ? stripeInvoice.subscription
        : stripeInvoice.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      clientId = sub.metadata?.clientId;
    }

    if (!clientId) {
      console.log(`Subscription invoice paid but no clientId found: ${stripeInvoice.id}`);
      return;
    }

    // Load client data
    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) return;
    const clientData = clientDoc.data();

    const amount = stripeInvoice.amount_paid / 100; // Stripe amounts are in cents
    const invoiceNumber = `SPRUCE-SUB-${Date.now().toString().slice(-8).toUpperCase()}`;

    const stripePaymentIntentId = typeof stripeInvoice.payment_intent === 'string'
      ? stripeInvoice.payment_intent
      : stripeInvoice.payment_intent?.id || '';

    const paidEvent = createInvoiceTimelineEvent({
      type: 'paid',
      userId: 'system',
      userName: 'Subscription Auto-Pay',
      userRole: 'system',
      details: `Fixed recurring subscription payment — $${amount.toFixed(2)} auto-charged`,
      metadata: { stripeInvoiceId: stripeInvoice.id },
    });

    await addDoc(collection(db, 'invoices'), {
      invoiceNumber,
      clientId,
      clientName: clientData.fullName || '',
      clientEmail: clientData.email || '',
      status: 'paid',
      totalAmount: amount,
      stripePaymentIntentId,
      autoChargeAttempted: true,
      autoChargeStatus: 'succeeded',
      workOrderTitle: `Monthly Subscription — ${clientData.subscriptionAmount ? `$${clientData.subscriptionAmount}/month` : ''}`,
      lineItems: [{
        description: 'Monthly recurring service',
        quantity: 1,
        unitPrice: amount,
        amount,
      }],
      paidAt: serverTimestamp(),
      creationSource: 'subscription',
      stripeSubscriptionId: subscriptionId || clientData.stripeSubscriptionId || '',
      timeline: [paidEvent],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log(`Subscription invoice paid for client ${clientId}: ${stripeInvoice.id} — $${amount}`);

    // ── Send receipt email with PDF attachment ────────────────────────────────
    if (clientData.email) {
      // Find the card used for this subscription (prefer subscriptionPaymentMethodId)
      const subCardId = clientData.subscriptionPaymentMethodId || clientData.defaultPaymentMethodId;
      const paymentMethods: any[] = clientData.paymentMethods || [];
      const usedCard = paymentMethods.find((m: any) => m.id === subCardId)
        || (clientData.savedCardLast4 ? {
            brand: clientData.savedCardBrand || 'card',
            last4: clientData.savedCardLast4,
          } : null);

      await sendAutoChargeReceiptEmail({
        clientEmail: clientData.email,
        clientName: clientData.fullName || clientData.companyName || 'Valued Client',
        amount,
        invoiceNumber,
        chargedAt: new Date(),
        cardBrand: usedCard?.brand || 'card',
        cardLast4: usedCard?.last4 || '****',
        subscriptionAmount: clientData.subscriptionAmount || amount,
        subscriptionBillingDay: clientData.subscriptionBillingDay || 1,
        stripePaymentIntentId,
        stripeInvoiceId: stripeInvoice.id,
      });
    } else {
      console.warn(`[Webhook] No email on client ${clientId} — skipping receipt email`);
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
    const db = await getServerDb();
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
    const db = await getServerDb();
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
