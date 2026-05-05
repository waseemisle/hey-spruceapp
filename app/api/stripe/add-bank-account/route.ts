import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Adds a US bank account (ACH) payment method to a client.
 * Body: { clientId, routingNumber, accountNumber, accountHolderType, accountType, holderName }
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
  try {
    const { clientId, routingNumber, accountNumber, accountHolderType, accountType, holderName } =
      await request.json();

    if (!clientId || !routingNumber || !accountNumber || !holderName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data();

    // Ensure live-mode Stripe customer exists
    let stripeCustomerId = clientData.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: clientData.email,
        name: clientData.fullName,
        metadata: { clientId, companyName: clientData.companyName || '' },
      });
      stripeCustomerId = customer.id;
      await updateDoc(doc(db, 'clients', clientId), {
        stripeCustomerId,
        updatedAt: serverTimestamp(),
      });
    } else {
      try {
        await stripe.customers.retrieve(stripeCustomerId);
      } catch (e: any) {
        if (e?.code === 'resource_missing') {
          const customer = await stripe.customers.create({
            email: clientData.email,
            name: clientData.fullName,
            metadata: { clientId, companyName: clientData.companyName || '' },
          });
          stripeCustomerId = customer.id;
          await updateDoc(doc(db, 'clients', clientId), {
            stripeCustomerId,
            updatedAt: serverTimestamp(),
          });
        } else {
          throw e;
        }
      }
    }

    // Create the us_bank_account payment method
    const pm = await stripe.paymentMethods.create({
      type: 'us_bank_account',
      us_bank_account: {
        account_holder_type: accountHolderType || 'individual',
        account_number: accountNumber,
        routing_number: routingNumber,
        account_type: accountType || 'checking',
      } as any,
      billing_details: {
        name: holderName,
        email: clientData.email,
      },
    });

    const bankAccount = pm.us_bank_account as any;

    // us_bank_account PMs cannot be attached directly — Stripe requires going
    // through a SetupIntent with a mandate to satisfy the "must be
    // verified before they can be attached" rule.
    //
    // The admin entered the routing/account number on the customer's
    // behalf with verbal/written authorisation, so the mandate
    // acceptance is OFFLINE. Stripe's API requires `accepted_at` for
    // offline mandates (a Unix timestamp); the previous version omitted
    // it and Stripe was inconsistent about whether it accepted the
    // call. Set it explicitly to "now" — the moment the admin clicked
    // Add — and persist it so audits can prove when authorisation
    // happened.
    const mandateAcceptedAt = Math.floor(Date.now() / 1000);
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method: pm.id,
      payment_method_types: ['us_bank_account'],
      // Pin usage so this PM is chargeable off-session for future
      // auto-pay invoices (Stripe defaults to on_session for setup
      // intents that don't say otherwise, which makes the PM unusable
      // for cron-triggered charges).
      usage: 'off_session',
    });

    await (stripe.setupIntents.confirm as any)(setupIntent.id, {
      mandate_data: {
        customer_acceptance: {
          type: 'offline',
          accepted_at: mandateAcceptedAt,
        },
      },
    });

    // Check for duplicates in Firestore
    const existingMethods: any[] = clientData.paymentMethods || [];
    if (existingMethods.some((m: any) => m.id === pm.id)) {
      return NextResponse.json({ success: true, message: 'Bank account already saved' });
    }

    const newBankAccount = {
      id: pm.id,
      type: 'us_bank_account',
      last4: bankAccount?.last4 || accountNumber.slice(-4),
      brand: bankAccount?.bank_name || 'Bank Account',
      bankName: bankAccount?.bank_name || '',
      routingNumber: routingNumber,
      accountHolderType: accountHolderType || 'individual',
      accountType: accountType || 'checking',
      expMonth: null,
      expYear: null,
      // Manual-ACH banks are never default at add-time — they need
      // micro-deposit verification first. The /verify-bank-microdeposits
      // route promotes them to verified once Stripe confirms the
      // amounts; only then should set-default-payment-method become
      // available. Setting a *pending* PM as default would crash the
      // next charge_automatically invoice with payment_method_unattached
      // (the PM isn't actually attached to the customer yet).
      isDefault: false,
      verificationStatus: 'pending',
      // Persist the SetupIntent id so /verify-bank-microdeposits can
      // resolve the hosted verification URL later — without this, the
      // verify route rejects the row with the "added before
      // verification links were tracked" error.
      setupIntentId: setupIntent.id,
      mandateAcceptedAt: Timestamp.fromMillis(mandateAcceptedAt * 1000),
      createdAt: Timestamp.now(),
      source: 'admin_added' as const,
    };

    // Don't reshuffle existing defaults — the new bank is pending
    // verification and can't be charged yet. Other methods (cards,
    // already-verified banks) keep their isDefault flag so the
    // client's saved-card auto-pay continues to work while the new
    // bank is being verified.
    const updatedMethods = [...existingMethods, newBankAccount];

    const updateData: any = {
      paymentMethods: updatedMethods,
      updatedAt: serverTimestamp(),
    };
    // Note: do NOT set defaultPaymentMethodId or autoPayEnabled here.
    // The verify-bank-microdeposits route is responsible for
    // promoting a verified bank to default if the admin chooses.

    await updateDoc(doc(db, 'clients', clientId), updateData);

    return NextResponse.json({
      success: true,
      bankName: bankAccount?.bank_name || '',
      last4: newBankAccount.last4,
    });
  } catch (error: any) {
    console.error('Error adding bank account:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add bank account' },
      { status: 500 }
    );
  }
}
