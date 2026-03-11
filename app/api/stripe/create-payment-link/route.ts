import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, invoiceNumber, amount, customerEmail, clientName, clientId } = await request.json();

    // Validate required fields
    if (!invoiceId || !invoiceNumber || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: `Missing required fields: ${!invoiceId ? 'invoiceId ' : ''}${!invoiceNumber ? 'invoiceNumber ' : ''}${amount === undefined || amount === null ? 'amount' : ''}` },
        { status: 400 }
      );
    }

    // Validate amount is greater than 0
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
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
            unit_amount: Math.round(amount * 100),
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
