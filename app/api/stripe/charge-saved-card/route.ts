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
 * Charges the client's saved payment method (off-session) for the given invoice.
 * Used for variable recurring: invoice amounts differ each cycle.
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

    // Load invoice
    const invoiceDoc = await getDoc(doc(db, 'invoices', invoiceId));
    if (!invoiceDoc.exists()) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    const invoiceData = invoiceDoc.data();

    if (invoiceData.status === 'paid') {
      return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 });
    }

    // Load client
    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data();

    if (!clientData.stripeCustomerId || !clientData.defaultPaymentMethodId) {
      return NextResponse.json(
        { error: 'Client has no saved payment method. Please ask the client to save a card first.' },
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
    const amountCents = Math.round(totalNum * 100);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://groundopscos.vercel.app';

    // Detect if payment method is a bank account (ACH) or card
    const pmId = clientData.defaultPaymentMethodId;
    let isBankAccount = false;
    try {
      const pm = await stripe.paymentMethods.retrieve(pmId);
      isBankAccount = pm.type === 'us_bank_account';
    } catch { /* treat as card if lookup fails */ }

    // Build PaymentIntent params — bank accounts need mandate_data, cards use off_session
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

    const paymentIntent = await stripe.paymentIntents.create(
      piParams,
      { idempotencyKey: `charge-invoice-${invoiceId}-${Date.now()}` },
    );

    // Mark invoice as auto-charge attempted
    const existingTimeline = invoiceData.timeline || [];
    const existingSysInfo = invoiceData.systemInformation || {};

    if (paymentIntent.status === 'succeeded') {
      // Enrich SYNCHRONOUSLY so the admin sees the receipt URL + charge ID
      // + card brand/last4 + balance txn the moment the request returns.
      // Without this we'd depend on the webhook firing seconds later and
      // the admin would see "paid" but no receipt link until refresh.
      const enrichment = await enrichFromPaymentIntent(stripe, paymentIntent.id);

      const cardLabel = enrichment.fields.stripeCardBrand && enrichment.fields.stripeCardLast4
        ? `${enrichment.fields.stripeCardBrand} ···${enrichment.fields.stripeCardLast4}`
        : 'saved payment method';

      const paidEvent = createInvoiceTimelineEvent({
        type: 'paid',
        userId: 'system',
        userName: 'Auto-Pay System',
        userRole: 'system',
        details: `Auto-charged ${cardLabel}`,
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

      // Mark linked work order as completed
      if (invoiceData.workOrderId) {
        try {
          await updateDoc(doc(db, 'workOrders', invoiceData.workOrderId), {
            status: 'completed',
            completedAt: serverTimestamp(),
            autoCompletedFromInvoicePayment: true,
            updatedAt: serverTimestamp(),
          });
        } catch (woErr) {
          console.warn('Failed to update work order status after auto-charge:', woErr);
        }
      }

      return NextResponse.json({
        success: true,
        status: 'succeeded',
        paymentIntentId: paymentIntent.id,
        chargeId: enrichment.fields.stripeChargeId,
        receiptUrl: enrichment.fields.stripeReceiptUrl,
        cardLabel,
      });
    } else {
      // Requires action (3D Secure, etc.)
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
    console.error('Error charging saved card:', error);

    // Handle Stripe card errors — update invoice with failure info
    if (invoiceId) {
      try {
        await updateDoc(doc(db, 'invoices', invoiceId), {
          autoChargeAttempted: true,
          autoChargeStatus: 'failed',
          autoChargeError: error.message,
          updatedAt: serverTimestamp(),
        });
      } catch {}
    }

    return NextResponse.json(
      { error: error.message || 'Failed to charge saved card' },
      { status: 500 }
    );
  }
}
