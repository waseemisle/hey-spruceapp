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

    // Attach to Stripe customer
    try {
      await stripe.paymentMethods.attach(pm.id, { customer: stripeCustomerId });
    } catch (e: any) {
      if (!e.message?.includes('already been attached')) throw e;
    }

    // Check for duplicates in Firestore
    const existingMethods: any[] = clientData.paymentMethods || [];
    if (existingMethods.some((m: any) => m.id === pm.id)) {
      return NextResponse.json({ success: true, message: 'Bank account already saved' });
    }

    const isFirstMethod = existingMethods.length === 0;

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
      isDefault: isFirstMethod,
      verificationStatus: 'pending',
      createdAt: Timestamp.now(),
    };

    const updatedMethods = [
      ...existingMethods.map((m: any) => ({ ...m, isDefault: isFirstMethod ? false : m.isDefault })),
      newBankAccount,
    ];

    const updateData: any = {
      paymentMethods: updatedMethods,
      updatedAt: serverTimestamp(),
    };

    if (isFirstMethod) {
      updateData.defaultPaymentMethodId = pm.id;
      updateData.autoPayEnabled = true;
    }

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
