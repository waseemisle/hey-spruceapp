import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Creates a Stripe SetupIntent for inline card collection.
 * Body: { clientId }
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
  try {
    const { clientId } = await request.json();
    if (!clientId) {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
    }

    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data();

    // Ensure Stripe customer exists
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
    }

    // Test whether the stored customer ID is valid in the current Stripe mode.
    // If it was created in test mode and we're now in live mode (or vice versa),
    // create a fresh customer and persist the new ID.
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

    // SetupIntent that supports BOTH card and us_bank_account so the
    // PaymentElement on the client renders the same tabbed UX customers
    // see on invoice.stripe.com — admin picks Card or Bank, fills it in,
    // and we get one SetupIntent that lands a usable off-session PM
    // either way.
    //
    // For us_bank_account we force verification_method='instant' so the
    // ONLY path Stripe offers is Financial Connections ("Login with
    // bank"). That eliminates the 1-2 day micro-deposit wait that the
    // manual routing+account flow incurs — the customer/admin signs into
    // the bank inside Stripe's iframe, Stripe verifies the account
    // through the bank's API in real-time, and the SetupIntent comes
    // back 'succeeded' with a fully chargeable PM (no Pending
    // Verification state, no follow-up step).
    //
    // Trade-off — a small minority of US banks don't support Financial
    // Connections; for those, adding the bank fails with a clear error
    // and the admin must use a different bank or a card. Almost all
    // major US banks support FC. Prerequisite: Financial Connections
    // must be enabled on the Stripe account (Settings → Connect →
    // Financial Connections); default-on for most accounts.
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session',
      payment_method_types: ['card', 'us_bank_account'],
      payment_method_options: {
        us_bank_account: {
          verification_method: 'instant',
          financial_connections: {
            // 'payment_method' is the minimum permission needed to
            // create a chargeable PM. We deliberately don't request
            // 'transactions' / 'balances' / 'ownership' — those are
            // for richer integrations (cash-flow underwriting,
            // co-pilot views) and asking for more permissions than
            // we use just makes the consent screen scarier.
            permissions: ['payment_method'],
          },
        },
      },
      metadata: { clientId, source: 'admin_add_payment_method' },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      stripeCustomerId,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
    });
  } catch (error: any) {
    console.error('Error creating setup intent:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create setup intent' },
      { status: 500 }
    );
  }
}
