import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Sets a specific saved card as the default payment method for a client.
 * Body: { clientId, paymentMethodId }
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
  try {
    const { clientId, paymentMethodId } = await request.json();

    if (!clientId || !paymentMethodId) {
      return NextResponse.json({ error: 'Missing clientId or paymentMethodId' }, { status: 400 });
    }

    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data();

    const paymentMethods: any[] = clientData.paymentMethods || [];
    const targetCard = paymentMethods.find((m: any) => m.id === paymentMethodId);

    if (!targetCard) {
      return NextResponse.json({ error: 'Payment method not found on this client' }, { status: 404 });
    }

    // Block setting a not-yet-verified bank as default. Manual-ACH banks
    // aren't attached to the Stripe customer until micro-deposit
    // verification clears, so stripe.customers.update would otherwise
    // fail with the cryptic "customer does not have a payment method
    // with the ID pm_… The payment method must be attached to the
    // customer." Surface a clear next-step instead.
    if (
      targetCard.type === 'us_bank_account' &&
      targetCard.verificationStatus === 'pending'
    ) {
      return NextResponse.json(
        {
          error:
            'This bank account is still pending micro-deposit verification, so it cannot be set as the default payment method yet. Click "Verify Bank" on the row to enter the two test-deposit amounts first.',
        },
        { status: 422 }
      );
    }

    // Update isDefault flag in the array
    const updatedMethods = paymentMethods.map((m: any) => ({
      ...m,
      isDefault: m.id === paymentMethodId,
    }));

    // Update Stripe customer default — used as the fallback when an
    // invoice / subscription doesn't pin its own PM.
    if (clientData.stripeCustomerId) {
      await stripe.customers.update(clientData.stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    // Stripe has TWO defaults: customer.invoice_settings.default_payment_method
    // (above) and subscription.default_payment_method. The subscription
    // default takes priority for that subscription's invoices, so if
    // the client has an active sub, repoint it too — otherwise the
    // admin clicks "Set Default", expects auto-pay to use the new
    // card, but the next subscription invoice still charges the OLD
    // card. Silent expectation failure.
    const subFields: Record<string, any> = {};
    if (
      clientData.stripeSubscriptionId &&
      ['active', 'past_due', 'trialing', 'pending_cancellation'].includes(
        clientData.subscriptionStatus,
      )
    ) {
      try {
        await stripe.subscriptions.update(clientData.stripeSubscriptionId, {
          default_payment_method: paymentMethodId,
        });
        subFields.subscriptionPaymentMethodId = paymentMethodId;
      } catch (subErr) {
        console.warn('Failed to update subscription default after set-default:', subErr);
      }
    }

    await updateDoc(doc(db, 'clients', clientId), {
      paymentMethods: updatedMethods,
      defaultPaymentMethodId: paymentMethodId,
      savedCardLast4: targetCard.last4,
      savedCardBrand: targetCard.brand,
      savedCardExpMonth: targetCard.expMonth,
      savedCardExpYear: targetCard.expYear,
      ...subFields,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error setting default payment method:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to set default payment method' },
      { status: 500 }
    );
  }
}
