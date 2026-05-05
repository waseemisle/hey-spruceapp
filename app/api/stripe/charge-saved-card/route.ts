import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import { enrichFromPaymentIntent } from '@/lib/stripe-invoice-enrichment';
import {
  recordPaymentEvent,
  fromPaymentIntent,
  fromInvoice,
  buildMutation,
  classifyDecline,
} from '@/lib/payment-logs';
import type { PaymentLogMutation } from '@/types';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Off-session charge of a client's saved payment method for an invoice.
 *
 * IMPORTANT — uses two distinct flows depending on whether the Firestore
 * invoice already has a Stripe Invoice attached (`stripeInvoiceId`):
 *
 *  1. EXISTING-INVOICE PATH (preferred). When stripeInvoiceId is set we
 *     use stripe.invoices.pay(invoiceId, { off_session: true }) instead
 *     of creating a fresh PaymentIntent. This is critical: without it,
 *     a fresh PI charges the saved card AND the original Stripe Invoice
 *     stays in 'open' state with its own incomplete PI sitting next to
 *     ours. Result: customer is charged once (correct) but the Stripe
 *     Dashboard shows two payments and an open invoice the admin can't
 *     close. We had this bug in production. Now stripe.invoices.pay()
 *     uses the invoice's own PaymentIntent and flips the invoice to
 *     'paid' atomically.
 *
 *  2. NO-INVOICE PATH (legacy). When stripeInvoiceId isn't set we fall
 *     back to creating a stand-alone PaymentIntent linked to the
 *     Firestore invoice via metadata. Still works for older invoices
 *     that were created before we introduced the hosted invoice flow.
 *
 * In both paths we synchronously enrich the Firestore doc with the
 * resulting charge ID, receipt URL, card brand/last4, balance txn, and
 * amount received so the admin sees a complete record the moment the
 * request returns — no webhook lag.
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
  let invoiceId: string | undefined;
  let clientId: string | undefined;
  try {
    const body = await request.json();
    invoiceId = body.invoiceId;
    clientId = body.clientId;
    // Optional per-invoice override — admin picked a specific saved PM
    // (e.g. ACH bank instead of the default Mastercard) from the picker on
    // the invoice detail page. We validate it against the client's saved
    // methods below; an unknown PM id is rejected so we never charge a
    // stranger's card via a forged request.
    const requestedPaymentMethodId: string | undefined =
      typeof body.paymentMethodId === 'string' && body.paymentMethodId.trim().length > 0
        ? body.paymentMethodId.trim()
        : undefined;

    if (!invoiceId || !clientId) {
      return NextResponse.json(
        { error: 'Missing required fields: invoiceId, clientId' },
        { status: 400 }
      );
    }

    const invoiceDoc = await getDoc(doc(db, 'invoices', invoiceId));
    if (!invoiceDoc.exists()) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    const invoiceData = invoiceDoc.data();

    if (invoiceData.status === 'paid') {
      return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 });
    }

    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data();

    // Resolve which PM to charge. Order of preference:
    //   1. Explicit override from request body — must match an entry in the
    //      client's saved paymentMethods array (verified, not pending).
    //   2. Client's defaultPaymentMethodId.
    //   3. First chargeable PM in the array (handles clients whose default
    //      pointer somehow got cleared while methods are still on file).
    // We hard-fail with a 400 only when none of the above resolve, instead
    // of the old "no defaultPaymentMethodId" gate which falsely blocked
    // clients that had PMs but no default flag.
    const savedMethods: any[] = Array.isArray(clientData.paymentMethods) ? clientData.paymentMethods : [];
    const chargeableMethods = savedMethods.filter(
      (m: any) => m && m.id && m.verificationStatus !== 'pending'
    );

    let pmId: string | undefined;
    if (requestedPaymentMethodId) {
      const match = chargeableMethods.find((m: any) => m.id === requestedPaymentMethodId);
      if (!match) {
        return NextResponse.json(
          { error: 'Selected payment method is not on file for this client (or is pending verification).' },
          { status: 400 }
        );
      }
      pmId = match.id;
    } else if (clientData.defaultPaymentMethodId
        && chargeableMethods.some((m: any) => m.id === clientData.defaultPaymentMethodId)) {
      pmId = clientData.defaultPaymentMethodId;
    } else if (clientData.defaultPaymentMethodId && chargeableMethods.length === 0) {
      // Legacy clients with no paymentMethods array but a savedCard*. Trust
      // the default pointer in that case.
      pmId = clientData.defaultPaymentMethodId;
    } else if (chargeableMethods.length > 0) {
      pmId = chargeableMethods[0].id;
    }

    if (!clientData.stripeCustomerId || !pmId) {
      return NextResponse.json(
        { error: 'Client has no saved payment method. Add a card or bank from the client detail page first.' },
        { status: 400 }
      );
    }

    const totalNum = Number(invoiceData.totalAmount);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      return NextResponse.json(
        { error: 'Invalid invoice total amount' },
        { status: 400 }
      );
    }

    const linkedStripeInvoiceId = (invoiceData.stripeInvoiceId as string | undefined) || undefined;

    const existingTimeline = invoiceData.timeline || [];
    const existingSysInfo = invoiceData.systemInformation || {};

    /* ─────────────────────────────────────────────────────────────────
       PATH 1 — EXISTING STRIPE INVOICE
       Pay the invoice itself with the saved PM. Stripe charges the
       customer using the invoice's own PI and flips it to 'paid'.
    ───────────────────────────────────────────────────────────────── */
    /**
     * Helper — write a paymentLogs row for whatever outcome this route
     * just produced. Centralised so each branch can log in one line
     * without repeating the source / mutation-array boilerplate.
     */
    const logOutcome = async (args: {
      stripeObject: Stripe.PaymentIntent | Stripe.Invoice;
      objectKind: 'payment_intent' | 'invoice';
      status: 'succeeded' | 'failed' | 'requires_action' | 'processing';
      mutations?: PaymentLogMutation[];
      failureMessage?: string;
      failureCode?: string;
      declineCode?: string;
    }) => {
      try {
        const partial = args.objectKind === 'payment_intent'
          ? fromPaymentIntent(args.stripeObject as Stripe.PaymentIntent, args.status)
          : fromInvoice(args.stripeObject as Stripe.Invoice, args.status);
        // Hand-craft failure metadata if the helper didn't pick it up
        // (e.g. the route caught an exception before Stripe attached
        // last_payment_error).
        if (args.status === 'failed' && (args.failureMessage || args.failureCode || args.declineCode)) {
          partial.failureMessage = args.failureMessage || partial.failureMessage;
          if (args.failureCode) partial.failureCode = args.failureCode;
          if (args.declineCode) partial.declineCode = args.declineCode;
          const cls = classifyDecline(args.declineCode || partial.declineCode, args.failureCode || partial.failureCode);
          partial.declineCategory = cls.declineCategory;
          partial.possibleCauses = cls.possibleCauses;
          partial.nextSteps = cls.nextSteps;
        }
        // Always pin the linked invoice — caller has it in scope, much
        // cheaper than the resolveInvoiceLinkage scan the webhook does.
        partial.linkedInvoiceId = invoiceId;
        partial.linkedInvoiceNumber = invoiceData.invoiceNumber;
        partial.linkedClientId = clientId;
        partial.linkedClientName = invoiceData.clientName;
        await recordPaymentEvent({
          db,
          partial,
          source: 'auto_charge_route',
          rawPayload: args.stripeObject,
          recordMutations: args.mutations,
        });
      } catch (e) {
        console.error('[charge-saved-card] logOutcome failed (non-fatal):', e);
      }
    };

    if (linkedStripeInvoiceId) {
      let paidStripeInvoice: Stripe.Invoice;

      // If the admin selected an ACH PM, ensure the Stripe Invoice allows
      // 'us_bank_account' as a payment method type. Invoices created via
      // the standard send_invoice flow only have card enabled, so calling
      // invoices.pay({payment_method: bank_pm}) would otherwise fail with
      // "this payment method is not allowed for this invoice".
      let pmType: 'card' | 'us_bank_account' = 'card';
      try {
        const pmObj = await stripe.paymentMethods.retrieve(pmId);
        if (pmObj.type === 'us_bank_account') pmType = 'us_bank_account';
      } catch {
        /* fall through — assume card */
      }
      if (pmType === 'us_bank_account') {
        try {
          await stripe.invoices.update(linkedStripeInvoiceId, {
            payment_settings: { payment_method_types: ['us_bank_account', 'card'] },
            default_payment_method: pmId,
          });
        } catch (e) {
          console.warn('[charge-saved-card] Could not widen invoice PM types for ACH:', e);
        }
      }

      try {
        // Idempotency key MUST change between admin-initiated retries.
        // Stripe caches every response under an idempotency key for 24h
        // — including 402 card_declined. With a stable invoice+pm key,
        // a single real decline (fraud hold, insufficient funds at the
        // moment, etc.) gets pinned in Stripe's cache and every retry
        // replays the same "card_declined" even after the underlying
        // issue is resolved. The UI lock (`setCharging`) and the route
        // having no auto-retry mean concurrent requests for the same
        // logical attempt aren't a real risk; the per-call timestamp
        // suffix forces Stripe to make a fresh charge attempt each time
        // the admin clicks Auto Charge.
        paidStripeInvoice = await stripe.invoices.pay(
          linkedStripeInvoiceId,
          {
            off_session: true,
            payment_method: pmId,
          },
          { idempotencyKey: `pay-invoice-${linkedStripeInvoiceId}-${pmId}-${Date.now()}` },
        );
      } catch (err: any) {
        // .pay() throws on already-paid / void / uncollectible. Fetch
        // the current state and reconcile cleanly.
        const fetched = await stripe.invoices.retrieve(linkedStripeInvoiceId).catch(() => null);
        const status = fetched?.status;
        if (fetched && (status === 'paid' || status === 'uncollectible')) {
          paidStripeInvoice = fetched;
        } else {
          // Real failure — surface to admin and mark the Firestore
          // invoice as failed-attempt so the Auto Charge button doesn't
          // re-render an "available" state.
          await updateDoc(doc(db, 'invoices', invoiceId), {
            autoChargeAttempted: true,
            autoChargeStatus: 'failed',
            autoChargeError: err?.message || 'Stripe invoice.pay failed',
            updatedAt: serverTimestamp(),
          });
          // Log the failure with whatever Stripe context we have. Best
          // effort to retrieve the PI for richer payload before the
          // throw — admin Payment Logs page wants the decline code.
          let failingPi: Stripe.PaymentIntent | null = null;
          try {
            const fetchedInv = await stripe.invoices.retrieve(linkedStripeInvoiceId, { expand: ['payment_intent'] });
            failingPi = (fetchedInv?.payment_intent as Stripe.PaymentIntent) || null;
          } catch { /* fall back to invoice payload */ }
          await logOutcome(failingPi
            ? {
                stripeObject: failingPi,
                objectKind: 'payment_intent',
                status: 'failed',
                failureMessage: err?.message,
                failureCode: err?.code,
                declineCode: err?.decline_code || err?.raw?.decline_code,
                mutations: [
                  buildMutation({
                    collection: 'invoices',
                    docId: invoiceId,
                    field: 'autoChargeStatus',
                    to: 'failed',
                    summary: `Auto-charge failed for invoice ${invoiceData.invoiceNumber}`,
                  }),
                ],
              }
            : {
                stripeObject: { id: linkedStripeInvoiceId } as Stripe.Invoice,
                objectKind: 'invoice',
                status: 'failed',
                failureMessage: err?.message,
                failureCode: err?.code,
                mutations: [
                  buildMutation({
                    collection: 'invoices',
                    docId: invoiceId,
                    field: 'autoChargeStatus',
                    to: 'failed',
                    summary: `Auto-charge failed for invoice ${invoiceData.invoiceNumber}`,
                  }),
                ],
              });
          throw err;
        }
      }

      const piId =
        typeof paidStripeInvoice.payment_intent === 'string'
          ? paidStripeInvoice.payment_intent
          : paidStripeInvoice.payment_intent?.id || null;

      // For ACH, the invoice may end up in 'open' with a processing PI.
      // Surface that to the admin instead of marking paid prematurely.
      if (paidStripeInvoice.status !== 'paid' && paidStripeInvoice.status !== 'uncollectible') {
        await updateDoc(doc(db, 'invoices', invoiceId), {
          autoChargeAttempted: true,
          autoChargeStatus: 'requires_action',
          stripePaymentIntentId: piId || null,
          updatedAt: serverTimestamp(),
        });
        await logOutcome({
          stripeObject: paidStripeInvoice,
          objectKind: 'invoice',
          status: 'requires_action',
          mutations: [
            buildMutation({
              collection: 'invoices',
              docId: invoiceId,
              field: 'autoChargeStatus',
              to: 'requires_action',
              summary: `Auto-charge ${invoiceData.invoiceNumber} processing — awaiting bank/card confirmation`,
            }),
          ],
        });
        return NextResponse.json({
          success: false,
          status: paidStripeInvoice.status,
          paymentIntentId: piId,
          message: 'Payment is processing. The invoice will flip to paid once the bank/card confirms.',
        });
      }

      const enrichment = piId
        ? await enrichFromPaymentIntent(stripe, piId)
        : { fields: {}, error: null };

      const cardLabel =
        enrichment.fields.stripeCardBrand && enrichment.fields.stripeCardLast4
          ? `${enrichment.fields.stripeCardBrand} ···${enrichment.fields.stripeCardLast4}`
          : 'saved payment method';

      const paidEvent = createInvoiceTimelineEvent({
        type: 'paid',
        userId: 'system',
        userName: 'Auto-Pay System',
        userRole: 'system',
        details: `Auto-charged ${cardLabel} via Stripe Invoice ${paidStripeInvoice.id}`,
        metadata: {
          stripeInvoiceId: paidStripeInvoice.id,
          ...(piId ? { stripePaymentIntentId: piId } : {}),
          ...(enrichment.fields.stripeChargeId ? { stripeChargeId: enrichment.fields.stripeChargeId } : {}),
          ...(enrichment.fields.stripeReceiptUrl ? { stripeReceiptUrl: enrichment.fields.stripeReceiptUrl } : {}),
        },
      });

      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'paid',
        paidAt: serverTimestamp(),
        stripeInvoiceId: paidStripeInvoice.id,
        stripePaymentIntentId: piId,
        stripeInvoicePdf: paidStripeInvoice.invoice_pdf || null,
        stripeHostedInvoiceUrl: paidStripeInvoice.hosted_invoice_url || null,
        autoChargeAttempted: true,
        autoChargeStatus: 'succeeded',
        autoChargeAt: serverTimestamp(),
        autoChargeMethodLabel: cardLabel,
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

      // Close the linked WO if any.
      if (invoiceData.workOrderId) {
        try {
          await updateDoc(doc(db, 'workOrders', invoiceData.workOrderId), {
            status: 'completed',
            completedAt: serverTimestamp(),
            autoCompletedFromInvoicePayment: true,
            updatedAt: serverTimestamp(),
          });
        } catch (woErr) {
          console.warn('[charge-saved-card] WO close failed:', woErr);
        }
      }

      await logOutcome({
        stripeObject: paidStripeInvoice,
        objectKind: 'invoice',
        status: 'succeeded',
        mutations: [
          buildMutation({
            collection: 'invoices',
            docId: invoiceId,
            field: 'status',
            from: invoiceData.status as string,
            to: 'paid',
            summary: `Invoice ${invoiceData.invoiceNumber} marked paid via auto-charge (${cardLabel})`,
          }),
          ...(invoiceData.workOrderId ? [buildMutation({
            collection: 'workOrders',
            docId: invoiceData.workOrderId,
            field: 'status',
            to: 'completed',
            summary: 'Linked work order auto-completed on invoice payment',
          })] : []),
        ],
      });

      return NextResponse.json({
        success: true,
        status: 'succeeded',
        paymentIntentId: piId,
        chargeId: enrichment.fields.stripeChargeId,
        receiptUrl: enrichment.fields.stripeReceiptUrl,
        cardLabel,
        path: 'invoice_pay',
        stripeInvoiceId: paidStripeInvoice.id,
      });
    }

    /* ─────────────────────────────────────────────────────────────────
       PATH 2 — NO STRIPE INVOICE (legacy fallback)
       Stand-alone PaymentIntent. Used only for older invoices that
       were never wired up to the hosted-invoice flow.
    ───────────────────────────────────────────────────────────────── */
    const amountCents = Math.round(totalNum * 100);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://groundopscos.vercel.app';

    let isBankAccount = false;
    try {
      const pm = await stripe.paymentMethods.retrieve(pmId);
      isBankAccount = pm.type === 'us_bank_account';
    } catch {
      /* treat as card if lookup fails */
    }

    const piParams: any = {
      amount: amountCents,
      currency: 'usd',
      customer: clientData.stripeCustomerId,
      payment_method: pmId,
      confirm: true,
      return_url: `${baseUrl}/payment-success?invoice_id=${invoiceId}`,
      description: `Invoice ${invoiceData.invoiceNumber} — ${invoiceData.clientName}`,
      metadata: {
        invoiceId,
        invoiceNumber: invoiceData.invoiceNumber,
        clientId,
      },
    };

    if (isBankAccount) {
      piParams.payment_method_types = ['us_bank_account'];
      piParams.mandate_data = { customer_acceptance: { type: 'offline' } };
    } else {
      piParams.off_session = true;
    }

    // Per-call idempotency key (timestamp suffix) — see the matching
    // comment in the invoice.pay() path above. Stripe caches every
    // response (including card_declined) for 24h per key, so a stable
    // key would pin a transient decline as a permanent failure.
    const paymentIntent = await stripe.paymentIntents.create(piParams, {
      idempotencyKey: `charge-invoice-legacy-${invoiceId}-${pmId}-${Date.now()}`,
    });

    if (paymentIntent.status === 'succeeded') {
      const enrichment = await enrichFromPaymentIntent(stripe, paymentIntent.id);

      const cardLabel =
        enrichment.fields.stripeCardBrand && enrichment.fields.stripeCardLast4
          ? `${enrichment.fields.stripeCardBrand} ···${enrichment.fields.stripeCardLast4}`
          : 'saved payment method';

      const paidEvent = createInvoiceTimelineEvent({
        type: 'paid',
        userId: 'system',
        userName: 'Auto-Pay System',
        userRole: 'system',
        details: `Auto-charged ${cardLabel} (legacy PI flow)`,
        metadata: {
          stripePaymentIntentId: paymentIntent.id,
          ...(enrichment.fields.stripeChargeId ? { stripeChargeId: enrichment.fields.stripeChargeId } : {}),
          ...(enrichment.fields.stripeReceiptUrl ? { stripeReceiptUrl: enrichment.fields.stripeReceiptUrl } : {}),
        },
      });

      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'paid',
        paidAt: serverTimestamp(),
        stripePaymentIntentId: paymentIntent.id,
        autoChargeAttempted: true,
        autoChargeStatus: 'succeeded',
        autoChargeAt: serverTimestamp(),
        autoChargeMethodLabel: cardLabel,
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

      if (invoiceData.workOrderId) {
        try {
          await updateDoc(doc(db, 'workOrders', invoiceData.workOrderId), {
            status: 'completed',
            completedAt: serverTimestamp(),
            autoCompletedFromInvoicePayment: true,
            updatedAt: serverTimestamp(),
          });
        } catch (woErr) {
          console.warn('[charge-saved-card] WO close failed:', woErr);
        }
      }

      await logOutcome({
        stripeObject: paymentIntent,
        objectKind: 'payment_intent',
        status: 'succeeded',
        mutations: [
          buildMutation({
            collection: 'invoices',
            docId: invoiceId,
            field: 'status',
            from: invoiceData.status as string,
            to: 'paid',
            summary: `Invoice ${invoiceData.invoiceNumber} marked paid via legacy PI auto-charge (${cardLabel})`,
          }),
          ...(invoiceData.workOrderId ? [buildMutation({
            collection: 'workOrders',
            docId: invoiceData.workOrderId,
            field: 'status',
            to: 'completed',
            summary: 'Linked work order auto-completed on invoice payment',
          })] : []),
        ],
      });

      return NextResponse.json({
        success: true,
        status: 'succeeded',
        paymentIntentId: paymentIntent.id,
        chargeId: enrichment.fields.stripeChargeId,
        receiptUrl: enrichment.fields.stripeReceiptUrl,
        cardLabel,
        path: 'standalone_pi',
      });
    } else {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        autoChargeAttempted: true,
        autoChargeStatus: 'requires_action',
        stripePaymentIntentId: paymentIntent.id,
        updatedAt: serverTimestamp(),
      });

      await logOutcome({
        stripeObject: paymentIntent,
        objectKind: 'payment_intent',
        status: 'requires_action',
        mutations: [
          buildMutation({
            collection: 'invoices',
            docId: invoiceId,
            field: 'autoChargeStatus',
            to: 'requires_action',
            summary: `Invoice ${invoiceData.invoiceNumber} requires customer authentication (3DS)`,
          }),
        ],
      });

      return NextResponse.json({
        success: false,
        status: paymentIntent.status,
        paymentIntentId: paymentIntent.id,
        message: 'Payment requires additional authentication from the customer.',
      });
    }
  } catch (error: any) {
    console.error('[charge-saved-card] Error:', error);

    if (invoiceId) {
      try {
        await updateDoc(doc(db, 'invoices', invoiceId), {
          autoChargeAttempted: true,
          autoChargeStatus: 'failed',
          autoChargeError: error?.message || 'Charge failed',
          updatedAt: serverTimestamp(),
        });
        // Best-effort log of the failure even though we don't have a
        // Stripe object in scope. Synthesises a minimal partial so the
        // admin still sees an entry on the Payment Logs page.
        try {
          const db2 = await getServerDb();
          const cls = classifyDecline(error?.decline_code, error?.code);
          await recordPaymentEvent({
            db: db2,
            partial: {
              stripeObjectId: error?.payment_intent?.id || `auto-charge-${invoiceId}-${Date.now()}`,
              stripeObjectType: 'payment_intent',
              status: 'failed',
              failureMessage: error?.message,
              failureCode: error?.code,
              declineCode: error?.decline_code,
              ...cls,
              linkedInvoiceId: invoiceId,
              linkedClientId: clientId,
            },
            source: 'auto_charge_route',
            recordMutations: [
              buildMutation({
                collection: 'invoices',
                docId: invoiceId,
                field: 'autoChargeStatus',
                to: 'failed',
                summary: `Auto-charge failed (route catch): ${error?.message || 'unknown error'}`,
              }),
            ],
          });
        } catch (logErr) {
          console.error('[charge-saved-card] catch-block log failed:', logErr);
        }
      } catch {}
    }

    const message = error?.message || 'Failed to charge saved card';
    const code = error?.code ? ` [${error.code}]` : '';
    return NextResponse.json({ error: `${message}${code}` }, { status: 500 });
  }
}
