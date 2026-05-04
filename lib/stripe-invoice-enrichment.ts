import Stripe from 'stripe';

/**
 * Enrich a Firestore invoice with Stripe payment details by retrieving the
 * PaymentIntent (with `latest_charge` + `balance_transaction` expanded) and
 * pulling out the bits the admin/client UIs and finance need:
 *
 *   • Reference IDs    → stripeChargeId, stripeBalanceTransactionId
 *   • Money received   → stripeAmountReceived (dollars), stripeCurrency
 *   • Payer info       → stripeCustomerEmail, stripeCardBrand, stripeCardLast4
 *   • Receipt          → stripeReceiptUrl (Stripe-hosted)
 *
 * Always returns SOMETHING — partial enrichment is better than nothing. On
 * total failure we return whatever we got plus an error string so the caller
 * can persist `stripeEnrichmentError` for support to debug. The caller still
 * marks the invoice paid regardless; this is supplementary metadata, not a
 * gate on the customer's payment.
 *
 * Used by:
 *   • app/api/stripe/webhook/route.ts  — handleSuccessfulPayment + PI succeeded
 *   • app/api/stripe/confirm-payment/route.ts — success-page fallback when the
 *     webhook is delayed.
 */
export interface StripeEnrichmentFields {
  stripeChargeId?: string;
  stripeBalanceTransactionId?: string;
  stripeReceiptUrl?: string;
  stripeAmountReceived?: number;
  stripeCurrency?: string;
  stripeCustomerEmail?: string;
  stripeCardBrand?: string;
  stripeCardLast4?: string;
}

export async function enrichFromPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<{ fields: StripeEnrichmentFields; error: string | null }> {
  const out: StripeEnrichmentFields = {};
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge', 'latest_charge.balance_transaction'],
    });

    if (typeof pi.amount_received === 'number') {
      out.stripeAmountReceived = pi.amount_received / 100; // dollars
    }
    if (pi.currency) out.stripeCurrency = pi.currency.toUpperCase();
    if (pi.receipt_email) out.stripeCustomerEmail = pi.receipt_email;

    const latest = (pi as any).latest_charge as
      | Stripe.Charge
      | string
      | null
      | undefined;

    let charge: Stripe.Charge | null = null;
    if (latest && typeof latest === 'object') {
      charge = latest;
    } else if (typeof latest === 'string') {
      charge = await stripe.charges.retrieve(latest, {
        expand: ['balance_transaction'],
      });
    }

    if (charge) {
      out.stripeChargeId = charge.id;
      if (charge.receipt_url) out.stripeReceiptUrl = charge.receipt_url;
      // Charge billing email beats the PI receipt_email when both present.
      if (charge.billing_details?.email) {
        out.stripeCustomerEmail = charge.billing_details.email;
      }
      const card = charge.payment_method_details?.card;
      if (card?.brand) out.stripeCardBrand = card.brand;
      if (card?.last4) out.stripeCardLast4 = card.last4;

      const balanceTxn = (charge as any).balance_transaction as
        | Stripe.BalanceTransaction
        | string
        | null
        | undefined;
      if (balanceTxn && typeof balanceTxn === 'object') {
        out.stripeBalanceTransactionId = balanceTxn.id;
      } else if (typeof balanceTxn === 'string') {
        out.stripeBalanceTransactionId = balanceTxn;
      }
    }

    return { fields: out, error: null };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.warn(`[stripe-enrich] failed for PI ${paymentIntentId}:`, message);
    return { fields: out, error: message };
  }
}
