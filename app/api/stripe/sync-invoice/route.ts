/**
 * POST /api/stripe/sync-invoice
 *
 * Reads an invoice's current state from Stripe and updates the matching
 * Firestore doc when they've drifted. Closes the gap when the Stripe
 * `invoice.paid` webhook didn't fire (mis-configured webhook secret,
 * dropped event, or temporary outage) — the admin and client invoice
 * detail pages call this on mount as a self-healing fallback.
 *
 * Body: { invoiceId: string }
 *
 * No auth required — the caller must already have a Firestore-level
 * permission to view the invoice. The endpoint only writes status/paid
 * metadata derived from Stripe; it does not mutate amounts, line items,
 * or anything user-editable. Read of the Firestore invoice happens via
 * `getServerDb()` (admin sync account), so the rule layer doesn't block
 * the read here either.
 */
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { createInvoiceTimelineEvent } from '@/lib/timeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const invoiceId = body?.invoiceId as string | undefined;
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId required' }, { status: 400 });
    }

    const db = await getServerDb();
    const ref = doc(db, 'invoices', invoiceId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    const inv = snap.data() as any;

    // Already paid in Firestore → nothing to do.
    if (inv.status === 'paid') {
      return NextResponse.json({ ok: true, status: 'paid', synced: false });
    }

    const stripeInvoiceId = inv.stripeInvoiceId as string | undefined;
    if (!stripeInvoiceId) {
      return NextResponse.json({ ok: true, synced: false, reason: 'no_stripe_invoice_id' });
    }

    let stripeInvoice: Stripe.Invoice;
    try {
      stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId);
    } catch (err: any) {
      console.error('[sync-invoice] Failed to retrieve Stripe invoice:', err?.message);
      return NextResponse.json({ ok: true, synced: false, reason: 'stripe_retrieve_failed' });
    }

    if (stripeInvoice.status !== 'paid') {
      return NextResponse.json({ ok: true, synced: false, stripeStatus: stripeInvoice.status });
    }

    // Stripe says paid but Firestore says not. Mirror the webhook handler so
    // the same fields land on the doc whether webhook or sync got there first.
    const existingTimeline = inv.timeline || [];
    const existingSysInfo = inv.systemInformation || {};

    const paidEvent = createInvoiceTimelineEvent({
      type: 'paid',
      userId: 'system',
      userName: 'Payment System (Sync)',
      userRole: 'system',
      details: 'Payment status synced from Stripe (webhook fallback)',
      metadata: {
        stripeInvoiceId: stripeInvoice.id,
        hostedInvoiceUrl: stripeInvoice.hosted_invoice_url || '',
        source: 'sync_endpoint',
      },
    });

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
      console.warn('[sync-invoice] Could not resolve charge receipt:', rcErr);
    }

    await updateDoc(ref, {
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
      timeline: [...existingTimeline, paidEvent],
      systemInformation: {
        ...existingSysInfo,
        paidAt: Timestamp.now(),
        paidBy: { id: 'system', name: 'Payment System (Sync)', timestamp: Timestamp.now() },
      },
      updatedAt: serverTimestamp(),
    });

    console.log(`[sync-invoice] Firestore invoice ${invoiceId} marked paid via sync (Stripe: ${stripeInvoice.id})`);

    return NextResponse.json({ ok: true, synced: true, stripeStatus: stripeInvoice.status });
  } catch (error: any) {
    console.error('[sync-invoice] error:', error);
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}
