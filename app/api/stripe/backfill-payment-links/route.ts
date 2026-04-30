import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { collection, getDocs, query, where, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, isUserAdmin } from '@/lib/api-verify-firebase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const LEGACY_HOST = 'checkout.stripe.com';
const HOSTED_HOST = 'invoice.stripe.com';
const BATCH_SIZE = 25;

/**
 * Replace any stored `https://checkout.stripe.com/...` payment links with
 * a fresh `https://invoice.stripe.com/i/...` hosted invoice URL.
 *
 * Admin only. Runs in batches; returns counts. Re-invoke until
 * { remaining: 0 } if there are more legacy links than BATCH_SIZE.
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();

  const uid = await getBearerUid(request);
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = await isUserAdmin(db, uid);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Pull every invoice with a payment link. Firestore can't query on
  // substring, so filter client-side after fetching status != 'paid'.
  // (Paid invoices keep their old link; clients won't click it again.)
  const allSnap = await getDocs(collection(db, 'invoices'));

  const legacyDocs = allSnap.docs.filter(d => {
    const data = d.data() as any;
    const link = (data.stripePaymentLink as string | undefined) || '';
    if (!link) return false;
    if (!link.includes(LEGACY_HOST)) return false;
    if (data.status === 'paid') return false;
    return true;
  });

  const totalFound = legacyDocs.length;
  const toProcess = legacyDocs.slice(0, BATCH_SIZE);
  const remaining = totalFound - toProcess.length;

  let processed = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const d of toProcess) {
    const data = d.data() as any;
    const invoiceId = d.id;
    try {
      const newLink = await regenerateHostedInvoiceUrl(db, invoiceId, data);
      if (newLink) {
        processed += 1;
      } else {
        failed += 1;
        errors.push({ id: invoiceId, error: 'No hosted URL returned' });
      }
    } catch (err: any) {
      failed += 1;
      errors.push({ id: invoiceId, error: err?.message || 'unknown' });
    }
  }

  return NextResponse.json({
    totalFound,
    processed,
    failed,
    remaining,
    errors,
  });
}

async function regenerateHostedInvoiceUrl(
  db: any,
  invoiceId: string,
  invoiceData: any,
): Promise<string | null> {
  const totalAmount = Number(invoiceData.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;

  const invoiceNumber = invoiceData.invoiceNumber || '';
  const clientId = (invoiceData.clientId as string | undefined) || '';
  const customerEmail = (invoiceData.clientEmail as string | undefined) || '';
  const clientName = (invoiceData.clientName as string | undefined) || 'Client';

  // Resolve / create a Stripe Customer.
  let stripeCustomerId: string | undefined;
  if (clientId) {
    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (clientDoc.exists()) {
      const clientData = clientDoc.data() as any;
      stripeCustomerId = clientData.stripeCustomerId;
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
    if (!customerEmail.trim()) return null;
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: clientName,
      metadata: { invoiceId, invoiceNumber },
    });
    stripeCustomerId = customer.id;
  }

  // Void the previous Stripe invoice if present and still open.
  const previousStripeInvoiceId = (invoiceData.stripeInvoiceId as string | undefined)
    || (invoiceData.stripeSessionId as string | undefined);
  if (previousStripeInvoiceId && previousStripeInvoiceId.startsWith('in_')) {
    try {
      const prev = await stripe.invoices.retrieve(previousStripeInvoiceId);
      if (prev.status === 'open' || prev.status === 'draft') {
        await stripe.invoices.voidInvoice(previousStripeInvoiceId);
      }
    } catch {
      // ignore
    }
  }

  const description = `Invoice ${invoiceNumber} — Payment for GroundOps Facility Maintenance services`;

  await stripe.invoiceItems.create({
    customer: stripeCustomerId,
    amount: Math.round(totalAmount * 100),
    currency: 'usd',
    description,
    metadata: { invoiceId, invoiceNumber },
  });

  const stripeInvoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    collection_method: 'send_invoice',
    days_until_due: 30,
    auto_advance: false,
    description,
    metadata: {
      invoiceId,
      invoiceNumber,
      clientName: clientName || '',
      clientId: clientId || '',
    },
  });

  if (!stripeInvoice.id) return null;
  const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
  const hostedUrl = finalized.hosted_invoice_url;
  if (!hostedUrl) return null;

  await updateDoc(doc(db, 'invoices', invoiceId), {
    stripePaymentLink: hostedUrl,
    stripeInvoiceId: finalized.id,
    updatedAt: serverTimestamp(),
  });

  return hostedUrl;
}
