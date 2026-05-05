/**
 * Payment Logs — central writer + Stripe-to-PaymentLog mapper.
 *
 * Single entry point so the webhook + every server-initiated charge
 * flow lands an identically-shaped row in Firestore. Operators read
 * these via /admin-portal/payment-logs to answer "what happened, what
 * got updated, why did it fail, what do I do next."
 *
 * Three reasons everything routes through here instead of writing
 * directly to the collection:
 *   1. Idempotency — Stripe retries the same webhook event up to 3
 *      days. We dedupe by `event.id` (or `stripeObjectId + status` for
 *      server-initiated rows) so duplicates never produce two rows.
 *   2. Stripe → PaymentLog field mapping is non-trivial (PI vs Charge
 *      vs Invoice vs SetupIntent expose payment-method info in
 *      different shapes); centralising it avoids drift between the
 *      webhook and the manual-charge routes.
 *   3. Decline-code categorisation + "next steps" derivation runs in
 *      one place — change a mapping here and every future log row
 *      benefits, plus the admin UI never has to compute it itself.
 */

import {
  collection, doc, getDocs, getDoc, query, serverTimestamp, setDoc, where, Timestamp,
} from 'firebase/firestore';
import type Stripe from 'stripe';
import type {
  PaymentLog,
  PaymentLogMutation,
} from '@/types';

const COLLECTION = 'paymentLogs';

/**
 * Map a Stripe failure / decline code onto our internal category and
 * derive operator-facing next-step copy. Codes are sourced from
 * Stripe's official decline-code reference plus the most common
 * outcome.reason values we've seen in production.
 */
const DECLINE_TABLE: Record<
  string,
  {
    category: PaymentLog['declineCategory'];
    causes: string[];
    nextSteps: string[];
  }
> = {
  insufficient_funds: {
    category: 'insufficient_funds',
    causes: [
      'Customer\'s bank balance is below the charge amount',
      'Daily / monthly card spending limit hit',
    ],
    nextSteps: [
      'Ask the customer to top up the account or use a different card.',
      'Retry the charge in 24-48 hours — the issuer often allows it after the next billing cycle.',
      'Offer the hosted Stripe pay link so the customer can pick a different card / ACH on the spot.',
    ],
  },
  authentication_required: {
    category: 'authentication_required',
    causes: [
      'Issuer requires 3D Secure / SCA challenge for off-session use',
      'Customer\'s bank flagged the off-session attempt as suspicious',
    ],
    nextSteps: [
      'Send the customer the hosted invoice URL — completing payment there satisfies the 3DS challenge.',
      'Once the customer authenticates once, future off-session charges on the same card usually go through.',
    ],
  },
  fraudulent: {
    category: 'fraudulent',
    causes: [
      'Issuer flagged the transaction as fraud',
      'Card may be reported lost / stolen',
    ],
    nextSteps: [
      'Do NOT retry — repeated attempts can damage Stripe\'s acceptance score.',
      'Contact the customer to confirm they intended the charge and to obtain a different card.',
      'If the customer disputes, surface the evidence collected on this log + the linked invoice.',
    ],
  },
  stolen_card: {
    category: 'lost_or_stolen',
    causes: ['Issuer reports the card as stolen'],
    nextSteps: [
      'Remove the saved payment method from the client\'s profile.',
      'Reach out to the customer for a replacement card.',
    ],
  },
  lost_card: {
    category: 'lost_or_stolen',
    causes: ['Issuer reports the card as lost'],
    nextSteps: [
      'Remove the saved payment method from the client\'s profile.',
      'Reach out to the customer for a replacement card.',
    ],
  },
  expired_card: {
    category: 'expired_card',
    causes: ['Card is past its expiry date'],
    nextSteps: [
      'Ask the customer to add an updated card.',
      'Remove the expired payment method from the client\'s profile to avoid further failed retries.',
    ],
  },
  incorrect_cvc: {
    category: 'incorrect_data',
    causes: ['CVC the issuer is checking against doesn\'t match'],
    nextSteps: [
      'Ask the customer to re-enter the card via the hosted Stripe pay link — that flow re-collects the CVC.',
    ],
  },
  incorrect_number: {
    category: 'incorrect_data',
    causes: ['Card number on file is wrong / mistyped at save time'],
    nextSteps: [
      'Remove the saved card and have the customer re-add it via the secure Stripe modal.',
    ],
  },
  invalid_cvc: {
    category: 'incorrect_data',
    causes: ['CVC fails Stripe\'s format check'],
    nextSteps: [
      'Re-enter the card via the hosted Stripe pay link.',
    ],
  },
  invalid_expiry_month: {
    category: 'incorrect_data',
    causes: ['Saved expiry month doesn\'t match the issuer\'s record'],
    nextSteps: [
      'Re-enter the card with the correct expiry.',
    ],
  },
  invalid_expiry_year: {
    category: 'incorrect_data',
    causes: ['Saved expiry year doesn\'t match the issuer\'s record'],
    nextSteps: [
      'Re-enter the card with the correct expiry.',
    ],
  },
  card_velocity_exceeded: {
    category: 'card_velocity',
    causes: ['Issuer\'s velocity limit hit (too many recent charges)'],
    nextSteps: [
      'Wait 24 hours before retrying.',
      'If the issue repeats, ask the customer to use a different payment method.',
    ],
  },
  currency_not_supported: {
    category: 'currency_unsupported',
    causes: ['Card doesn\'t support the currency we\'re charging in'],
    nextSteps: [
      'Use a different payment method, or charge in the customer\'s home currency.',
    ],
  },
  processing_error: {
    category: 'processing_error',
    causes: [
      'Transient issuer / network glitch',
      'Stripe-side processing hiccup',
    ],
    nextSteps: [
      'Retry the charge in a few minutes — these are usually transient.',
      'If repeated, switch to the hosted Stripe pay link so the customer drives the flow.',
    ],
  },
  do_not_honor: {
    category: 'bank_declined',
    causes: [
      'Generic "issuer declined" — the most common opaque decline',
      'Often issuer-side fraud rules without a more specific code',
    ],
    nextSteps: [
      'Customer should call their issuer to authorise — most resolve in <10 minutes.',
      'Use the hosted pay link so the customer can pick a different method.',
    ],
  },
  generic_decline: {
    category: 'generic_decline',
    causes: ['Issuer declined without a specific reason'],
    nextSteps: [
      'Customer should call their issuer to authorise.',
      'Use the hosted pay link so the customer can pick a different method.',
    ],
  },
  card_declined: {
    category: 'generic_decline',
    causes: ['Generic Stripe-level decline'],
    nextSteps: [
      'Customer should call their issuer to authorise, or pick a different payment method.',
    ],
  },
};

