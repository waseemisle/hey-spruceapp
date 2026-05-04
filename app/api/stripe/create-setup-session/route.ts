import { NextResponse } from 'next/server';

/**
 * DEPRECATED — was the legacy Stripe Checkout-based "setup" flow for
 * collecting payment methods. Replaced by the PaymentElement modal at
 * components/billing/add-payment-method-modal.tsx, which uses the same
 * widget customers see on invoice.stripe.com.
 *
 * The new flow:
 *   1. POST /api/stripe/create-setup-intent  → returns SetupIntent
 *      client_secret + customer + publishable key.
 *   2. Stripe.js PaymentElement mounted with the clientSecret renders
 *      Card and US bank account tabs.
 *   3. stripe.confirmSetup() inline (no redirect for cards).
 *   4. POST /api/stripe/save-payment-method  → mirrors the PM into
 *      Firestore client.paymentMethods, sets default if first.
 *
 * Kept as a 410 Gone responder so any cached client bundle that still
 * fetches this route gets a clear error instead of a silent Checkout
 * redirect that won't auto-save the PM.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'This endpoint is deprecated. The admin Add Payment Method flow now uses the PaymentElement-based SetupIntent at /api/stripe/create-setup-intent. Reload the admin portal to pick up the new flow.',
      replacedBy: '/api/stripe/create-setup-intent',
    },
    { status: 410 },
  );
}
