import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Saves a confirmed payment method to the client's Firestore profile.
 *
 * Single endpoint for BOTH cards and us_bank_account, called after Stripe's
 * PaymentElement-based SetupIntent confirmation succeeds. Mirrors the same
 * PM types the customer can use on the invoice.stripe.com hosted page so
 * the admin "Add Payment Method" flow stays in lockstep with the customer
 * payment flow.
 *
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

    // Pull the full PaymentMethod from Stripe so we can store an accurate
    // display label regardless of card vs bank.
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const isBank = pm.type === 'us_bank_account';
    const isCard = pm.type === 'card';
    if (!isBank && !isCard) {
      return NextResponse.json(
        { error: `Unsupported payment method type: ${pm.type}` },
        { status: 400 }
      );
    }

    // Idempotency — if the PM is already on file, return success without
    // duplicating the row or clobbering the existing default flag.
    const existingMethods: any[] = clientData.paymentMethods || [];
    const alreadyExists = existingMethods.some((m: any) => m.id === paymentMethodId);
    if (alreadyExists) {
      return NextResponse.json({
        success: true,
        alreadySaved: true,
        message: `${isBank ? 'Bank account' : 'Card'} already saved`,
      });
    }

    // Attach to the Stripe customer if Stripe didn't already do it during
    // SetupIntent confirmation. Tolerates "already attached" + cross-mode
    // mismatches so we never block the Firestore write.
    if (clientData.stripeCustomerId && pm.customer !== clientData.stripeCustomerId) {
      try {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: clientData.stripeCustomerId,
        });
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (!msg.includes('already been attached') && e?.code !== 'resource_missing') {
          throw e;
        }
      }
    }

    // Build the saved-method record for client.paymentMethods. Both shapes
    // share id/type/last4/isDefault/createdAt/source so the UI can render
    // them with the same row component.
    const card = pm.card;
    const bank = pm.us_bank_account;

    // First PM becomes default automatically. Otherwise we honour any
    // existing default — admin can flip it via the Default button on the
    // saved-method row.
    const isFirstMethod = existingMethods.length === 0;
    const becomesDefault = isFirstMethod || !clientData.defaultPaymentMethodId;

    const newMethod = isCard
      ? {
          id: paymentMethodId,
          type: 'card' as const,
          last4: card?.last4 || '',
          brand: card?.brand || 'card',
          expMonth: card?.exp_month || null,
          expYear: card?.exp_year || null,
          isDefault: becomesDefault,
          verificationStatus: 'verified' as const,
          createdAt: Timestamp.now(),
          source: 'admin_added' as const,
        }
      : {
          id: paymentMethodId,
          type: 'us_bank_account' as const,
          last4: bank?.last4 || '',
          brand: bank?.bank_name || 'Bank',
          bankName: bank?.bank_name || '',
          routingNumber: bank?.routing_number || '',
          accountType: bank?.account_type || 'checking',
          accountHolderType: bank?.account_holder_type || 'individual',
          expMonth: null,
          expYear: null,
          isDefault: becomesDefault,
          // PaymentElement + Financial Connections returns verified PMs
          // immediately; manual ACH-by-routing might still be pending. We
          // optimistically mark verified here since the SetupIntent was
          // already confirmed; downstream charge calls will surface any
          // verification gap if it exists.
          verificationStatus: 'verified' as const,
          createdAt: Timestamp.now(),
          source: 'admin_added' as const,
        };

    // If this PM is becoming default, demote any other "isDefault" entries
    // so the array invariant holds (exactly one default at a time).
    const updatedMethods = becomesDefault
      ? [
          ...existingMethods.map((m: any) => ({ ...m, isDefault: false })),
          newMethod,
        ]
      : [...existingMethods, newMethod];

    const updatePayload: Record<string, any> = {
      paymentMethods: updatedMethods,
      updatedAt: serverTimestamp(),
    };

    if (becomesDefault) {
      updatePayload.defaultPaymentMethodId = paymentMethodId;
      updatePayload.autoPayEnabled = true;
      // Keep the legacy savedCard* fields populated for cards so older
      // code paths reading those fields still work. For bank PMs we leave
      // them untouched (they're card-specific).
      if (isCard) {
        updatePayload.savedCardLast4 = card?.last4 || '';
        updatePayload.savedCardBrand = card?.brand || '';
        updatePayload.savedCardExpMonth = card?.exp_month || null;
        updatePayload.savedCardExpYear = card?.exp_year || null;
      }
    }

    await updateDoc(doc(db, 'clients', clientId), updatePayload);

    // Mirror the default on the Stripe customer so future invoice creates
    // (collection_method=charge_automatically) auto-route to it without us
    // having to pass default_payment_method explicitly.
    if (becomesDefault && clientData.stripeCustomerId) {
      try {
        await stripe.customers.update(clientData.stripeCustomerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      } catch (e) {
        console.warn('[save-payment-method] Could not set default PM on Stripe customer:', e);
      }
    }

    return NextResponse.json({
      success: true,
      type: pm.type,
      label: isBank
        ? `${bank?.bank_name || 'Bank'} ···${bank?.last4 || ''}`
        : `${(card?.brand || 'card').replace(/^./, (c) => c.toUpperCase())} ···${card?.last4 || ''}`,
      isDefault: becomesDefault,
    });
  } catch (error: any) {
    console.error('[save-payment-method] Error:', error);
    const message = error?.message || 'Failed to save payment method';
    const code = error?.code ? ` [${error.code}]` : '';
    return NextResponse.json({ error: `${message}${code}` }, { status: 500 });
  }
}