const FALLBACK_DECLINE = {
  category: 'unknown' as const,
  causes: ['Unrecognised decline code — see the failure message for details'],
  nextSteps: [
    'Open the linked Stripe object for the full decline reason.',
    'Reach out to the customer if the failure persists.',
  ],
};

/**
 * Resolve { category, possibleCauses, nextSteps } for a given pair of
 * Stripe codes. Tries decline_code (more specific) first, falls back
 * to failure_code, finally to a generic "unknown" tuple so the UI
 * always has something useful to show.
 */
export function classifyDecline(
  declineCode?: string | null,
  failureCode?: string | null,
): Pick<PaymentLog, 'declineCategory' | 'possibleCauses' | 'nextSteps'> {
  const candidate = declineCode || failureCode || '';
  const entry = DECLINE_TABLE[candidate] || FALLBACK_DECLINE;
  return {
    declineCategory: entry.category,
    possibleCauses: entry.causes,
    nextSteps: entry.nextSteps,
  };
}

// ── Stripe object → PaymentLog field mapping ──────────────────────
// Each helper below extracts the same downstream PaymentLog shape from
// a different Stripe object type so the writer can stay generic.

function trimPayload(payload: any): any {
  // Firestore caps a single doc at ~1MB. Stripe payloads are usually
  // <30KB but some (line_items expansions, big metadata blobs) creep
  // higher. We strip clearly-bulky nested arrays and cap the JSON
  // string length defensively.
  if (!payload) return null;
  try {
    const json = JSON.stringify(payload);
    if (json.length < 50_000) return payload;
    // Re-serialise without the heaviest known offenders.
    const stripped: any = { ...payload };
    if (stripped?.lines?.data) stripped.lines = { data: '[truncated]' };
    if (stripped?.charges?.data) stripped.charges = { data: '[truncated]' };
    const json2 = JSON.stringify(stripped);
    if (json2.length < 50_000) return stripped;
    return { _truncated: true, id: payload.id, object: payload.object, status: payload.status };
  } catch {
    return { _serialisation_error: true };
  }
}

