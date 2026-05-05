'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, X, CreditCard, Building2, AlertCircle } from 'lucide-react';

interface AddPaymentMethodModalProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName?: string;
  clientEmail?: string;
  /** Called after the PM is saved on the server. Use to refetch payment methods. */
  onSuccess?: (label: string) => void;
}

/**
 * Single modal for adding a card OR a US bank account to a client.
 *
 * Uses Stripe's PaymentElement — the same widget customers see on
 * invoice.stripe.com — so admins get the modern tabbed Card / Bank
 * experience instead of the older inline CardElement-only form.
 *
 * Flow:
 *   1. POST /api/stripe/create-setup-intent → returns SetupIntent
 *      client_secret + customer + publishable key.
 *   2. Load Stripe.js, initialize Elements with the clientSecret (this
 *      makes PaymentElement auto-render the right PM tabs based on
 *      the SetupIntent's payment_method_types).
 *   3. On submit, stripe.confirmSetup({ elements, redirect: 'if_required' }).
 *      Cards complete inline; ACH may redirect to a Stripe-hosted page
 *      to finish micro-deposit verification.
 *   4. Inline-success path: POST /api/stripe/save-payment-method with
 *      the resulting PM id → that endpoint detaches duplicates,
 *      attaches to the customer, sets default if first, and writes the
 *      Firestore client.paymentMethods row with the right shape.
 *
 * Why this replaces the old AddCard / AddBank flow:
 *   - One UI for both PM types (admin doesn't have to pick the right
 *     button up front).
 *   - PaymentElement handles bank-account verification (instant via
 *     Financial Connections when supported, micro-deposits otherwise)
 *     instead of our hand-rolled routing-number form.
 *   - Visually matches what customers see when paying invoices, so
 *     admins immediately recognise the flow.
 */
