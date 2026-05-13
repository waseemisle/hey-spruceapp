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
    const stripeInvoiceId = inv.stripeInvoiceId as string | undefined;

    // ───────────────────────────────────────────────────────────────
    // Already-paid in Firestore but the linked Stripe Invoice is still
    // 'open'. This happens when an admin clicked Auto Charge under the
    // OLD code path that created a stand-alone PaymentIntent instead
    // of paying the existing Stripe Invoice — money was collected via
    // our PI, but the Stripe Invoice's own incomplete PI is sitting
    // there making the invoice look unpaid in the Stripe dashboard.
    // Fix it by marking the Stripe Invoice paid_out_of_band: tells
    // Stripe "yes we got paid, just not through this invoice's PI".
    // No double-charge — paid_out_of_band closes the invoice without
    // running a second charge.
    // ───────────────────────────────────────────────────────────────
    if (inv.status === 'paid') {
      if (stripeInvoiceId) {
        try {
          const stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId);
          // paid_out_of_band only works on open invoices; calling it on a draft
          // throws a Stripe error. Drafts would need finalization first — skip them.
          if (stripeInvoice.status === 'open') {
            const closed = await stripe.invoices.pay(stripeInvoiceId, { paid_out_of_band: true });
            const closeEvent = createInvoiceTimelineEvent({
              type: 'paid',
              userId: 'system',
              userName: 'Payment System (Reconcile)',
              userRole: 'system',
              details: `Reconciled orphan Stripe Invoice ${stripeInvoiceId} (was 'open', now closed paid_out_of_band) — money was already collected via PaymentIntent ${inv.stripePaymentIntentId || 'unknown'}.`,
              metadata: {
                stripeInvoiceId: closed.id,
                hostedInvoiceUrl: closed.hosted_invoice_url || '',
                source: 'reconcile_endpoint',
              },
            });
            await updateDoc(ref, {
              stripeInvoicePdf: closed.invoice_pdf || inv.stripeInvoicePdf || null,
              stripeHostedInvoiceUrl: closed.hosted_invoice_url || inv.stripeHostedInvoiceUrl || null,
              timeline: [...(inv.timeline || []), closeEvent],
              updatedAt: serverTimestamp(),
            });
            console.log(`[sync-invoice] Reconciled orphan Stripe Invoice ${stripeInvoiceId} → paid_out_of_band`);
            return NextResponse.json({
              ok: true,
              status: 'paid',
              synced: true,
              reconciled: true,
              reason: 'closed_orphan_stripe_invoice',
              stripeStatus: closed.status,
            });
          }
        } catch (recErr: any) {
          console.warn('[sync-invoice] Reverse-drift reconcile failed:', recErr?.message);
        }
      }
      return NextResponse.json({ ok: true, status: 'paid', synced: false });
    }

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

    // Self-heal: persist Stripe PDF / hosted URLs whenever Stripe has them
    // so portal "Download PDF" can proxy without waiting for webhooks.
    if (
      (stripeInvoice.invoice_pdf && inv.stripeInvoicePdf !== stripeInvoice.invoice_pdf) ||
      (stripeInvoice.hosted_invoice_url && inv.stripeHostedInvoiceUrl !== stripeInvoice.hosted_invoice_url)
    ) {
      try {
        await updateDoc(ref, {
          stripeInvoicePdf: stripeInvoice.invoice_pdf || inv.stripeInvoicePdf || null,
          stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url || inv.stripeHostedInvoiceUrl || null,
          updatedAt: serverTimestamp(),
        });
      } catch (patchErr) {
        console.warn('[sync-invoice] PDF URL patch failed:', patchErr);
      }
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
      // Clear any stale failed-auto-charge state so the invoice detail page
      // no longer shows "Card declined" after the Stripe invoice is paid
      // (either via Stripe retry or the client paying the hosted link).
      ...(inv.autoChargeAttempted ? { autoChargeStatus: 'succeeded', autoChargeError: null } : {}),
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