function moneyFromCents(cents?: number | null) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return undefined;
  return cents / 100;
}

interface BasePmFields {
  paymentMethodId?: string;
  paymentMethodType?: PaymentLog['paymentMethodType'];
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: number;
  cardExpYear?: number;
  cardCountry?: string;
  cardFunding?: PaymentLog['cardFunding'];
  bankName?: string;
  bankLast4?: string;
  bankAccountType?: string;
}

function pmFieldsFromPaymentMethod(pm: any): BasePmFields {
  if (!pm) return {};
  const out: BasePmFields = {
    paymentMethodId: typeof pm === 'string' ? pm : pm.id,
  };
  if (typeof pm === 'string') return out;
  out.paymentMethodType = (
    pm.type === 'card' || pm.type === 'us_bank_account' || pm.type === 'link' || pm.type === 'cashapp'
      ? pm.type
      : 'other'
  ) as PaymentLog['paymentMethodType'];
  if (pm.card) {
    out.cardBrand = pm.card.brand;
    out.cardLast4 = pm.card.last4;
    out.cardExpMonth = pm.card.exp_month;
    out.cardExpYear = pm.card.exp_year;
    out.cardCountry = pm.card.country;
    out.cardFunding = pm.card.funding;
  }
  if (pm.us_bank_account) {
    out.bankName = pm.us_bank_account.bank_name;
    out.bankLast4 = pm.us_bank_account.last4;
    out.bankAccountType = pm.us_bank_account.account_type;
  }
  return out;
}

function pmFieldsFromCharge(charge: Stripe.Charge): BasePmFields {
  const pmd = (charge as any).payment_method_details;
  const out: BasePmFields = {
    paymentMethodId: typeof charge.payment_method === 'string'
      ? charge.payment_method
      : (charge.payment_method as any)?.id,
  };
  if (pmd?.card) {
    out.paymentMethodType = 'card';
    out.cardBrand = pmd.card.brand;
    out.cardLast4 = pmd.card.last4;
    out.cardExpMonth = pmd.card.exp_month;
    out.cardExpYear = pmd.card.exp_year;
    out.cardCountry = pmd.card.country;
    out.cardFunding = pmd.card.funding;
  } else if (pmd?.us_bank_account) {
    out.paymentMethodType = 'us_bank_account';
    out.bankName = pmd.us_bank_account.bank_name;
    out.bankLast4 = pmd.us_bank_account.last4;
    out.bankAccountType = pmd.us_bank_account.account_type;
  }
  return out;
}

function customerFields(obj: any) {
  const customerId =
    typeof obj?.customer === 'string'
      ? obj.customer
      : obj?.customer?.id;
  const email =
    obj?.customer_email
    || obj?.receipt_email
    || (typeof obj?.customer === 'object' ? obj.customer?.email : undefined);
  const name =
    obj?.customer_name
    || (typeof obj?.customer === 'object' ? obj.customer?.name : undefined);
  return {
    stripeCustomerId: customerId || undefined,
    customerEmail: email || undefined,
    customerName: name || undefined,
  };
}

function linkageFromMetadata(metadata: Record<string, string> | undefined | null) {
  if (!metadata) return {};
  return {
    linkedInvoiceId: metadata.invoiceId || undefined,
    linkedInvoiceNumber: metadata.invoiceNumber || undefined,
    linkedClientId: metadata.clientId || undefined,
    linkedScheduledInvoiceId: metadata.scheduledInvoiceId || undefined,
    linkedRecurringWorkOrderId:
      metadata.recurringWorkOrderId || metadata.rwoId || undefined,
    linkedSubcontractorId: metadata.subcontractorId || undefined,
  };
}

function chargeRiskFields(charge: Stripe.Charge) {
  const o: any = (charge as any).outcome;
  if (!o) return {};
  return {
    riskScore: typeof charge.outcome?.risk_score === 'number' ? charge.outcome.risk_score : undefined,
    riskLevel: o.risk_level as PaymentLog['riskLevel'],
    outcomeType: o.type,
    outcomeReason: o.reason,
    outcomeNetwork: o.network_status,
  };
}

// ── Per-object normalisers ────────────────────────────────────────

