import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createInvoiceTimelineEvent } from '@/lib/timeline';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Charges the client's saved payment method (off-session) for the given invoice.
 * Used for variable recurring: invoice amounts differ each cycle.
 */
export async function POST(request: NextRequest) {
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

    const amountCents = Math.round(invoiceData.totalAmount * 100);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://groundopscos.vercel.app';

    // Create off-session PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        customer: clientData.stripeCustomerId,
        payment_method: clientData.defaultPaymentMethodId,
        off_session: true,
        confirm: true,
        // return_url required by Stripe even for off-session payments
        // in case the card requires 3DS re-authentication
        return_url: `${baseUrl}/payment-success?invoice_id=${invoiceId}`,
        description: `Invoice ${invoiceData.invoiceNumber} — ${invoiceData.clientName}`,
        metadata: {
          invoiceId,
          invoiceNumber: invoiceData.invoiceNumber,
          clientId,
        },
      },
      {
        idempotencyKey: `charge-invoice-${invoiceId}`,
      }
    );

    // Mark invoice as auto-charge attempted
    const existingTimeline = invoiceData.timeline || [];
    const existingSysInfo = invoiceData.systemInformation || {};

    if (paymentIntent.status === 'succeeded') {
      const paidEvent = createInvoiceTimelineEvent({
        type: 'paid',
        userId: 'system',
        userName: 'Auto-Pay System',
        userRole: 'system',
        details: 'Payment charged automatically via saved card',
        metadata: { stripePaymentIntentId: paymentIntent.id },
      });

      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'paid',
        paidAt: serverTimestamp(),
        stripePaymentIntentId: paymentIntent.id,
        autoChargeAttempted: true,
        autoChargeStatus: 'succeeded',
        timeline: [...existingTimeline, paidEvent],
        systemInformation: {
          ...existingSysInfo,
          paidAt: Timestamp.now(),
          paidBy: { id: 'system', name: 'Auto-Pay System', timestamp: Timestamp.now() },
        },
        updatedAt: serverTimestamp(),
      });

      return NextResponse.json({ success: true, status: 'succeeded', paymentIntentId: paymentIntent.id });
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
