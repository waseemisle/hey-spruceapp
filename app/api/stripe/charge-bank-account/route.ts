import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Creates a Stripe Checkout Session for ACH bank payment.
 *
 * Stripe handles bank account verification (Financial Connections) automatically
 * during the checkout flow. The webhook handles marking the invoice as paid.
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
  try {
    const { invoiceId } = await request.json();

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
    }

    // ── Validate invoice ──
    const invoiceSnap = await getDoc(doc(db, 'invoices', invoiceId));
    if (!invoiceSnap.exists()) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    const inv = invoiceSnap.data();
    if (inv.status === 'paid') {
      return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 });
    }
    const amount = Number(inv.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid invoice amount' }, { status: 400 });
    }

    const clientId = inv.clientId || '';
    const clientEmail = inv.clientEmail || '';
    const clientName = inv.clientName || 'Client';
    const invoiceNumber = inv.invoiceNumber || '';

    // ── Ensure Stripe Customer ──
    let stripeCustomerId: string | undefined;
    if (clientId) {
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (clientDoc.exists()) {
        const clientData = clientDoc.data();
        stripeCustomerId = clientData.stripeCustomerId;
        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            email: clientData.email || clientEmail,
            name: clientData.fullName || clientName,
            metadata: { clientId },
          });
          stripeCustomerId = customer.id;
          await updateDoc(doc(db, 'clients', clientId), {
            stripeCustomerId,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://groundopscos.vercel.app';

    // ── Create Stripe Checkout Session with ACH ──
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['us_bank_account'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice ${invoiceNumber}`,
              description: 'Payment via ACH Bank Transfer — GroundOps',
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&invoice_id=${invoiceId}`,
      cancel_url: `${baseUrl}/pay-bank/${invoiceId}?cancelled=true`,
      metadata: {
        invoiceId,
        invoiceNumber,
        clientName,
        clientId,
        paymentType: 'ach_bank_transfer',
      },
      payment_intent_data: {
        metadata: {
          invoiceId,
          invoiceNumber,
          clientId,
          paymentType: 'ach_bank_transfer',
        },
      },
    };

    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
    } else if (clientEmail) {
      sessionParams.customer_email = clientEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({
      success: true,
      sessionUrl: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error('Error creating ACH checkout session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create bank payment session' },
      { status: 500 },
    );
  }
}