export function fromPaymentIntent(
  pi: Stripe.PaymentIntent,
  status: PaymentLog['status'],
): Partial<PaymentLog> {
  // Stripe API ≥ 2022-11-15 (incl. our pinned 2023-10-16) removed
  // `pi.charges.data[]`; the canonical access path is `pi.latest_charge`
  // (a string id by default, expanded charge object when the caller
  // passed `expand: ['latest_charge']`). Reading `pi.charges` here
  // returned undefined silently — every PI logged via this helper
  // was missing card brand/last4/decline reason/fee. Read both fields
  // for backwards-compat with any leftover older-API callers.
  const latestChargeRaw =
    (pi as any).latest_charge ?? (pi as any).charges?.data?.[0] ?? undefined;
  const charge: Stripe.Charge | undefined =
    latestChargeRaw && typeof latestChargeRaw === 'object'
      ? (latestChargeRaw as Stripe.Charge)
      : undefined;
  const chargeIdFromString =
    typeof latestChargeRaw === 'string' ? latestChargeRaw : undefined;

  const pm = pi.payment_method;
  const pmFromCharge = charge ? pmFieldsFromCharge(charge) : null;
  const pmFromPm = !pmFromCharge ? pmFieldsFromPaymentMethod(pm) : null;
  const pmFields = pmFromCharge ?? pmFromPm ?? {};

  const failureCode = (pi.last_payment_error?.code as string | undefined) || (charge?.failure_code as any);
  const declineCode =
    (pi.last_payment_error?.decline_code as string | undefined)
    || (charge?.outcome?.reason as string | undefined);
  const failureMessage =
    pi.last_payment_error?.message
    || (charge as any)?.failure_message
    || undefined;
  const cls = (status === 'failed' || status === 'requires_action')
    ? classifyDecline(declineCode, failureCode)
    : {};

  return {
    stripeObjectId: pi.id,
    stripeObjectType: 'payment_intent',
    status,
    amount: moneyFromCents(pi.amount_received || pi.amount),
    amountCents: pi.amount_received || pi.amount,
    currency: pi.currency,
    chargeId: charge?.id || chargeIdFromString || undefined,
    receiptUrl: charge?.receipt_url || undefined,
    feeAmount: typeof (charge as any)?.balance_transaction === 'object'
      ? (charge as any)?.balance_transaction?.fee : undefined,
    netAmount: typeof (charge as any)?.balance_transaction === 'object'
      ? (charge as any)?.balance_transaction?.net : undefined,
    balanceTransactionId: typeof charge?.balance_transaction === 'string'
      ? charge.balance_transaction
      : (charge?.balance_transaction as any)?.id,
    ...pmFields,
    ...customerFields(pi),
    ...linkageFromMetadata(pi.metadata),
    ...(charge ? chargeRiskFields(charge) : {}),
    ...(failureCode ? { failureCode } : {}),
    ...(declineCode ? { declineCode } : {}),
    ...(failureMessage ? { failureMessage } : {}),
    ...cls,
    stripeCreatedAt: pi.created ? Timestamp.fromMillis(pi.created * 1000) : undefined,
  };
}

export function fromCharge(
  charge: Stripe.Charge,
  status: PaymentLog['status'],
): Partial<PaymentLog> {
  const failureCode = charge.failure_code as string | undefined;
  const declineCode = charge.outcome?.reason as string | undefined;
  const failureMessage = charge.failure_message || undefined;
  const cls = status !== 'succeeded' ? classifyDecline(declineCode, failureCode) : {};

  return {
    stripeObjectId: charge.id,
    stripeObjectType: 'charge',
    status,
    amount: moneyFromCents(charge.amount),
    amountCents: charge.amount,
    currency: charge.currency,
    chargeId: charge.id,
    receiptUrl: charge.receipt_url || undefined,
    feeAmount: typeof charge.balance_transaction === 'object'
      ? (charge.balance_transaction as any)?.fee : undefined,
    netAmount: typeof charge.balance_transaction === 'object'
      ? (charge.balance_transaction as any)?.net : undefined,
    balanceTransactionId: typeof charge.balance_transaction === 'string'
      ? charge.balance_transaction
      : (charge.balance_transaction as any)?.id,
    ...pmFieldsFromCharge(charge),
    ...customerFields(charge),
    ...linkageFromMetadata(charge.metadata),
    ...chargeRiskFields(charge),
    ...(failureCode ? { failureCode } : {}),
    ...(declineCode ? { declineCode } : {}),
    ...(failureMessage ? { failureMessage } : {}),
    ...cls,
    stripeCreatedAt: charge.created ? Timestamp.fromMillis(charge.created * 1000) : undefined,
  };
}

