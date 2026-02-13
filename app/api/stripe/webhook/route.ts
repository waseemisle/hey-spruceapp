import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createInvoiceTimelineEvent } from '@/lib/timeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature')!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        await handleSuccessfulPayment(session);
        break;

      case 'checkout.session.expired':
        const expiredSession = event.data.object as Stripe.Checkout.Session;
        await handleExpiredPayment(expiredSession);
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object as Stripe.PaymentIntent;
        await handleFailedPayment(failedPayment);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  try {
    const invoiceId = session.metadata?.invoiceId;
    
    if (!invoiceId) {
      console.error('No invoice ID found in session metadata');
      return;
    }

    const invSnap = await getDoc(doc(db, 'invoices', invoiceId));
    const invData = invSnap.data();
    const existingTimeline = invData?.timeline || [];
    const existingSysInfo = invData?.systemInformation || {};
    const paidEvent = createInvoiceTimelineEvent({
      type: 'paid',
      userId: 'system',
      userName: 'Payment System',
      userRole: 'system',
      details: 'Payment received via Stripe',
      metadata: { stripeSessionId: session.id },
    });
    await updateDoc(doc(db, 'invoices', invoiceId), {
      status: 'paid',
      paidAt: serverTimestamp(),
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent,
      timeline: [...existingTimeline, paidEvent],
      systemInformation: {
        ...existingSysInfo,
        paidAt: Timestamp.now(),
        paidBy: {
          id: 'system',
          name: 'Payment System',
          timestamp: Timestamp.now(),
        },
      },
      updatedAt: serverTimestamp(),
    });

    console.log(`Invoice ${invoiceId} marked as paid`);
  } catch (error) {
    console.error('Error updating invoice status:', error);
  }
}

async function handleExpiredPayment(session: Stripe.Checkout.Session) {
  try {
    const invoiceId = session.metadata?.invoiceId;
    
    if (!invoiceId) {
      console.error('No invoice ID found in expired session metadata');
      return;
    }

    // Update invoice status to expired (optional)
    await updateDoc(doc(db, 'invoices', invoiceId), {
      status: 'expired',
      updatedAt: serverTimestamp(),
    });

    console.log(`Invoice ${invoiceId} marked as expired`);
  } catch (error) {
    console.error('Error updating expired invoice status:', error);
  }
}

async function handleFailedPayment(paymentIntent: Stripe.PaymentIntent) {
  try {
    // You can add logic here to handle failed payments
    // For example, send notification emails, update invoice status, etc.
    console.log(`Payment failed for intent: ${paymentIntent.id}`);
  } catch (error) {
    console.error('Error handling failed payment:', error);
  }
}
