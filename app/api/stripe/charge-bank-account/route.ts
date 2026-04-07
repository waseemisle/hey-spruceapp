import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Charges an invoice via ACH (US bank account) direct debit.
 *
 * 1. Validates the invoice exists and is unpaid
 * 2. Ensures a Stripe Customer exists for the client
 * 3. Creates a us_bank_account PaymentMethod
 * 4. Attaches it via SetupIntent with offline mandate
 * 5. Creates and confirms a PaymentIntent to charge the bank
 * 6. Updates invoice to paid + saves bank method on client
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
  try {
    const {
      invoiceId,
      routingNumber,
      accountNumber,
      accountHolderType = 'individual',
      accountType = 'checking',
      holderName,
    } = await request.json();

    if (!invoiceId || !routingNumber || !accountNumber || !holderName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
    const clientName = inv.clientName || holderName;

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
      // Create a guest customer
      const customer = await stripe.customers.create({
        email: clientEmail,
        name: clientName,
        metadata: { clientId: clientId || '', source: 'ach_bank_payment' },
      });
      stripeCustomerId = customer.id;
    }

    // ── Create US bank account PaymentMethod ──
    const pm = await stripe.paymentMethods.create({
      type: 'us_bank_account',
      us_bank_account: {
        account_holder_type: accountHolderType,
        account_number: accountNumber,
        routing_number: routingNumber,
        account_type: accountType,
      } as any,
      billing_details: {
        name: holderName,
        email: clientEmail || undefined,
      },
    });

    // ── Attach PaymentMethod to Customer ──
    await stripe.paymentMethods.attach(pm.id, { customer: stripeCustomerId });

    // ── Create and confirm PaymentIntent with mandate ──
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://groundopscos.vercel.app';
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: pm.id,
      payment_method_types: ['us_bank_account'],
      confirm: true,
      mandate_data: {
        customer_acceptance: {
          type: 'offline',
        },
      } as any,
      metadata: {
        invoiceId,
        invoiceNumber: inv.invoiceNumber || '',
        clientId: clientId || '',
        paymentType: 'ach_bank_transfer',
      },
      return_url: `${baseUrl}/payment-success?invoice_id=${invoiceId}`,
    });

    const bankAccount = pm.us_bank_account as any;
    const bankLast4 = bankAccount?.last4 || accountNumber.slice(-4);
    const bankName = bankAccount?.bank_name || 'Bank Account';

    // ACH payments are typically "processing" initially, not instant like cards
    const isSucceeded = paymentIntent.status === 'succeeded';
    const isProcessing = paymentIntent.status === 'processing';

    // ── Update invoice ──
    const invoiceUpdate: any = {
      stripePaymentIntentId: paymentIntent.id,
      updatedAt: serverTimestamp(),
    };

    if (isSucceeded) {
      invoiceUpdate.status = 'paid';
      invoiceUpdate.paidAt = serverTimestamp();
    } else if (isProcessing) {
      // ACH takes 1-4 business days; mark as processing
      invoiceUpdate.achPaymentStatus = 'processing';
    }

    // Add timeline entry
    const timelineEntry = {
      id: `ach_payment_${Date.now()}`,
      timestamp: new Date(),
      type: isSucceeded ? 'paid' : 'payment_initiated',
      details: isSucceeded
        ? `Payment of $${amount.toFixed(2)} received via ACH bank transfer (${bankName} ••${bankLast4})`
        : `ACH bank payment of $${amount.toFixed(2)} initiated (${bankName} ••${bankLast4}) — processing`,
      metadata: {
        paymentMethod: 'ach_bank_transfer',
        bankLast4,
        bankName,
        stripePaymentIntentId: paymentIntent.id,
      },
    };
    invoiceUpdate[`timeline`] = [...(inv.timeline || []), timelineEntry];

    await updateDoc(doc(db, 'invoices', invoiceId), invoiceUpdate);

    // ── Save bank account to client's payment methods ──
    if (clientId) {
      try {
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        if (clientDoc.exists()) {
          const clientData = clientDoc.data();
          const existingMethods: any[] = clientData.paymentMethods || [];
          if (!existingMethods.some((m: any) => m.id === pm.id)) {
            const newBankMethod = {
              id: pm.id,
              type: 'us_bank_account',
              last4: bankLast4,
              brand: bankName,
              bankName,
              routingNumber,
              accountHolderType,
              accountType,
              expMonth: null,
              expYear: null,
              isDefault: existingMethods.length === 0,
              verificationStatus: 'verified',
              createdAt: Timestamp.now(),
            };
            await updateDoc(doc(db, 'clients', clientId), {
              paymentMethods: [...existingMethods, newBankMethod],
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (e) {
        console.error('Failed to save bank method to client:', e);
      }
    }

    return NextResponse.json({
      success: true,
      status: paymentIntent.status,
      paymentIntentId: paymentIntent.id,
      bankLast4,
      bankName,
      message: isSucceeded
        ? 'Payment completed successfully'
        : 'ACH payment initiated — funds will be transferred in 1-4 business days',
    });
  } catch (error: any) {
    console.error('Error charging bank account:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process bank payment' },
      { status: 500 },
    );
  }
}