export function fromInvoice(
  inv: Stripe.Invoice,
  status: PaymentLog['status'],
): Partial<PaymentLog> {
  return {
    stripeObjectId: inv.id || '',
    stripeObjectType: 'invoice',
    status,
    amount: moneyFromCents(inv.amount_paid ?? inv.amount_due ?? 0),
    amountCents: inv.amount_paid ?? inv.amount_due ?? 0,
    currency: inv.currency,
    hostedInvoiceUrl: inv.hosted_invoice_url || undefined,
    invoicePdfUrl: inv.invoice_pdf || undefined,
    chargeId: typeof inv.charge === 'string' ? inv.charge : (inv.charge as any)?.id,
    ...customerFields(inv),
    ...linkageFromMetadata(inv.metadata),
    stripeCreatedAt: inv.created ? Timestamp.fromMillis(inv.created * 1000) : undefined,
  };
}

export function fromSetupIntent(
  si: Stripe.SetupIntent,
  status: PaymentLog['status'],
): Partial<PaymentLog> {
  const failureCode = si.last_setup_error?.code as string | undefined;
  const declineCode = si.last_setup_error?.decline_code as string | undefined;
  const failureMessage = si.last_setup_error?.message;
  const cls = status === 'failed' ? classifyDecline(declineCode, failureCode) : {};

  return {
    stripeObjectId: si.id,
    stripeObjectType: 'setup_intent',
    status,
    ...pmFieldsFromPaymentMethod(si.payment_method),
    ...customerFields(si),
    ...linkageFromMetadata(si.metadata),
    ...(failureCode ? { failureCode } : {}),
    ...(declineCode ? { declineCode } : {}),
    ...(failureMessage ? { failureMessage } : {}),
    ...cls,
    stripeCreatedAt: si.created ? Timestamp.fromMillis(si.created * 1000) : undefined,
  };
}

export function fromCheckoutSession(
  cs: Stripe.Checkout.Session,
  status: PaymentLog['status'],
): Partial<PaymentLog> {
  return {
    stripeObjectId: cs.id,
    stripeObjectType: 'checkout_session',
    status,
    amount: moneyFromCents(cs.amount_total ?? cs.amount_subtotal ?? 0),
    amountCents: cs.amount_total ?? cs.amount_subtotal ?? 0,
    currency: cs.currency || 'usd',
    ...customerFields(cs),
    ...linkageFromMetadata(cs.metadata as any),
    stripeCreatedAt: cs.created ? Timestamp.fromMillis(cs.created * 1000) : undefined,
  };
}

// ── Public writer ─────────────────────────────────────────────────

interface RecordPaymentEventArgs {
  db: any; // Firestore
  partial: Partial<PaymentLog>;
  source: PaymentLog['source'];
  rawEventType?: string;
  stripeEventId?: string;
  rawPayload?: any;
  triggeredByUid?: string;
  triggeredByName?: string;
  recordMutations?: PaymentLogMutation[];
}

/**
 * Idempotency key — webhook events use the event id; server-initiated
 * rows that fire BEFORE the matching webhook arrives use
 * `${stripeObjectId}_${status}` so the later webhook can find and
 * update the same row instead of writing a duplicate.
 */
function buildLogId(args: RecordPaymentEventArgs): string {
  if (args.stripeEventId) return args.stripeEventId;
  const id = args.partial.stripeObjectId || 'unknown';
  const status = args.partial.status || 'unknown';
  return `${id}__${status}__${args.source}`;
}

/**
 * Write or upsert a payment-log row. Returns the doc id.
 *
 * Idempotent: if a row with the same idempotency id already exists it
 * merges new fields into it — this happens when the server-side
 * action writes first ("here's what we attempted") and the webhook
 * arrives later ("here's what Stripe confirmed"), or vice-versa.
 */
