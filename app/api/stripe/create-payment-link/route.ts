import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function POST(request: NextRequest) {
  const db = await getServerDb();
  try {
    const body = await request.json();
    const { invoiceId, invoiceNumber: bodyInvoiceNumber, amount: bodyAmount, customerEmail: bodyCustomerEmail, clientName: bodyClientName, clientId: bodyClientId } = body;

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
    if (clientId) {
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (clientDoc.exists()) {
        const clientData = clientDoc.data();
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

    // If we already created a hosted invoice for this Firestore invoice, void
    // it before creating a fresh one — Stripe doesn't let two open invoices
    // for the same invoice item exist, and we want the latest amount.
    const previousStripeInvoiceId = (inv as any).stripeInvoiceId as string | undefined;
    if (previousStripeInvoiceId) {
      try {
        const prev = await stripe.invoices.retrieve(previousStripeInvoiceId);
        if (prev.status === 'open' || prev.status === 'draft') {
          await stripe.invoices.voidInvoice(previousStripeInvoiceId);
        }
      } catch (voidErr) {
        console.warn('[create-payment-link] Could not void previous Stripe invoice:', voidErr);
      }
    }

    const description = `Invoice ${invoiceNumber} — Payment for GroundOps Facility Maintenance services`;

    // 1) InvoiceItem — the line that will be billed.
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      amount: Math.round(resolvedAmount * 100),
      currency: 'usd',
      description,
      metadata: { invoiceId, invoiceNumber },
    });

    // 2) Create the Stripe Invoice. collection_method: 'send_invoice' produces
    //    the hosted invoice page (https://invoice.stripe.com/i/...).
    //    auto_advance: false — we finalize ourselves so we know when the URL
    //    is ready to return.
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

    if (!stripeInvoice.id) {
      throw new Error('Stripe did not return an invoice id');
    }

    // 3) Finalize → produces hosted_invoice_url.
    const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
    const hostedUrl = finalized.hosted_invoice_url;
    if (!hostedUrl) {
      throw new Error('Stripe invoice did not return a hosted URL');
    }

    // Always write the fresh hosted URL back to the Firestore invoice so
    // every consumer (admin detail page, client portal, emails) sees the
    // new link immediately. Without this, callers had to remember to
    // update the doc themselves and legacy checkout.stripe.com links
    // could be regenerated yet still saved as the old value.
    try {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        stripePaymentLink: hostedUrl,
        stripeInvoiceId: finalized.id,
        updatedAt: serverTimestamp(),
      });
    } catch (persistErr) {
      console.warn('[create-payment-link] Failed to persist hosted URL on invoice:', persistErr);
    }

    return NextResponse.json({
      paymentLink: hostedUrl,
      hostedInvoiceUrl: hostedUrl,
      stripeInvoiceId: finalized.id,
      // Retained for backwards compatibility with callers that previously
      // persisted the Checkout Session id; this is now the Stripe Invoice id.
      sessionId: finalized.id,
    });
  } catch (error: any) {
    console.error('Stripe error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create payment link' },
      { status: 500 }
    );
  }
}