export default function AddPaymentMethodModal({
  open,
  onClose,
  clientId,
  clientName,
  clientEmail,
  onSuccess,
}: AddPaymentMethodModalProps) {
  const elementContainerRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  const paymentElementRef = useRef<any>(null);

  const [initializing, setInitializing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);

  // Mount/unmount the Stripe Elements + PaymentElement when the modal
  // opens/closes. Tears down cleanly on close so re-opens get a fresh
  // SetupIntent (Stripe rejects re-using a confirmed SI).
  useEffect(() => {
    if (!open) {
      // Tear down on close
      if (paymentElementRef.current) {
        try { paymentElementRef.current.destroy(); } catch { /* noop */ }
        paymentElementRef.current = null;
      }
      elementsRef.current = null;
      setError(null);
      setSubmitting(false);
      setInitializing(true);
      return;
    }

    let cancelled = false;

    const init = async () => {
      try {
        setError(null);
        setInitializing(true);

        const intentRes = await fetch('/api/stripe/create-setup-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        });
        const intentData = await intentRes.json();
        if (!intentRes.ok) {
          throw new Error(intentData.error || 'Failed to start setup');
        }
        if (cancelled) return;

        setStripeCustomerId(intentData.stripeCustomerId || null);

        const publishableKey =
          intentData.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!publishableKey) throw new Error('Stripe publishable key not configured');

        if (!stripeRef.current) {
          const { loadStripe } = await import('@stripe/stripe-js');
          stripeRef.current = await loadStripe(publishableKey);
        }
        if (cancelled || !stripeRef.current) return;

        // Elements scoped to THIS SetupIntent — PaymentElement tabs are
        // driven by the SetupIntent's payment_method_types.
        const elements = stripeRef.current.elements({
          clientSecret: intentData.clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#0f172a',
              colorBackground: '#ffffff',
              colorText: '#0f172a',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              spacingUnit: '4px',
              borderRadius: '8px',
            },
          },
        });
        elementsRef.current = elements;

        // Suppress Stripe Link's "saved card" autofill banner. PaymentElement
        // detects a Link cookie in the admin's browser (e.g. waseemisle@gmail.com
        // signed into Link from another site) and prefills THAT person's saved
        // card across every client — wrong customer, wrong card. Pinning the
        // billing email to the actual client and turning off all wallets
        // (Link / Apple Pay / Google Pay) keeps the form focused on what the
        // admin is typing for THIS client. `link: 'never'` is accepted by
        // current stripe-js but isn't yet in the published TS types, hence the
        // cast.
        const paymentElement = elements.create('payment', {
          layout: { type: 'tabs', defaultCollapsed: false },
          defaultValues: {
            billingDetails: {
              name: clientName || '',
              email: clientEmail || '',
            },
          },
          wallets: {
            applePay: 'never',
            googlePay: 'never',
            link: 'never',
          } as any,
        });
        paymentElementRef.current = paymentElement;

        // Wait for the container to mount in the DOM (modal animates in).
        // Defer to next tick so React commit lands first.
        await new Promise<void>((resolve) => setTimeout(resolve, 80));
        if (cancelled || !elementContainerRef.current) return;
        paymentElement.mount(elementContainerRef.current);
        paymentElement.on('change', (event: any) => {
          setError(event?.error?.message || null);
        });
        setInitializing(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error('[add-pm-modal] init failed:', err);
        setError(err?.message || 'Failed to load payment form. Please try again.');
        setInitializing(false);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [open, clientId, clientName, clientEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripeRef.current || !elementsRef.current) return;
    setSubmitting(true);
    setError(null);

    try {
      // confirmSetup with redirect:'if_required' so cards complete inline
      // without any redirect flicker, while ACH that needs verification
      // gets redirected to Stripe's hosted page and then comes back here.
      const returnUrl = `${window.location.origin}/admin-portal/clients/${clientId}?pm_added=success`;
      const { error: confirmError, setupIntent } = await stripeRef.current.confirmSetup({
        elements: elementsRef.current,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      });

      if (confirmError) {
        throw new Error(confirmError.message || 'Payment method could not be saved');
      }

      // Inline success path (no redirect needed). The PM is already
      // attached to the customer by Stripe — we just need to mirror it
      // into Firestore client.paymentMethods so the UI shows it.
      const pmId =
        typeof setupIntent?.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent?.payment_method?.id;

      if (!pmId) {
        throw new Error('Payment method saved but pending verification. Refresh in a moment.');
      }

      // Manual ACH (routing + account number) returns SetupIntent in
      // `requires_action` with next_action `verify_with_microdeposits`.
      // The PaymentMethod exists but is NOT yet attached to the customer
      // — Stripe will attach it automatically once the customer enters
      // the deposit amounts. Tell the server it's a pending bank so it
      // saves the row without trying to attach (which would fail with
      // "must be verified before they can be attached").
      const isPendingMicrodeposits =
        setupIntent?.status === 'requires_action' &&
        (setupIntent as any)?.next_action?.type === 'verify_with_microdeposits';

      const saveRes = await fetch('/api/stripe/save-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          paymentMethodId: pmId,
          setupIntentId: setupIntent?.id,
          pendingMicrodeposits: isPendingMicrodeposits,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(saveData.error || 'Failed to save payment method');
      }

      onSuccess?.(saveData.label || 'Payment method');
      onClose();
    } catch (err: any) {
      console.error('[add-pm-modal] submit failed:', err);
      setError(err?.message || 'Failed to save payment method. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10 rounded-t-2xl">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <CreditCard className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Add Payment Method</h3>
              <p className="text-xs text-muted-foreground truncate">
                {clientName ? `For ${clientName}` : 'Card or US bank account'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
            <Building2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Same payment widget customers see on{' '}
              <code className="font-mono bg-card px-1 py-0.5 rounded text-[11px]">invoice.stripe.com</code>.
              Switch the tab to add a US bank account instead of a card. Saved methods are usable for one-click Auto Charge on future invoices.
            </span>
          </div>

          {/*
            ACH heads-up. SetupIntent is now configured with
            verification_method='instant', so the only ACH path Stripe
            offers in the bank tab is Financial Connections. The admin
            signs into the client's bank, Stripe verifies through the
            bank's API in real-time, and the PM is immediately
            chargeable — no micro-deposits, no Pending Verification
            state. Tiny number of banks (mostly small credit unions)
            don't support FC and will surface a clear error.
          */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Adding a US bank account?</strong> The bank tab will only offer <strong>"Login with bank"</strong> — sign into the client's bank inside Stripe's secure popup and the account is verified instantly. No micro-deposits, no 1-2 day wait. (A small number of banks don't support instant verification; adding those will fail with a clear error so you can use a card instead.)
            </span>
          </div>

          <div className="min-h-[260px]">
            {initializing && (
              <div className="flex items-center justify-center h-[200px]">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-xs text-muted-foreground">Loading secure payment form…</span>
              </div>
            )}
            {/* Stripe PaymentElement mounts here */}
            <div ref={elementContainerRef} className={initializing ? 'hidden' : ''} />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={initializing || submitting || !!error?.includes('Stripe publishable')}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Saving…
                </>
              ) : (
                'Save Payment Method'
              )}
            </Button>
          </div>

          {stripeCustomerId && (
            <p className="text-[10px] text-center text-muted-foreground font-mono">
              Stripe Customer · {stripeCustomerId}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