export async function recordPaymentEvent(args: RecordPaymentEventArgs): Promise<string> {
  const docId = buildLogId(args);
  const now = serverTimestamp();

  // Append-only mutation log. If a prior write already added some,
  // we'll concatenate — read first to avoid clobbering.
  let existingMutations: PaymentLogMutation[] = [];
  let existing: any = null;
  try {
    const existingSnap = await getDoc(doc(args.db, COLLECTION, docId));
    if (existingSnap.exists()) {
      existing = existingSnap.data();
      if (Array.isArray(existing?.recordMutations)) {
        existingMutations = existing.recordMutations;
      }
    }
  } catch {
    /* read errors are tolerable — first-write path still succeeds */
  }

  const mergedMutations = [
    ...existingMutations,
    ...(args.recordMutations || []),
  ];

  // Strip undefineds — Firestore rejects payloads with explicit undefined values.
  const payload: Record<string, any> = {
    ...args.partial,
    source: args.source,
    ...(args.rawEventType ? { rawEventType: args.rawEventType } : {}),
    ...(args.stripeEventId ? { stripeEventId: args.stripeEventId } : {}),
    ...(args.triggeredByUid ? { triggeredByUid: args.triggeredByUid } : {}),
    ...(args.triggeredByName ? { triggeredByName: args.triggeredByName } : {}),
    ...(mergedMutations.length ? { recordMutations: mergedMutations } : {}),
    ...(args.rawPayload ? { rawPayload: trimPayload(args.rawPayload) } : {}),
    updatedAt: now,
    ...(existing ? {} : { createdAt: now }),
  };

  // Drop undefined keys (Firestore won't accept them).
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }

  await setDoc(doc(args.db, COLLECTION, docId), payload, { merge: true });
  return docId;
}

/**
 * Look up the linked Firestore invoice for a Stripe payment + back-fill
 * the linkedInvoiceNumber + linkedClientId/Name fields from it. Webhook
 * handlers occasionally have only the Stripe object id and need to
 * resolve the rest by scanning. Best-effort — returns whatever it can
 * find.
 */
export async function resolveInvoiceLinkage(
  db: any,
  args: { stripeInvoiceId?: string; stripePaymentIntentId?: string; stripeChargeId?: string; metadata?: Record<string, string> },
): Promise<Pick<PaymentLog, 'linkedInvoiceId' | 'linkedInvoiceNumber' | 'linkedClientId' | 'linkedClientName'>> {
  // Metadata is the cheapest path.
  if (args.metadata?.invoiceId) {
    try {
      const snap = await getDoc(doc(db, 'invoices', args.metadata.invoiceId));
      if (snap.exists()) {
        const data = snap.data() as any;
        return {
          linkedInvoiceId: snap.id,
          linkedInvoiceNumber: data.invoiceNumber,
          linkedClientId: data.clientId,
          linkedClientName: data.clientName,
        };
      }
    } catch { /* keep trying */ }
  }
  // stripeInvoiceId match (hosted invoices)
  if (args.stripeInvoiceId) {
    try {
      const snap = await getDocs(query(
        collection(db, 'invoices'),
        where('stripeInvoiceId', '==', args.stripeInvoiceId),
      ));
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data() as any;
        return {
          linkedInvoiceId: d.id,
          linkedInvoiceNumber: data.invoiceNumber,
          linkedClientId: data.clientId,
          linkedClientName: data.clientName,
        };
      }
    } catch { /* keep trying */ }
  }
  // PaymentIntent id match (legacy / manual-charge invoices)
  if (args.stripePaymentIntentId) {
    try {
      const snap = await getDocs(query(
        collection(db, 'invoices'),
        where('stripePaymentIntentId', '==', args.stripePaymentIntentId),
      ));
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data() as any;
        return {
          linkedInvoiceId: d.id,
          linkedInvoiceNumber: data.invoiceNumber,
          linkedClientId: data.clientId,
          linkedClientName: data.clientName,
        };
      }
    } catch { /* keep trying */ }
  }
  return {};
}

/**
 * Build a single mutation entry for the recordMutations array. Used
 * by webhook + manual-charge handlers to log every Firestore doc they
 * just updated as part of processing the payment event.
 */
export function buildMutation(args: {
  collection: string;
  docId: string;
  field?: string;
  from?: string;
  to?: string;
  summary: string;
}): PaymentLogMutation {
  return {
    collection: args.collection,
    docId: args.docId,
    ...(args.field ? { field: args.field } : {}),
    ...(args.from ? { from: args.from } : {}),
    ...(args.to ? { to: args.to } : {}),
    at: Timestamp.now(),
    summary: args.summary,
  };
}
