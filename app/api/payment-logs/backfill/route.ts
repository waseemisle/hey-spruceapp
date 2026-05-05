import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';
import {
  recordPaymentEvent,
  fromCharge,
  fromInvoice,
  resolveInvoiceLinkage,
} from '@/lib/payment-logs';
import type { PaymentLog } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * One-shot backfill: pull the last N days of Stripe charges + invoices
 * and write them to paymentLogs so the admin Payment Logs page isn't
 * empty on day-one. Safe to re-run — every row is keyed on the Stripe
 * object id so re-runs merge instead of duplicate.
 *
 * Defaults to 90 days. Override via ?days=30 (or any positive integer).
 *
 * GET / POST both work. Production deployments should hit this once
 * after the phase-2/3 webhook + route changes ship.
 */
async function handle(request: NextRequest) {
  // Auth: accept either
  //   • CRON_SECRET bearer (so the operator can trigger via curl /
  //     Vercel cron without going through the admin portal), OR
  //   • a Firebase ID token that resolves to a row in `adminUsers`
  //     (the admin-portal "Backfill 90 days" button uses this path).
  // A generic Bearer is no longer enough — the previous gate let any
  // signed token through, which was too loose for an endpoint that
  // walks Stripe history.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const cronAuthorised = !!cronSecret && (
    authHeader === `Bearer ${cronSecret}` || authHeader === cronSecret
  );

  const db = await getServerDb();

  if (!cronAuthorised) {
    // Fall back to admin-bearer auth.
    const uid = await getBearerUid(request).catch(() => null);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      const adminSnap = await getDoc(doc(db, 'adminUsers', uid));
      if (!adminSnap.exists()) {
        return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
      }
    } catch (e: any) {
      return NextResponse.json({ error: 'Auth lookup failed: ' + (e?.message || 'unknown') }, { status: 500 });
    }
  }

  const daysParam = Number(request.nextUrl.searchParams.get('days') || '90');
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 90;
  const sinceUnix = Math.floor(Date.now() / 1000) - days * 86_400;

  // ── Charges (covers card + ACH, both succeeded + failed) ──────
  let chargesProcessed = 0;
  let chargesFailed = 0;
  let chargesCursor: string | undefined = undefined;
  for (let page = 0; page < 30; page++) { // safety cap on page count
    const list: Stripe.ApiList<Stripe.Charge> = await stripe.charges.list({
      created: { gte: sinceUnix },
      limit: 100,
      starting_after: chargesCursor,
      expand: ['data.balance_transaction'],
    });
    for (const ch of list.data) {
      try {
        const status: PaymentLog['status'] =
          ch.status === 'succeeded' ? 'succeeded'
          : ch.status === 'failed' ? 'failed'
          : ch.status === 'pending' ? 'processing'
          : 'pending';
        const partial = fromCharge(ch, status);
        if (!partial.linkedInvoiceId) {
          const linkage = await resolveInvoiceLinkage(db, {
            stripeChargeId: ch.id,
            stripePaymentIntentId: typeof ch.payment_intent === 'string' ? ch.payment_intent : undefined,
            metadata: ch.metadata as any,
          });
          Object.assign(partial, linkage);
        }
        await recordPaymentEvent({
          db,
          partial,
          source: 'backfill',
          rawEventType: 'backfill.charge',
          rawPayload: ch,
        });
        chargesProcessed++;
      } catch (e) {
        console.error('[payment-logs/backfill] charge failed:', ch.id, e);
        chargesFailed++;
      }
    }
    if (!list.has_more || list.data.length === 0) break;
    chargesCursor = list.data[list.data.length - 1].id;
  }

  // ── Invoices (covers hosted-invoice payments + subscription) ──
  let invoicesProcessed = 0;
  let invoicesFailed = 0;
  let invoicesCursor: string | undefined = undefined;
  for (let page = 0; page < 30; page++) {
    const list: Stripe.ApiList<Stripe.Invoice> = await stripe.invoices.list({
      created: { gte: sinceUnix },
      limit: 100,
      starting_after: invoicesCursor,
    });
    for (const inv of list.data) {
      // Only invoices that hit a money-relevant terminal state are
      // logged — drafts get skipped because they're not real payment
      // events yet.
      if (!['paid', 'open', 'uncollectible', 'void'].includes(inv.status || '')) continue;
      try {
        const status: PaymentLog['status'] =
          inv.status === 'paid' ? 'succeeded'
          : inv.status === 'uncollectible' ? 'failed'
          : inv.status === 'void' ? 'canceled'
          : 'pending';
        const partial = fromInvoice(inv, status);
        if (!partial.linkedInvoiceId) {
          const linkage = await resolveInvoiceLinkage(db, {
            stripeInvoiceId: inv.id,
            metadata: inv.metadata as any,
          });
          Object.assign(partial, linkage);
        }
        await recordPaymentEvent({
          db,
          partial,
          source: 'backfill',
          rawEventType: 'backfill.invoice',
          rawPayload: inv,
        });
        invoicesProcessed++;
      } catch (e) {
        console.error('[payment-logs/backfill] invoice failed:', inv.id, e);
        invoicesFailed++;
      }
    }
    if (!list.has_more || list.data.length === 0) break;
    invoicesCursor = list.data[list.data.length - 1].id;
  }

  return NextResponse.json({
    success: true,
    days,
    sinceUnix,
    sinceISO: new Date(sinceUnix * 1000).toISOString(),
    chargesProcessed,
    chargesFailed,
    invoicesProcessed,
    invoicesFailed,
  });
}

export async function GET(request: NextRequest) { return handle(request); }
export async function POST(request: NextRequest) { return handle(request); }
