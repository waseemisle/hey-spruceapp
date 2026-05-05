import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { collection, doc, addDoc, getDoc, getDocs, query, where, limit as fsLimit, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import { sendAutoChargeReceiptEmail } from '@/lib/auto-charge-email';
import { generateInvoiceNumber } from '@/lib/invoice-number';
import { enrichFromPaymentIntent } from '@/lib/stripe-invoice-enrichment';
import {
  recordPaymentEvent,
  fromPaymentIntent,
  fromCharge,
  fromInvoice,
  fromSetupIntent,
  fromCheckoutSession,
  resolveInvoiceLinkage,
  buildMutation,
} from '@/lib/payment-logs';
import type { PaymentLog, PaymentLogMutation } from '@/types';

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

    // Always capture the event in paymentLogs first — independent of
    // whether we have a downstream handler for it. The Payment Logs
    // admin page is the audit-of-record so we want the row even for
    // events we currently treat as informational (charge.refunded,
    // setup_intent.setup_failed, dispute.*). Idempotent: re-deliveries
    // of the same event id merge into the existing row.
    const __paymentLogId = await logWebhookEvent(event).catch((err) => {
      console.error('[stripe webhook] logWebhookEvent threw (non-fatal):', err);
      return undefined;
    });

    switch (event.type) {
      // ── One-time checkout (original flow) ────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'payment') {
          // For ACH (us_bank_account) checkout, this event fires when the
          // customer authorizes — `payment_status` is still 'unpaid' until
          // the bank confirms settlement (1–4 business days). The canonical
          // settlement event for delayed payment methods is
          // `checkout.session.async_payment_succeeded`, handled below.
          // Only flip the invoice to paid when Stripe says the money is
          // actually in.
          if (session.payment_status === 'paid') {
            await handleSuccessfulPayment(session);
          } else {
            console.log(
              `checkout.session.completed for ${session.id} with payment_status=${session.payment_status} — waiting for async settlement event`,
            );
          }
        } else if (session.mode === 'setup') {
          await handleSetupCompleted(session);
        }
        break;
      }

      // ── Async payment outcome (ACH / delayed payment methods) ────────────
      // For us_bank_account / SEPA / OXXO etc., `checkout.session.completed`
      // arrives before settlement. These events are the truth.
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleSuccessfulPayment(session);
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleAsyncPaymentFailed(session);
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

      // ── Stripe Invoice events ────────────────────────────────────────────
      // Two flavors share these events:
      //   • One-off invoices created by /api/stripe/create-payment-link
      //     (carry metadata.invoiceId pointing at a Firestore invoice).
      //   • Subscription invoices for fixed recurring plans (have
      //     stripeInvoice.subscription set; metadata.invoiceId is missing).
      case 'invoice.paid': {
        const stripeInvoice = event.data.object as Stripe.Invoice;
        if (stripeInvoice.metadata?.invoiceId) {
          await handleHostedInvoicePaid(stripeInvoice);
        } else if (stripeInvoice.subscription) {
          await handleSubscriptionInvoicePaid(stripeInvoice);
        } else {
          console.log(`invoice.paid received with no invoiceId or subscription: ${stripeInvoice.id}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const stripeInvoice = event.data.object as Stripe.Invoice;
        if (stripeInvoice.metadata?.invoiceId) {
          await handleHostedInvoicePaymentFailed(stripeInvoice);
        } else if (stripeInvoice.subscription) {
          await handleSubscriptionInvoiceFailed(stripeInvoice);
        }
        break;
      }

      // ── Subscription lifecycle ────────────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(sub);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sub);
        break;
      }

      // ── Logging-only events ──────────────────────────────────────────────
      // These currently have no Firestore-mutating handler — the
      // logWebhookEvent call above already captured them in paymentLogs
      // so the admin can audit them. We list them explicitly (instead
      // of falling through to default) to make their "we know about
      // these" status clear in the code.
      case 'charge.succeeded':
      case 'charge.failed':
      case 'charge.refunded':
      case 'charge.dispute.created':
      case 'charge.dispute.closed':
      case 'charge.dispute.funds_withdrawn':
      case 'charge.dispute.funds_reinstated':
      case 'setup_intent.succeeded':
      case 'setup_intent.setup_failed':
      case 'payment_intent.requires_action':
      case 'payment_intent.processing':
      case 'payment_intent.canceled':
      case 'invoice.payment_action_required':
      case 'invoice.finalized':
      case 'invoice.voided':
        // Captured in paymentLogs. No further action required.
        break;

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
    // Idempotency — webhook may retry, and a separate confirm-payment poll
    // can race the webhook. Skip if we already enriched.
    if (invData?.status === 'paid' && invData?.stripeChargeId) {
      console.log(`Invoice ${invoiceId} already paid + enriched — skipping`);
      return;
    }
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

    // Resolve PI + charge details. Failure here MUST NOT block marking the
    // invoice paid — the customer's money already moved.
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null;
    const enrichment = paymentIntentId
      ? await enrichFromPaymentIntent(stripe, paymentIntentId)
      : { fields: {}, error: 'No payment_intent on checkout session' };

    // Customer email from the session beats nothing; charge email beats both
    // (set by enrichment above when present).
    const sessionCustomerEmail = session.customer_details?.email || session.customer_email || null;
    const customerEmail = enrichment.fields.stripeCustomerEmail || sessionCustomerEmail || null;

    await updateDoc(doc(db, 'invoices', invoiceId), {
      status: 'paid',
      paidAt: serverTimestamp(),
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      ...enrichment.fields,
      ...(customerEmail ? { stripeCustomerEmail: customerEmail } : {}),
      ...(enrichment.error ? { stripeEnrichmentError: enrichment.error } : {}),
      timeline: [...existingTimeline, paidEvent],
      systemInformation: {
        ...existingSysInfo,
        paidAt: Timestamp.now(),
        paidBy: { id: 'system', name: 'Payment System', timestamp: Timestamp.now() },
      },
      updatedAt: serverTimestamp(),
    });

    console.log(`Invoice ${invoiceId} marked as paid (checkout)${enrichment.fields.stripeReceiptUrl ? ' with receipt' : ''}`);

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

    // Idempotency — already paid + enriched, nothing to do
    if (invData.status === 'paid' && invData.stripeChargeId) return;

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

    // Same enrichment as the checkout flow — pull charge, receipt URL,
    // card brand/last4, balance txn, and amount received from Stripe.
    const enrichment = await enrichFromPaymentIntent(stripe, pi.id);

    await updateDoc(doc(db, 'invoices', invoiceId), {
      status: 'paid',
      paidAt: serverTimestamp(),
      stripePaymentIntentId: pi.id,
      autoChargeAttempted: true,
      autoChargeStatus: 'succeeded',
      ...enrichment.fields,
      ...(enrichment.error ? { stripeEnrichmentError: enrichment.error } : {}),
      timeline: [...existingTimeline, paidEvent],
      systemInformation: {
        ...existingSysInfo,
        paidAt: Timestamp.now(),
        paidBy: { id: 'system', name: 'Auto-Pay System', timestamp: Timestamp.now() },
      },
      updatedAt: serverTimestamp(),
    });

    console.log(`Invoice ${invoiceId} marked as paid via PaymentIntent ${pi.id}${enrichment.fields.stripeReceiptUrl ? ' with receipt' : ''}`);
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

    // Capture full decline metadata so the admin Payment Logs page sees
    // the same level of detail the synchronous charge route produces.
    // Previously this handler only wrote `autoChargeError: <message>` —
    // when the failure arrived via webhook (e.g. ACH bouncing 4 days
    // later) the Firestore invoice was missing decline_code, failure
    // code, and the timestamp of the failure entirely.
    const failureMessage = pi.last_payment_error?.message || 'Payment failed';
    const failureCode = pi.last_payment_error?.code as string | undefined;
    const declineCode = (pi.last_payment_error as any)?.decline_code as string | undefined;

    await updateDoc(doc(db, 'invoices', invoiceId), {
      autoChargeAttempted: true,
      autoChargeStatus: 'failed',
      autoChargeError: failureMessage,
      autoChargeFailedAt: serverTimestamp(),
      ...(failureCode ? { autoChargeFailureCode: failureCode } : {}),
      ...(declineCode ? { autoChargeDeclineCode: declineCode } : {}),
      updatedAt: serverTimestamp(),
    });

    console.log(
      `Invoice ${invoiceId} auto-charge failed${failureCode ? ` [${failureCode}]` : ''}${declineCode ? ` decline=${declineCode}` : ''}: ${failureMessage}`,
    );
  } catch (error) {
    console.error('Error handling payment_intent.payment_failed:', error);
  }
}

/**
 * Hosted Stripe Invoice (one-off) was paid by the client. Mark the matching
 * Firestore invoice (referenced via stripeInvoice.metadata.invoiceId) as paid.
 */
async function handleHostedInvoicePaid(stripeInvoice: Stripe.Invoice) {
  try {
    const db = await getServerDb();
    const invoiceId = stripeInvoice.metadata?.invoiceId;
    if (!invoiceId) return;

    const invSnap = await getDoc(doc(db, 'invoices', invoiceId));
    if (!invSnap.exists()) {
      console.warn(`Stripe invoice paid but Firestore invoice not found: ${invoiceId}`);
      return;
    }
    const invData = invSnap.data();
    if (invData?.status === 'paid') return;

    const existingTimeline = invData?.timeline || [];
    const existingSysInfo = invData?.systemInformation || {};

    const paidEvent = createInvoiceTimelineEvent({
      type: 'paid',
      userId: 'system',
      userName: 'Payment System',
      userRole: 'system',
      details: 'Payment received via Stripe hosted invoice',
      metadata: { stripeInvoiceId: stripeInvoice.id, hostedInvoiceUrl: stripeInvoice.hosted_invoice_url || '' },
    });

    // Resolve receipt_url from the latest charge so the admin/client can
    // download the customer-facing payment receipt directly.
    let receiptUrl: string | null = null;
    let chargeId: string | null = null;
    try {
      const piRef = stripeInvoice.payment_intent;
      const paymentIntentId = typeof piRef === 'string' ? piRef : piRef?.id || null;
      if (paymentIntentId) {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
        const latest: any = (pi as any).latest_charge;
        if (latest && typeof latest === 'object') {
          chargeId = latest.id || null;
          receiptUrl = latest.receipt_url || null;
        } else if (typeof latest === 'string') {
          chargeId = latest;
          const charge = await stripe.charges.retrieve(latest);
          receiptUrl = charge.receipt_url || null;
        }
      }
    } catch (rcErr) {
      console.warn('Could not resolve charge receipt for paid invoice:', rcErr);
    }

    // If this was an auto-charged invoice (created with
    // collection_method=charge_automatically), Stripe set
    // metadata.autoCharge='true' on the invoice. Capture the auto-charge
    // success state on the Firestore doc so the admin UI's status pill
    // stays accurate.
    const wasAutoCharge = stripeInvoice.metadata?.autoCharge === 'true';

    await updateDoc(doc(db, 'invoices', invoiceId), {
      status: 'paid',
      paidAt: serverTimestamp(),
      stripeInvoiceId: stripeInvoice.id,
      stripePaymentIntentId: typeof stripeInvoice.payment_intent === 'string'
        ? stripeInvoice.payment_intent
        : stripeInvoice.payment_intent?.id || null,
      stripeChargeId: chargeId,
      stripeReceiptUrl: receiptUrl,
      stripeInvoicePdf: stripeInvoice.invoice_pdf || null,
      stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url || null,
      ...(wasAutoCharge ? { autoChargeAttempted: true, autoChargeStatus: 'succeeded' } : {}),
      timeline: [...existingTimeline, paidEvent],
      systemInformation: {
        ...existingSysInfo,
        paidAt: Timestamp.now(),
        paidBy: { id: 'system', name: 'Payment System', timestamp: Timestamp.now() },
      },
      updatedAt: serverTimestamp(),
    });

    // After-payment payment-method save: when a client pays a hosted
    // invoice for the first time, persist the card/bank used so the admin
    // can auto-charge subsequent invoices for the same client without
    // asking the client to add a card again. Only saves if the client
    // doesn't already have a default PM (avoid clobbering an admin-added
    // primary), and only when a non-recurring PM was used.
    const clientId = invData?.clientId;
    if (clientId && stripeInvoice.payment_intent) {
      try {
        const piId = typeof stripeInvoice.payment_intent === 'string'
          ? stripeInvoice.payment_intent
          : stripeInvoice.payment_intent.id;
        const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['payment_method'] });
        const paidPm: any = pi.payment_method;
        const paidPmId = typeof paidPm === 'string' ? paidPm : paidPm?.id;
        if (paidPmId) {
          const clientRef = doc(db, 'clients', clientId);
          const clientSnap = await getDoc(clientRef);
          if (clientSnap.exists()) {
            const clientData = clientSnap.data();
            const existingMethods: any[] = clientData?.paymentMethods || [];
            const alreadyKnown = existingMethods.some((m: any) => m.id === paidPmId)
              || clientData?.defaultPaymentMethodId === paidPmId;
            if (!alreadyKnown) {
              const pmObj = typeof paidPm === 'string'
                ? await stripe.paymentMethods.retrieve(paidPmId)
                : paidPm;

              // Attach to customer for off-session charging on future invoices.
              if (clientData?.stripeCustomerId && pmObj.customer == null) {
                try {
                  await stripe.paymentMethods.attach(paidPmId, { customer: clientData.stripeCustomerId });
                } catch (attachErr: any) {
                  if (attachErr?.code !== 'payment_method_already_attached') {
                    console.warn('[webhook] Could not attach PM to customer:', attachErr?.message);
                  }
                }
              }

              const isCard = pmObj.type === 'card';
              const isBank = pmObj.type === 'us_bank_account';
              // Provenance tag — distinguishes "auto-saved from a paid
              // invoice" from "admin added via the client detail page" so
              // we can show a clear badge on the saved PM row and the
              // admin can verify the auto-save loop is working.
              const sourceMeta = {
                source: 'invoice_payment' as const,
                sourceInvoiceId: invoiceId,
                sourceInvoiceNumber: invData?.invoiceNumber || '',
              };
              const newMethod = isCard ? {
                id: paidPmId,
                type: 'card',
                last4: pmObj.card?.last4 || '',
                brand: pmObj.card?.brand || 'card',
                expMonth: pmObj.card?.exp_month || null,
                expYear: pmObj.card?.exp_year || null,
                isDefault: !clientData?.defaultPaymentMethodId,
                createdAt: Timestamp.now(),
                ...sourceMeta,
              } : isBank ? {
                id: paidPmId,
                type: 'us_bank_account',
                last4: pmObj.us_bank_account?.last4 || '',
                brand: pmObj.us_bank_account?.bank_name || 'Bank',
                bankName: pmObj.us_bank_account?.bank_name || '',
                routingNumber: pmObj.us_bank_account?.routing_number || '',
                accountType: pmObj.us_bank_account?.account_type || 'checking',
                accountHolderType: pmObj.us_bank_account?.account_holder_type || 'individual',
                isDefault: !clientData?.defaultPaymentMethodId,
                verificationStatus: 'verified',
                createdAt: Timestamp.now(),
                ...sourceMeta,
              } : null;

              if (newMethod) {
                const updatePayload: Record<string, any> = {
                  paymentMethods: [...existingMethods, newMethod],
                  updatedAt: serverTimestamp(),
                };
                if (!clientData?.defaultPaymentMethodId) {
                  updatePayload.defaultPaymentMethodId = paidPmId;
                  updatePayload.autoPayEnabled = true;
                  if (isCard) {
                    updatePayload.savedCardLast4 = pmObj.card?.last4 || '';
                    updatePayload.savedCardBrand = pmObj.card?.brand || '';
                    updatePayload.savedCardExpMonth = pmObj.card?.exp_month || null;
                    updatePayload.savedCardExpYear = pmObj.card?.exp_year || null;
                  }
                  if (clientData?.stripeCustomerId) {
                    try {
                      await stripe.customers.update(clientData.stripeCustomerId, {
                        invoice_settings: { default_payment_method: paidPmId },
                      });
                    } catch (custErr: any) {
                      console.warn('[webhook] Could not set default PM on Stripe customer:', custErr?.message);
                    }
                  }
                }
                await updateDoc(clientRef, updatePayload);
                console.log(`[webhook] Auto-saved ${isCard ? 'card' : 'bank'} ${paidPmId} for client ${clientId} from hosted-invoice payment`);
              }
            }
          }
        }
      } catch (pmErr) {
        console.warn('[webhook] Failed to auto-save payment method from hosted-invoice payment:', pmErr);
      }
    }

    // 1-step completion for the RWO flow: when an auto-charged invoice
    // tied to a work order is paid, mark that workOrder completed too.
    // This is the "cron fires → invoice generated → client charged →
    // work order closed" loop the recurring billing spec asks for.
    // Limited to auto-charge so manual customer payments don't silently
    // close out a work order admin still wanted to mark complete by hand.
    if (wasAutoCharge && invData?.workOrderId) {
      try {
        const woRef = doc(db, 'workOrders', invData.workOrderId);
        const woSnap = await getDoc(woRef);
        if (woSnap.exists()) {
          const wo = woSnap.data();
          const status = String(wo.status || '').toLowerCase();
          if (status !== 'completed' && status !== 'cancelled' && status !== 'archived') {
            await updateDoc(woRef, {
              status: 'completed',
              completedAt: serverTimestamp(),
              autoCompletedFromInvoicePayment: true,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (woErr) {
        console.warn('[webhook] Failed to mark WO completed after auto-charge paid:', woErr);
      }
    }

    console.log(`Hosted invoice ${invoiceId} marked as paid (Stripe invoice: ${stripeInvoice.id})`);
  } catch (error) {
    console.error('Error handling hosted invoice paid:', error);
  }
}

/** Hosted Stripe Invoice payment failed — note it on the Firestore invoice. */
async function handleHostedInvoicePaymentFailed(stripeInvoice: Stripe.Invoice) {
  try {
    const db = await getServerDb();
    const invoiceId = stripeInvoice.metadata?.invoiceId;
    if (!invoiceId) return;

    const invSnap = await getDoc(doc(db, 'invoices', invoiceId));
    if (!invSnap.exists()) return;
    const invData = invSnap.data();
    if (invData?.status === 'paid') return;

    await updateDoc(doc(db, 'invoices', invoiceId), {
      autoChargeStatus: 'failed',
      autoChargeFailedAt: serverTimestamp(),
      autoChargeFailureReason: 'Stripe hosted invoice payment failed',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error handling hosted invoice payment failure:', error);
  }
}

/** Subscription (fixed recurring) invoice paid — create invoice record + send receipt email */
async function handleSubscriptionInvoicePaid(stripeInvoice: Stripe.Invoice) {
  try {
    const db = await getServerDb();
    // Skip $0 invoices (e.g. trial or setup invoice)
    if (!stripeInvoice.amount_paid || stripeInvoice.amount_paid === 0) return;

    // Idempotency — Stripe webhook delivery is at-least-once. A re-delivery
    // of the same `invoice.paid` event would otherwise call addDoc again
    // and create a duplicate Firestore invoice + send a duplicate receipt
    // email. Look up by stripeInvoiceId before writing.
    if (stripeInvoice.id) {
      const dupSnap = await getDocs(
        query(
          collection(db, 'invoices'),
          where('stripeInvoiceId', '==', stripeInvoice.id),
          fsLimit(1),
        ),
      );
      if (!dupSnap.empty) {
        console.log(
          `Subscription invoice ${stripeInvoice.id} already recorded as Firestore invoice ${dupSnap.docs[0].id} — skipping duplicate`,
        );
        return;
      }
    }

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
    const invoiceNumber = generateInvoiceNumber();

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
      stripeInvoiceId: stripeInvoice.id,
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

/**
 * Subscription invoice payment failed. Stripe will retry per its dunning
 * settings, but the admin needs to know NOW that the recurring charge
 * failed. Flip the client's subscription status to past_due (the matching
 * `customer.subscription.updated` event fires too — both paths land on
 * the same field) and capture the failure reason.
 */
async function handleSubscriptionInvoiceFailed(stripeInvoice: Stripe.Invoice) {
  try {
    const db = await getServerDb();

    // Resolve clientId from invoice metadata, falling back to the
    // subscription's own metadata (old subs may not have it duplicated
    // onto the invoice).
    let clientId = stripeInvoice.metadata?.clientId;
    let subscriptionId: string | undefined;
    if (!clientId && stripeInvoice.subscription) {
      subscriptionId = typeof stripeInvoice.subscription === 'string'
        ? stripeInvoice.subscription
        : stripeInvoice.subscription.id;
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        clientId = sub.metadata?.clientId;
      } catch (subErr) {
        console.warn('[Webhook] could not retrieve subscription for failed invoice:', subErr);
      }
    }

    if (!clientId) {
      console.log(`Subscription invoice payment failed but no clientId resolvable: ${stripeInvoice.id}`);
      return;
    }

    // Pull the PI to get the actual decline reason / code.
    let failureMessage: string | undefined;
    let failureCode: string | undefined;
    let declineCode: string | undefined;
    const piId = typeof stripeInvoice.payment_intent === 'string'
      ? stripeInvoice.payment_intent
      : stripeInvoice.payment_intent?.id;
    if (piId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        failureMessage = pi.last_payment_error?.message;
        failureCode = pi.last_payment_error?.code as string | undefined;
        declineCode = (pi.last_payment_error as any)?.decline_code;
      } catch (piErr) {
        console.warn('[Webhook] could not retrieve PI for failed sub invoice:', piErr);
      }
    }

    await updateDoc(doc(db, 'clients', clientId), {
      subscriptionStatus: 'past_due',
      subscriptionPastDueAt: serverTimestamp(),
      subscriptionLastFailureReason: failureMessage || 'Subscription invoice payment failed',
      ...(failureCode ? { subscriptionLastFailureCode: failureCode } : {}),
      ...(declineCode ? { subscriptionLastDeclineCode: declineCode } : {}),
      updatedAt: serverTimestamp(),
    });

    console.log(
      `Subscription invoice payment failed for client ${clientId}: ${stripeInvoice.id}${failureCode ? ` [${failureCode}]` : ''}`,
    );
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

    // Keep stripeSubscriptionId on the doc — it remains the canonical
    // pointer for any late events (final invoice, refunds, disputes
    // related to the cancelled period) and for audit trail. Only flip
    // status. If you ever need to start a new sub for this client, the
    // /api/stripe/update-subscription route will overwrite the field
    // with the new id.
    await updateDoc(doc(db, 'clients', clientId), {
      subscriptionStatus: 'cancelled',
      subscriptionCancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log(`Subscription cancelled for client ${clientId} (id retained: ${sub.id})`);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

/**
 * Subscription updated — covers Stripe-side state transitions:
 *   • Stripe's dunning flips status to `past_due` when a renewal invoice
 *     fails. Without surfacing this, recurring billing failures are
 *     completely silent in the admin UI.
 *   • `cancel_at_period_end: true` echoes back so we can confirm the
 *     pending cancellation landed on Stripe's side.
 *   • `unpaid` / `incomplete_expired` are terminal failure states.
 */
async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  try {
    const db = await getServerDb();
    const clientId = sub.metadata?.clientId;
    if (!clientId) return;

    const fields: Record<string, any> = { updatedAt: serverTimestamp() };

    // Map Stripe's subscription.status → our denormalised field.
    // 'active' | 'past_due' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'canceled' | 'paused'
    if (sub.status === 'past_due') {
      fields.subscriptionStatus = 'past_due';
      fields.subscriptionPastDueAt = serverTimestamp();
    } else if (sub.status === 'unpaid' || sub.status === 'incomplete_expired') {
      fields.subscriptionStatus = 'unpaid';
    } else if (sub.status === 'active' && !sub.cancel_at_period_end) {
      fields.subscriptionStatus = 'active';
      fields.subscriptionPastDueAt = null;
    }

    if (sub.cancel_at_period_end) {
      fields.subscriptionStatus = 'pending_cancellation';
      fields.subscriptionCancelAtPeriodEnd = true;
      if (sub.current_period_end) {
        fields.subscriptionEndsAt = Timestamp.fromMillis(sub.current_period_end * 1000);
      }
    } else if (sub.status === 'active') {
      // The admin un-cancelled (re-activated). Clear the pending flag.
      fields.subscriptionCancelAtPeriodEnd = false;
      fields.subscriptionEndsAt = null;
    }

    await updateDoc(doc(db, 'clients', clientId), fields);
    console.log(
      `[Webhook] subscription.updated client=${clientId} status=${sub.status} cancel_at_period_end=${sub.cancel_at_period_end}`,
    );
  } catch (error) {
    console.error('Error handling subscription.updated:', error);
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

/**
 * ACH / delayed-payment-method failure. The customer authorized the
 * checkout, the bank later rejected (insufficient funds, closed
 * account, etc.). Roll the Firestore invoice back from any optimistic
 * paid state and surface a failure timeline event so the admin can
 * follow up.
 */
async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  try {
    const db = await getServerDb();
    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId) {
      console.log(`async_payment_failed with no invoiceId: ${session.id}`);
      return;
    }

    const invSnap = await getDoc(doc(db, 'invoices', invoiceId));
    if (!invSnap.exists()) return;
    const invData = invSnap.data();

    const failedEvent = createInvoiceTimelineEvent({
      type: 'paid', // closest type — timeline schema doesn't have 'failed_async'
      userId: 'system',
      userName: 'Payment System',
      userRole: 'system',
      details: 'ACH payment failed at the bank — invoice reverted to unpaid',
      metadata: { stripeSessionId: session.id, paymentStatus: session.payment_status || 'unpaid' },
    });

    await updateDoc(doc(db, 'invoices', invoiceId), {
      // Don't blindly overwrite — only revert if we had optimistically
      // marked paid. A fresh failure on an already-unpaid invoice just
      // appends a timeline note.
      ...(invData.status === 'paid' ? { status: 'sent', paidAt: null } : {}),
      autoChargeAttempted: true,
      autoChargeStatus: 'failed',
      autoChargeError: 'ACH payment failed at the customer\'s bank',
      timeline: [...(invData.timeline || []), failedEvent],
      updatedAt: serverTimestamp(),
    });

    console.log(`Invoice ${invoiceId} reverted — async ACH payment failed`);
  } catch (error) {
    console.error('Error handling async_payment_failed:', error);
  }
}

/**
 * Capture a Stripe webhook event into the paymentLogs collection.
 *
 * Centralised dispatch — one switch on event.type that picks the right
 * Stripe-object → PaymentLog mapper from lib/payment-logs and writes
 * the row keyed on event.id (so Stripe's at-least-once retries dedupe
 * for free).
 *
 * Linkage best-effort — when metadata.invoiceId is missing we fall
 * back to a stripeInvoiceId / stripePaymentIntentId scan so older
 * objects still join up with the right Firestore invoice on the
 * Payment Logs admin page.
 *
 * Non-fatal — any error here is logged and swallowed by the caller so
 * a logging hiccup never causes us to 500 the webhook (Stripe would
 * retry the event, potentially re-running the side-effecting handlers).
 */
async function logWebhookEvent(event: Stripe.Event): Promise<string | undefined> {
  // Pre-flight: only log payment-relevant events. Anything else
  // (tax-rate updates, dispute hooks we don't care about, etc.) is
  // skipped to keep the collection focused.
  const RELEVANT_PREFIXES = [
    'charge.',
    'payment_intent.',
    'invoice.',
    'setup_intent.',
    'checkout.session.',
  ];
  const isRelevant = RELEVANT_PREFIXES.some((p) => event.type.startsWith(p));
  if (!isRelevant) return undefined;

  let db: any;
  try {
    db = await getServerDb();
  } catch (e) {
    console.error('[logWebhookEvent] DB connect failed:', e);
    return undefined;
  }

  let partial: Partial<PaymentLog> | null = null;
  const obj: any = event.data?.object;

  // Map (event.type, event.data.object.status) → PaymentLog status.
  const stripeStatusToLogStatus = (raw: string | null | undefined): PaymentLog['status'] => {
    switch (raw) {
      case 'succeeded':
      case 'paid':
      case 'complete':
        return 'succeeded';
      case 'requires_action':
      case 'requires_confirmation':
      case 'requires_payment_method':
        return 'requires_action';
      case 'processing':
        return 'processing';
      case 'canceled':
      case 'cancelled':
      case 'voided':
        return 'canceled';
      case 'refunded':
        return 'refunded';
      case 'open':
        return 'pending';
      default:
        return 'pending';
    }
  };

  try {
    if (event.type.startsWith('payment_intent.')) {
      const pi = obj as Stripe.PaymentIntent;
      const status: PaymentLog['status'] =
        event.type === 'payment_intent.succeeded' ? 'succeeded'
        : event.type === 'payment_intent.payment_failed' ? 'failed'
        : event.type === 'payment_intent.requires_action' ? 'requires_action'
        : event.type === 'payment_intent.processing' ? 'processing'
        : event.type === 'payment_intent.canceled' ? 'canceled'
        : stripeStatusToLogStatus(pi.status);
      partial = fromPaymentIntent(pi, status);
      // Fill linkage from invoices collection if metadata didn't carry it.
      if (!partial.linkedInvoiceId) {
        const linkage = await resolveInvoiceLinkage(db, {
          stripePaymentIntentId: pi.id,
          metadata: pi.metadata as any,
        });
        partial = { ...partial, ...linkage };
      }
    } else if (event.type.startsWith('charge.')) {
      const ch = obj as Stripe.Charge;
      const status: PaymentLog['status'] =
        event.type === 'charge.succeeded' ? 'succeeded'
        : event.type === 'charge.failed' ? 'failed'
        : event.type === 'charge.refunded' ? 'refunded'
        : event.type.startsWith('charge.dispute.') ? 'disputed'
        : stripeStatusToLogStatus(ch.status);
      partial = fromCharge(ch, status);
      if (!partial.linkedInvoiceId) {
        const linkage = await resolveInvoiceLinkage(db, {
          stripeChargeId: ch.id,
          stripePaymentIntentId: typeof ch.payment_intent === 'string' ? ch.payment_intent : undefined,
          metadata: ch.metadata as any,
        });
        partial = { ...partial, ...linkage };
      }
    } else if (event.type.startsWith('invoice.')) {
      const inv = obj as Stripe.Invoice;
      const status: PaymentLog['status'] =
        event.type === 'invoice.paid' ? 'succeeded'
        : event.type === 'invoice.payment_failed' ? 'failed'
        : event.type === 'invoice.payment_action_required' ? 'requires_action'
        : event.type === 'invoice.voided' ? 'canceled'
        : stripeStatusToLogStatus(inv.status);
      partial = fromInvoice(inv, status);
      if (!partial.linkedInvoiceId) {
        const linkage = await resolveInvoiceLinkage(db, {
          stripeInvoiceId: inv.id,
          metadata: inv.metadata as any,
        });
        partial = { ...partial, ...linkage };
      }
    } else if (event.type.startsWith('setup_intent.')) {
      const si = obj as Stripe.SetupIntent;
      const status: PaymentLog['status'] =
        event.type === 'setup_intent.succeeded' ? 'succeeded'
        : event.type === 'setup_intent.setup_failed' ? 'failed'
        : event.type === 'setup_intent.requires_action' ? 'requires_action'
        : stripeStatusToLogStatus(si.status);
      partial = fromSetupIntent(si, status);
    } else if (event.type.startsWith('checkout.session.')) {
      const cs = obj as Stripe.Checkout.Session;
      const status: PaymentLog['status'] =
        cs.payment_status === 'paid' ? 'succeeded'
        : event.type === 'checkout.session.expired' ? 'canceled'
        : stripeStatusToLogStatus(cs.payment_status as any);
      partial = fromCheckoutSession(cs, status);
      if (!partial.linkedInvoiceId) {
        const linkage = await resolveInvoiceLinkage(db, {
          metadata: cs.metadata as any,
        });
        partial = { ...partial, ...linkage };
      }
    }
  } catch (e) {
    console.error('[logWebhookEvent] mapper threw:', e, 'for event', event.type);
    return undefined;
  }

  if (!partial) return undefined;

  return await recordPaymentEvent({
    db,
    partial,
    source: 'webhook',
    rawEventType: event.type,
    stripeEventId: event.id,
    rawPayload: obj,
  }).catch((e) => {
    console.error('[logWebhookEvent] recordPaymentEvent threw:', e);
    return undefined;
  });
}

/**
 * Append a record-mutation entry to an existing payment log row.
 * Used by the existing handlers below to record what they updated as
 * a result of the event — so the admin can trace the cascade. Wrapped
 * in catch so a logging slip never crashes the handler.
 */
async function appendLogMutation(
  stripeEventId: string | undefined,
  mutation: PaymentLogMutation,
): Promise<void> {
  if (!stripeEventId) return;
  try {
    const db = await getServerDb();
    await recordPaymentEvent({
      db,
      partial: { stripeObjectId: 'unused' } as any, // ignored on merge — id keys off stripeEventId
      source: 'webhook',
      stripeEventId,
      recordMutations: [mutation],
    });
  } catch (e) {
    console.error('[appendLogMutation] failed:', e);
  }
}
// Reference the helpers in the module so unused-import linting never
// trips when they're only used by the dispatcher above. Not exported
// — Next.js route files only allow specific top-level exports.
void appendLogMutation;
void buildMutation;
