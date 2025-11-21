import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, invoiceNumber, amount, customerEmail, clientName } = await request.json();

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

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice ${invoiceNumber}`,
              description: `Payment for Hey Spruce Restaurant Cleaning & Maintenance services`,
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: customerEmail,
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://hey-spruce-appv2.vercel.app'}/payment-success?session_id={CHECKOUT_SESSION_ID}&invoice_id=${invoiceId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://hey-spruce-appv2.vercel.app'}/payment-cancelled?invoice_id=${invoiceId}`,
      metadata: {
        invoiceId,
        invoiceNumber,
        clientName,
      },
    });

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
