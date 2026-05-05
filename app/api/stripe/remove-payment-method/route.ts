import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Removes a specific payment method from a client.
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

    // Detach from Stripe — but if the PM is already detached, was never
    // attached, or no longer exists in Stripe at all, that's fine: the
    // user's intent is to get rid of it, and our Firestore record needs
    // to be cleaned up either way. Treat all of these as success and
    // continue to the Firestore update.
    try {
      await stripe.paymentMethods.detach(paymentMethodId);
    } catch (stripeErr: any) {
      const msg = String(stripeErr?.message || '');
      const code = stripeErr?.code;
      const benign =
        msg.includes('already been detached') ||
        msg.includes('not attached to a customer') ||
        code === 'resource_missing';
      if (!benign) {
        throw stripeErr;
      }
      console.warn(`[remove-pm] Skipping Stripe detach for ${paymentMethodId} — ${msg || code}; cleaning up Firestore only.`);
    }

    // Remove from paymentMethods array
    const existingMethods: any[] = clientData.paymentMethods || [];
    const updatedMethods = existingMethods.filter((m: any) => m.id !== paymentMethodId);

    const wasDefault = clientData.defaultPaymentMethodId === paymentMethodId;

    const updateData: Record<string, any> = {
      paymentMethods: updatedMethods,
      updatedAt: serverTimestamp(),
    };

    if (wasDefault) {
      // Promote the most recently added remaining card as default
      const newDefault = updatedMethods.length > 0 ? updatedMethods[updatedMethods.length - 1] : null;

      if (newDefault) {
        // Mark the new default in the array
        const finalMethods = updatedMethods.map((m: any) => ({
          ...m,
          isDefault: m.id === newDefault.id,
        }));
        updateData.paymentMethods = finalMethods;
        updateData.defaultPaymentMethodId = newDefault.id;
        updateData.savedCardLast4 = newDefault.last4;
        updateData.savedCardBrand = newDefault.brand;
        updateData.savedCardExpMonth = newDefault.expMonth;
        updateData.savedCardExpYear = newDefault.expYear;

        // Update Stripe customer default
        if (clientData.stripeCustomerId) {
          try {
            await stripe.customers.update(clientData.stripeCustomerId, {
              invoice_settings: { default_payment_method: newDefault.id },
            });
          } catch (e) {
            console.error('Failed to update Stripe customer default:', e);
          }
        }
      } else {
        // No cards left
        updateData.defaultPaymentMethodId = null;
        updateData.savedCardLast4 = null;
        updateData.savedCardBrand = null;
        updateData.savedCardExpMonth = null;
        updateData.savedCardExpYear = null;
        updateData.autoPayEnabled = false;

        // ALSO clear Stripe's customer default. Without this, Stripe's
        // `customer.invoice_settings.default_payment_method` keeps
        // pointing at the now-detached PM. The next
        // collection_method='charge_automatically' invoice we create
        // for that customer fails at finalize/pay time with
        // "payment_method_unattached" (the PM is gone but Stripe
        // inherits it as the default). Set it to null explicitly.
        if (clientData.stripeCustomerId) {
          try {
            await stripe.customers.update(clientData.stripeCustomerId, {
              invoice_settings: { default_payment_method: '' },
            });
          } catch (e) {
            console.warn('Failed to clear Stripe customer default after removing last PM:', e);
          }
        }
      }
    }

    // If the removed PM is pinned to an active subscription, the
    // subscription will keep trying to charge it on its next renewal
    // and fail with `payment_method_unattached`. Repoint the
    // subscription to whatever the new client default is (which we
    // just resolved above), or null it out if no PMs remain. Either
    // way Stripe's invoice flow then falls back to
    // `customer.invoice_settings.default_payment_method`, which we
    // also just updated.
    if (
      clientData.stripeSubscriptionId &&
      clientData.subscriptionPaymentMethodId === paymentMethodId
    ) {
      try {
        await stripe.subscriptions.update(clientData.stripeSubscriptionId, {
          default_payment_method: updateData.defaultPaymentMethodId || '',
        });
        updateData.subscriptionPaymentMethodId = updateData.defaultPaymentMethodId || null;
      } catch (e) {
        console.warn('Failed to repoint subscription default after removing PM:', e);
      }
    }

    await updateDoc(doc(db, 'clients', clientId), updateData);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing payment method:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove payment method' },
      { status: 500 }
    );
  }
}
