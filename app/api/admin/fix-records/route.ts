/**
 * ONE-TIME FIX — delete this file after running successfully.
 *
 * Corrects two production records that were written with bugs now fixed in code:
 *
 *  1. Invoice VGmkJeS7Lt70Av17wH7u
 *     - Stripe invoice in_1TUNmxBcuvtHgQOtHFeBytNE is paid, but Firestore still
 *       had status='sent' / autoChargeStatus='failed'. Marks it paid and clears
 *       the stale auto-charge failure fields.
 *
 *  2. Payment log in_1TUNmxBcuvtHgQOtHFeBytNE__failed__hosted_link_finalize
 *     - Was written with amount=0 / amountCents=0 due to the ?? vs || bug in
 *       fromInvoice(). Patches it with the real amount_due from Stripe.
 *
 * Run once via:
 *   POST /api/admin/fix-records
 *   Authorization: Bearer <STRIPE_SECRET_KEY>
 */
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { createInvoiceTimelineEvent } from '@/lib/timeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STRIPE_INVOICE_ID = 'in_1TUNmxBcuvtHgQOtHFeBytNE';
const FIRESTORE_INVOICE_ID = 'VGmkJeS7Lt70Av17wH7u';
const PAYMENT_LOG_ID = `${STRIPE_INVOICE_ID}__failed__hosted_link_finalize`;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export async function POST(request: NextRequest) {
  // Simple bearer-token guard — must match the Stripe secret key prefix.
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = await getServerDb();
  const results: Record<string, any> = {};

  // ── 1. Fetch the Stripe invoice ────────────────────────────────
  let stripeInvoice: Stripe.Invoice;
  try {
    stripeInvoice = await stripe.invoices.retrieve(STRIPE_INVOICE_ID);
  } catch (err: any) {
    return NextResponse.json({ error: `Stripe retrieve failed: ${err.message}` }, { status: 500 });
  }

  if (stripeInvoice.status !== 'paid') {
    return NextResponse.json({
      error: `Stripe invoice is not paid (status=${stripeInvoice.status}). Nothing changed.`,
    }, { status: 400 });
  }

  results.stripeStatus = stripeInvoice.status;
  results.stripeAmountPaid = stripeInvoice.amount_paid;
  results.stripeAmountDue = stripeInvoice.amount_due;

  // ── 2. Resolve charge + receipt URL ───────────────────────────
  let receiptUrl: string | null = null;
  let chargeId: string | null = null;
  try {
    const piRef = stripeInvoice.payment_intent;
    const piId = typeof piRef === 'string' ? piRef : (piRef as any)?.id || null;
    if (piId) {
      const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
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
  } catch (err: any) {
    results.chargeResolveWarning = err.message;
  }

  // ── 3. Fix the Firestore invoice ───────────────────────────────
  const invRef = doc(db, 'invoices', FIRESTORE_INVOICE_ID);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) {
    return NextResponse.json({ error: 'Firestore invoice not found' }, { status: 404 });
  }
  const invData = invSnap.data() as any;

  if (invData.status === 'paid' && invData.autoChargeStatus !== 'failed') {
    results.invoiceAlreadyFixed = true;
  } else {
    const existingTimeline = invData.timeline || [];
    const existingSysInfo = invData.systemInformation || {};

    const fixEvent = createInvoiceTimelineEvent({
      type: 'paid',
      userId: 'system',
      userName: 'Payment System (Data Fix)',
      userRole: 'system',
      details: `One-time data fix: Stripe invoice ${STRIPE_INVOICE_ID} was paid but Firestore had stale auto-charge failure state.`,
      metadata: {
        stripeInvoiceId: stripeInvoice.id,
        hostedInvoiceUrl: stripeInvoice.hosted_invoice_url || '',
        source: 'admin_fix_endpoint',
      },
    });

    await updateDoc(invRef, {
      status: 'paid',
      paidAt: serverTimestamp(),
      stripeInvoiceId: stripeInvoice.id,
      stripePaymentIntentId:
        typeof stripeInvoice.payment_intent === 'string'
          ? stripeInvoice.payment_intent
          : (stripeInvoice.payment_intent as any)?.id || null,
      stripeChargeId: chargeId,
      stripeReceiptUrl: receiptUrl,
      stripeInvoicePdf: stripeInvoice.invoice_pdf || null,
      stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url || null,
      autoChargeStatus: 'succeeded',
      autoChargeError: null,
      timeline: [...existingTimeline, fixEvent],
      systemInformation: {
        ...existingSysInfo,
        paidAt: Timestamp.now(),
        paidBy: {
          id: 'system',
          name: 'Payment System (Data Fix)',
          timestamp: Timestamp.now(),
        },
      },
      updatedAt: serverTimestamp(),
    });

    results.invoiceFixed = true;
    results.invoiceFields = {
      status: 'paid',
      autoChargeStatus: 'succeeded',
      autoChargeError: null,
      chargeId,
      receiptUrl,
    };
  }

  // ── 4. Fix the payment log amount ─────────────────────────────
  // The log was written with amount=0/amountCents=0 because amount_paid=0
  // (auto-charge failed) and the old code used ?? instead of ||, so it
  // didn't fall through to amount_due. Patch with the correct amount_due.
  const correctAmountCents = stripeInvoice.amount_due;
  const correctAmount = correctAmountCents / 100;

  const logRef = doc(db, 'paymentLogs', PAYMENT_LOG_ID);
  const logSnap = await getDoc(logRef);
  if (!logSnap.exists()) {
    results.paymentLogWarning = 'Payment log doc not found — skipped.';
  } else {
    const logData = logSnap.data() as any;
    if (logData.amountCents !== 0 && logData.amount !== 0) {
      results.paymentLogAlreadyFixed = true;
      results.paymentLogCurrentAmount = logData.amount;
    } else {
      await setDoc(
        logRef,
        {
          amount: correctAmount,
          amountCents: correctAmountCents,
          updatedAt: serverTimestamp(),
          recordMutations: [
            ...(logData.recordMutations || []),
            {
              collection: 'paymentLogs',
              docId: PAYMENT_LOG_ID,
              field: 'amount',
              from: String(logData.amount ?? 0),
              to: String(correctAmount),
              at: Timestamp.now(),
              summary: `One-time data fix: corrected amount from 0 to ${correctAmount} (was written with ?? instead of || bug)`,
            },
          ],
        },
        { merge: true },
      );
      results.paymentLogFixed = true;
      results.paymentLogAmount = { from: logData.amount ?? 0, to: correctAmount };
      results.paymentLogAmountCents = { from: logData.amountCents ?? 0, to: correctAmountCents };
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
