import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

/**
 * Resolve the Stripe-hosted micro-deposit verification URL for a pending
 * us_bank_account PM. When an admin adds a bank via routing+account number
 * in the Add Payment Method modal, the SetupIntent ends up in
 * `requires_action` with next_action.verify_with_microdeposits — Stripe
 * sends two $0.01 deposits 1-2 business days later, and someone needs to
 * enter the amounts at the hosted_verification_url to flip the PM to
 * verified. This route surfaces that URL to the admin so they (or the
 * client, by forwarding the link) can finish verification.
 *
 * Body: { clientId, paymentMethodId }
 * Returns: { hostedVerificationUrl, status, alreadyVerified }
 */
export async function POST(request: NextRequest) {
  const db = await getServerDb();
  try {
    const { clientId, paymentMethodId } = await request.json();
    if (!clientId || !paymentMethodId) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, paymentMethodId' },
        { status: 400 }
      );
    }

    const clientSnap = await getDoc(doc(db, 'clients', clientId));
    if (!clientSnap.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientSnap.data();
    const methods: any[] = Array.isArray(clientData.paymentMethods) ? clientData.paymentMethods : [];
    const pmRow = methods.find((m: any) => m.id === paymentMethodId);
    if (!pmRow) {
      return NextResponse.json(
        { error: 'Payment method not found on this client.' },
        { status: 404 }
      );
    }

    // If the row is already marked verified, nothing to do.
    if (pmRow.verificationStatus === 'verified') {
      return NextResponse.json({ alreadyVerified: true, status: 'verified' });
    }

    const setupIntentId: string | undefined = pmRow.setupIntentId;
    if (!setupIntentId) {
      // Older bank rows added before we persisted setupIntentId. The admin
      // will need to re-add the bank; we surface a clear error so they
      // know the next step instead of staring at a stuck "Pending" pill.
      return NextResponse.json(
        {
          error:
            'This bank was added before verification links were tracked. Please remove it and re-add it from the Add Payment Method dialog — instant verification (Login with bank) is recommended to skip the 1-2 day micro-deposit step.',
        },
        { status: 422 }
      );
    }

    // Stripe stores hosted_verification_url under next_action when the
    // SetupIntent is in requires_action. Retrieve fresh — the URL doesn't
    // expire while the SetupIntent is open, but the SetupIntent's status
    // can change (verified/canceled), so we always look up the current
    // state instead of caching the URL.
    const si = await stripe.setupIntents.retrieve(setupIntentId);

    // Already verified — sync the Firestore row so the UI updates without
    // needing to wait for the webhook to trickle through.
    if (si.status === 'succeeded') {
      const updatedMethods = methods.map((m: any) =>
        m.id === paymentMethodId ? { ...m, verificationStatus: 'verified' } : m
      );
      await updateDoc(doc(db, 'clients', clientId), {
        paymentMethods: updatedMethods,
        updatedAt: serverTimestamp(),
      });
      return NextResponse.json({ alreadyVerified: true, status: 'verified', synced: true });
    }

    if (si.status !== 'requires_action') {
      return NextResponse.json(
        { error: `SetupIntent is in ${si.status} state — cannot verify.` },
        { status: 422 }
      );
    }

    const next = si.next_action as any;
    if (next?.type !== 'verify_with_microdeposits') {
      return NextResponse.json(
        { error: 'Bank account verification is not pending micro-deposits.' },
        { status: 422 }
      );
    }

    const hostedVerificationUrl: string | undefined =
      next.verify_with_microdeposits?.hosted_verification_url;

    if (!hostedVerificationUrl) {
      return NextResponse.json(
        { error: 'Stripe did not return a verification URL. Try again in a few minutes.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      hostedVerificationUrl,
      status: 'requires_action',
      arrivalDate: next.verify_with_microdeposits?.microdeposit_type === 'descriptor_code'
        ? null
        : next.verify_with_microdeposits?.arrival_date || null,
    });
  } catch (error: any) {
    console.error('[verify-bank-microdeposits] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load verification URL' },
      { status: 500 }
    );
  }
}
