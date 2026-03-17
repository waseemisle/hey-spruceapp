import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Removes a specific payment method from a client.
 * Body: { clientId, paymentMethodId }
 */
export async function POST(request: NextRequest) {
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

    // Detach from Stripe (ignore if already detached)
    try {
      await stripe.paymentMethods.detach(paymentMethodId);
    } catch (stripeErr: any) {
      if (!stripeErr.message?.includes('already been detached')) {
        throw stripeErr;
      }
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
