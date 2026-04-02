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

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://groundopscos.vercel.app';

    // If clientId is provided, use/create a Stripe Customer so the card can be saved
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

    // Build session params — if we have a customer, save the card for future off-session charges
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice ${invoiceNumber}`,
              description: `Payment for GroundOps Facility Maintenance services`,
            },
            unit_amount: Math.round(resolvedAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&invoice_id=${invoiceId}`,
      cancel_url: `${baseUrl}/payment-cancelled?invoice_id=${invoiceId}`,
      metadata: {
        invoiceId,
        invoiceNumber,
        clientName: clientName || '',
        clientId: clientId || '',
      },
    };

    if (stripeCustomerId) {
      // Link to Stripe customer and save card for future auto-charges
      sessionParams.customer = stripeCustomerId;
      sessionParams.payment_intent_data = {
        setup_future_usage: 'off_session',
        metadata: { invoiceId, clientId: clientId || '' },
      };
    } else {
      if (!customerEmail?.trim()) {
        return NextResponse.json(
          { error: 'Invoice has no client email; cannot create guest Checkout link.' },
          { status: 400 }
        );
      }
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({
      sessionId: session.id,
      paymentLink: session.url,
    });
  } catch (error: any) {
    console.error('Stripe error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create payment link' },
      { status: 500 }
    );
  }
}
