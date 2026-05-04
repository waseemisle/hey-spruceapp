import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import { enrichFromPaymentIntent } from '@/lib/stripe-invoice-enrichment';

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

    if (!clientData.stripeCustomerId || !clientData.defaultPaymentMethodId) {
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

    const pmId = clientData.defaultPaymentMethodId;
    const linkedStripeInvoiceId = (invoiceData.stripeInvoiceId as string | undefined) || undefined;

    const existingTimeline = invoiceData.timeline || [];
    const existingSysInfo = invoiceData.systemInformation || {};

    /* ─────────────────────────────────────────────────────────────────
       PATH 1 — EXISTING STRIPE INVOICE
       Pay the invoice itself with the saved PM. Stripe charges the
       customer using the invoice's own PI and flips it to 'paid'.
    ───────────────────────────────────────────────────────────────── */
    if (linkedStripeInvoiceId) {
      let paidStripeInvoice: Stripe.Invoice;

      try {
        paidStripeInvoice = await stripe.invoices.pay(
          linkedStripeInvoiceId,
          {
            off_session: true,
            payment_method: pmId,
          },
          // Idempotency tied to the invoice — Stripe will return the
          // same response if this is retried after a network blip
          // instead of double-charging.
          { idempotencyKey: `pay-invoice-${linkedStripeInvoiceId}` },
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

    const paymentIntent = await stripe.paymentIntents.create(piParams, {
      idempotencyKey: `charge-invoice-legacy-${invoiceId}`,
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
      } catch {}
    }

    const message = error?.message || 'Failed to charge saved card';
    const code = error?.code ? ` [${error.code}]` : '';
    return NextResponse.json({ error: `${message}${code}` }, { status: 500 });
  }
}
