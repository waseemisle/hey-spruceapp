import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { recordPaymentEvent, fromInvoice, buildMutation } from '@/lib/payment-logs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function POST(request: NextRequest) {
  const db = await getServerDb();
  try {
    const body = await request.json();
    const {
      invoiceId,
      invoiceNumber: bodyInvoiceNumber,
      amount: bodyAmount,
      customerEmail: bodyCustomerEmail,
      clientName: bodyClientName,
      clientId: bodyClientId,
      // ── Auto-pay flag — when true AND the client has a saved
      // defaultPaymentMethodId, we create the Stripe invoice with
      // collection_method=charge_automatically and Stripe attempts to
      // charge the saved card off-session at finalize time. When false
      // (default) or the client has no saved card, we keep the existing
      // collection_method=send_invoice flow so Stripe emails the
      // hosted payment link.
      autoCharge: bodyAutoCharge,
    } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing required field: invoiceId' }, { status: 400 });
    }

    const invoiceSnap = await getDoc(doc(db, 'invoices', invoiceId));
    if (!invoiceSnap.exists()) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    const inv = invoiceSnap.data();

    const resolvedAmount = Number(inv.totalAmount);
    if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
      return NextResponse.json(
        { error: 'Invoice total must be a positive number. Save the invoice before creating a payment link.' },
        { status: 400 }
      );
    }

    const invoiceNumber = inv.invoiceNumber || bodyInvoiceNumber || '';
    if (!invoiceNumber) {
      return NextResponse.json({ error: 'Invoice has no invoice number' }, { status: 400 });
    }

    const clientId = inv.clientId || bodyClientId || '';
    const customerEmail = inv.clientEmail || bodyCustomerEmail || '';
    const clientName = inv.clientName || bodyClientName || 'Client';

    if (typeof bodyAmount === 'number' && Math.abs(bodyAmount - resolvedAmount) > 0.009) {
      console.warn('[create-payment-link] Client amount differs from Firestore; using Firestore total.', {
        invoiceId,
        clientAmount: bodyAmount,
        firestoreTotal: resolvedAmount,
      });
    }

    // Stripe Invoices require a Customer object. If no clientId is on the
    // invoice we still need an ad-hoc customer keyed off the email.
    let stripeCustomerId: string | undefined;
    // Saved payment method id for auto-pay routing. Resolved alongside the
    // Stripe customer lookup so we don't pay an extra round-trip later.
    let clientDefaultPaymentMethodId: string | undefined;
    let clientAutoPayEnabled = false;
    if (clientId) {
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (clientDoc.exists()) {
        const clientData = clientDoc.data();
        stripeCustomerId = clientData.stripeCustomerId;
        clientDefaultPaymentMethodId = clientData.defaultPaymentMethodId || undefined;
        clientAutoPayEnabled = clientData.autoPayEnabled === true;
        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            email: clientData.email || customerEmail,
            name: clientData.fullName || clientName,
            metadata: { clientId, companyName: clientData.companyName || '' },
          });
          stripeCustomerId = customer.id;
          await updateDoc(doc(db, 'clients', clientId), {
            stripeCustomerId,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    if (!stripeCustomerId) {
      if (!customerEmail?.trim()) {
        return NextResponse.json(
          { error: 'Invoice has no client email; cannot create a Stripe customer.' },
          { status: 400 }
        );
      }
      const customer = await stripe.customers.create({
        email: customerEmail,
        name: clientName,
        metadata: { invoiceId, invoiceNumber },
      });
      stripeCustomerId = customer.id;
    }

    // ── Idempotency: reuse the existing Stripe invoice when possible ────
    // Earlier this route always voided the previous Stripe invoice and
    // created a fresh one, which produced INV-46743594 (void) +
    // INV-46743594-r{timestamp} (open) duplicates every time someone
    // clicked "Pay via Stripe" or "Pay Now". Stripe permanently reserves
    // invoice numbers, so the original number was lost.
    //
    // New behavior — return the existing Stripe invoice unchanged when:
    //   • Status is `open` AND amount_due matches the current Firestore
    //     totalAmount → caller just gets the same hosted_invoice_url back.
    //   • Status is `paid` / `uncollectible` → return current state without
    //     touching it (the webhook should have already synced status; if
    //     not, the sync route + auto-sync on page load will).
    // Only void+recreate when:
    //   • Existing invoice is `void` already (no harm), or
    //   • Status is `draft` (unfinished — discard and rebuild), or
    //   • `open` but the amount has drifted (line items were edited).
    // Callers that explicitly want a fresh invoice (e.g. after editing
    // line items) can pass `forceRegenerate: true` in the request body.
    // ────────────────────────────────────────────────────────────────────
    const expectedAmountCents = Math.round(resolvedAmount * 100);
    const forceRegenerate = body?.forceRegenerate === true;
    const previousStripeInvoiceId = (inv as any).stripeInvoiceId as string | undefined;
    if (previousStripeInvoiceId && !forceRegenerate) {
      try {
        const prev = await stripe.invoices.retrieve(previousStripeInvoiceId);
        const prevAmount = typeof prev.amount_due === 'number' ? prev.amount_due : -1;

        if (prev.status === 'open' && prevAmount === expectedAmountCents && prev.hosted_invoice_url) {
          // Reuse — no Stripe changes needed. Clear any stale failed-auto-charge
          // state so the admin doesn't see "Card declined" on an invoice they
          // are actively regenerating a link for.
          try {
            const firestoreInv = (await getDoc(doc(db, 'invoices', invoiceId))).data() as any;
            if (firestoreInv?.autoChargeStatus === 'failed') {
              await updateDoc(doc(db, 'invoices', invoiceId), {
                autoChargeStatus: null,
                autoChargeError: null,
                updatedAt: serverTimestamp(),
              });
            }
          } catch { /* non-fatal */ }
          return NextResponse.json({
            paymentLink: prev.hosted_invoice_url,
            hostedInvoiceUrl: prev.hosted_invoice_url,
            stripeInvoiceId: prev.id,
            sessionId: prev.id,
            reused: true,
          });
        }

        if (prev.status === 'paid' || prev.status === 'uncollectible') {
          // Don't recreate a settled invoice. Return its hosted URL so
          // the UI can still link to it; the auto-sync route will pick
          // up the paid state on the next page load.
          return NextResponse.json({
            paymentLink: prev.hosted_invoice_url || '',
            hostedInvoiceUrl: prev.hosted_invoice_url || '',
            stripeInvoiceId: prev.id,
            sessionId: prev.id,
            reused: true,
            stripeStatus: prev.status,
          });
        }

        // open-with-wrong-amount, draft, or anything else falls through to
        // a void + recreate. Voiding a draft is fine; voiding an open with
        // drifted amount is intentional.
        if (prev.status === 'open' || prev.status === 'draft') {
          await stripe.invoices.voidInvoice(previousStripeInvoiceId);
        }
      } catch (voidErr) {
        console.warn('[create-payment-link] Could not check/void previous Stripe invoice:', voidErr);
      }
    } else if (previousStripeInvoiceId && forceRegenerate) {
      // Caller explicitly asked for a regen — void the previous one if
      // it's still in a state where that's safe.
      try {
        const prev = await stripe.invoices.retrieve(previousStripeInvoiceId);
        if (prev.status === 'open' || prev.status === 'draft') {
          await stripe.invoices.voidInvoice(previousStripeInvoiceId);
        }
      } catch (voidErr) {
        console.warn('[create-payment-link] forceRegenerate void failed:', voidErr);
      }
    }

    const fallbackLineDescription = `Invoice ${invoiceNumber}`;

    // ── Auto-charge routing ─────────────────────────────────────────────
    // The caller decides when to request auto-charge (cron RWO execute
    // always asks; admin "Send Invoice" may ask if the UI surfaces the
    // option). We honour it only when the client has a saved default
    // payment method — otherwise there's nothing to charge and we
    // silently fall back to send_invoice. The clientAutoPayEnabled flag
    // is read for audit/visibility but does not gate cron because
    // recurring billing is opt-in at the RWO level, not at the per-
    // invoice level.
    void clientAutoPayEnabled; // referenced for clarity; not gating
    const autoChargeRequested = bodyAutoCharge === true;
    const willAutoCharge = autoChargeRequested && !!clientDefaultPaymentMethodId;

    // 1) Create the empty Stripe Invoice first (draft) so we can attach
    //    InvoiceItems directly to it via the `invoice` parameter. Earlier
    //    versions of the Stripe API auto-pulled pending invoice items for
    //    a customer at finalize time, but that behaviour is no longer
    //    reliable — items not bound to the invoice end up unattached and
    //    the invoice finalizes for \$0.
    //
    //    Set `number` so the hosted page shows our Firestore invoice
    //    number (e.g. INV-73052262) instead of Stripe's auto-generated
    //    sequence. Stripe reserves invoice numbers permanently, so on a
    //    regenerate we can't reuse the same string — fall back to a
    //    timestamped variant when Stripe rejects the duplicate.
    //
    //    No `description` here on purpose — the Invoice.description renders
    //    as a "Memo" at the top of the hosted page and was duplicating the
    //    line items. Memo intentionally omitted; per-item descriptions are
    //    enough.
    const baseInvoiceParams: Stripe.InvoiceCreateParams = willAutoCharge
      ? {
          // Auto-pay path: Stripe finalizes + charges off-session using the
          // default_payment_method we set below. invoice.paid webhook fires
          // on success → handleHostedInvoicePaid marks Firestore paid.
          customer: stripeCustomerId,
          collection_method: 'charge_automatically',
          auto_advance: true,
          default_payment_method: clientDefaultPaymentMethodId,
          pending_invoice_items_behavior: 'exclude',
          footer: `Invoice ${invoiceNumber}`,
          metadata: {
            invoiceId,
            invoiceNumber,
            clientName: clientName || '',
            clientId: clientId || '',
            autoCharge: 'true',
          },
        }
      : {
          customer: stripeCustomerId,
          collection_method: 'send_invoice',
          days_until_due: 30,
          auto_advance: false,
          pending_invoice_items_behavior: 'exclude',
          footer: `Invoice ${invoiceNumber}`,
          metadata: {
            invoiceId,
            invoiceNumber,
            clientName: clientName || '',
            clientId: clientId || '',
          },
        };

    let stripeInvoice: Stripe.Invoice;
    try {
      stripeInvoice = await stripe.invoices.create({ ...baseInvoiceParams, number: invoiceNumber });
    } catch (firstErr: any) {
      // Stripe blocks duplicate invoice numbers (even after voiding). On a
      // regen, append a short suffix so the hosted page still leads with
      // the user's invoice number.
      const code = firstErr?.code || firstErr?.raw?.code;
      const msg = String(firstErr?.message || firstErr?.raw?.message || '');
      const isDuplicate =
        code === 'invoice_number_invalid' ||
        code === 'resource_already_exists' ||
        /already exists/i.test(msg) ||
        /already set on another invoice/i.test(msg) ||
        /invoice number/i.test(msg);
      if (!isDuplicate) throw firstErr;
      const suffix = `-r${Math.floor(Date.now() / 1000) % 1000000}`;
      stripeInvoice = await stripe.invoices.create({ ...baseInvoiceParams, number: `${invoiceNumber}${suffix}` });
    }

    if (!stripeInvoice.id) {
      throw new Error('Stripe did not return an invoice id');
    }

    // 2) Attach line items directly to that invoice id.
    const rawLineItems = Array.isArray((inv as any).lineItems) ? (inv as any).lineItems : [];
    const usableLineItems = rawLineItems.filter((li: any) => Number(li?.amount) > 0);

    if (usableLineItems.length > 0) {
      for (const li of usableLineItems) {
        await stripe.invoiceItems.create({
          customer: stripeCustomerId,
          invoice: stripeInvoice.id,
          amount: Math.round(Number(li.amount) * 100),
          currency: 'usd',
          description: String(li.description || fallbackLineDescription).slice(0, 250),
          metadata: { invoiceId, invoiceNumber },
        });
      }
    } else {
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        invoice: stripeInvoice.id,
        amount: Math.round(resolvedAmount * 100),
        currency: 'usd',
        description: fallbackLineDescription,
        metadata: { invoiceId, invoiceNumber },
      });
    }

    // 3) Finalize → produces hosted_invoice_url, with the line items now
    //    locked in. For auto-charge invoices, finalize triggers an
    //    immediate off-session charge attempt against the saved card; the
    //    invoice transitions straight from draft → paid (or open / failed
    //    if the card was declined).
    const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
    if (typeof finalized.amount_due === 'number' && finalized.amount_due <= 0 && finalized.status !== 'paid') {
      // Defensive: the invoice should have a non-zero amount due here. If
      // Stripe returns 0 AND it's not because we just paid it (the
      // amount_due=0 + status=paid case is the auto-charge happy path),
      // void it so we don't ship a paid-\$0 link, then surface the error.
      try { await stripe.invoices.voidInvoice(stripeInvoice.id); } catch {}
      throw new Error(`Stripe invoice finalized at \$0 (amount_due=${finalized.amount_due}) — line items did not attach`);
    }
    const hostedUrl = finalized.hosted_invoice_url;
    if (!hostedUrl) {
      throw new Error('Stripe invoice did not return a hosted URL');
    }

    // For auto-charge invoices, capture the Stripe state immediately so
    // the caller knows whether to wait for the webhook (paid) or surface
    // a manual-payment fallback (failed). Stripe sets the invoice status
    // to 'paid' synchronously when the off-session charge succeeds.
    let autoChargeOutcome: 'succeeded' | 'failed' | 'requires_action' | 'pending' | null = null;
    // Decline reason from the PI's last_payment_error (not last_finalization_error
    // which is only set when finalization itself fails, not when the card is declined
    // after a successful finalization).
    let autoChargeError: string | undefined;
    let autoChargeFailureCode: string | undefined;
    let autoChargeDeclineCode: string | undefined;
    if (willAutoCharge) {
      if (finalized.status === 'paid') {
        autoChargeOutcome = 'succeeded';
      } else if (finalized.status === 'open') {
        // Card was declined or requires action; the customer can still
        // pay via the hosted invoice URL.
        autoChargeOutcome = 'failed';
        // Fetch the PI to get the actual decline reason. last_finalization_error
        // on the invoice is null for post-finalization card declines.
        const piId = typeof finalized.payment_intent === 'string'
          ? finalized.payment_intent
          : (finalized.payment_intent as any)?.id;
        if (piId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(piId);
            autoChargeError = pi.last_payment_error?.message || undefined;
            autoChargeFailureCode = pi.last_payment_error?.code as string | undefined;
            autoChargeDeclineCode = (pi.last_payment_error as any)?.decline_code as string | undefined;
          } catch {
            // non-fatal — fall back to generic message
          }
        }
        if (!autoChargeError) {
          autoChargeError = finalized.last_finalization_error?.message || 'Card declined';
        }
      } else {
        autoChargeOutcome = 'pending';
      }
    }

    // Always write the fresh hosted URL back to the Firestore invoice so
    // every consumer (admin detail page, client portal, emails) sees the
    // new link immediately. Auto-charge invoices also get
    // autoChargeAttempted/autoChargeStatus flagged immediately so the
    // admin UI can show a status pill before the webhook lands. The
    // webhook handler (handleHostedInvoicePaid) is still the canonical
    // marker for status:'paid' — these fields are the visible audit trail.
    try {
      const persistFields: Record<string, unknown> = {
        stripePaymentLink: hostedUrl,
        stripeInvoiceId: finalized.id,
        updatedAt: serverTimestamp(),
      };
      if (willAutoCharge) {
        persistFields.autoChargeAttempted = true;
        persistFields.autoChargeStatus = autoChargeOutcome || 'pending';
        if (autoChargeOutcome === 'failed') {
          persistFields.autoChargeError = autoChargeError || 'Card declined';
          if (autoChargeFailureCode) persistFields.autoChargeFailureCode = autoChargeFailureCode;
          if (autoChargeDeclineCode) persistFields.autoChargeDeclineCode = autoChargeDeclineCode;
        }
      }
      await updateDoc(doc(db, 'invoices', invoiceId), persistFields);
    } catch (persistErr) {
      console.warn('[create-payment-link] Failed to persist hosted URL on invoice:', persistErr);
    }

    // Log the auto-charge outcome to paymentLogs so the admin's
    // Payment Logs page captures synchronously-resolved auto-charges
    // (the matching invoice.paid / payment_intent.succeeded webhook
    // arrives later and merges richer fields into the same row).
    if (willAutoCharge) {
      try {
        const status: 'succeeded' | 'failed' | 'requires_action' | 'pending' =
          autoChargeOutcome || 'pending';
        const partial = fromInvoice(finalized, status);
        partial.linkedInvoiceId = invoiceId;
        partial.linkedInvoiceNumber = invoiceNumber;
        partial.linkedClientId = clientId || undefined;
        partial.linkedClientName = clientName || undefined;
        if (status === 'failed') {
          partial.failureMessage = autoChargeError;
          if (autoChargeFailureCode) partial.failureCode = autoChargeFailureCode;
          if (autoChargeDeclineCode) partial.declineCode = autoChargeDeclineCode;
        }
        await recordPaymentEvent({
          db,
          partial,
          source: 'hosted_link_finalize',
          rawPayload: finalized,
          recordMutations: [
            buildMutation({
              collection: 'invoices',
              docId: invoiceId,
              field: 'autoChargeStatus',
              to: status,
              summary: `Auto-charge at finalize: ${status} (${invoiceNumber})`,
            }),
          ],
        });
      } catch (logErr) {
        console.warn('[create-payment-link] paymentLogs write failed (non-fatal):', logErr);
      }
    }

    return NextResponse.json({
      paymentLink: hostedUrl,
      hostedInvoiceUrl: hostedUrl,
      stripeInvoiceId: finalized.id,
      // Retained for backwards compatibility with callers that previously
      // persisted the Checkout Session id; this is now the Stripe Invoice id.
      sessionId: finalized.id,
      autoCharge: willAutoCharge
        ? { attempted: true, outcome: autoChargeOutcome, status: finalized.status }
        : { attempted: false, reason: autoChargeRequested ? 'no_saved_payment_method' : 'not_requested' },
    });
  } catch (error: any) {
    console.error('Stripe error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create payment link' },
      { status: 500 }
    );
  }
}
