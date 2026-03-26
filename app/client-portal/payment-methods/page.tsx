'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import {
  CreditCard, ShieldCheck, Plus, Trash2, Zap, RefreshCw,
  CheckCircle, AlertCircle, Clock, X, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';

interface ClientData {
  uid: string;
  fullName: string;
  email: string;
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
  savedCardLast4?: string;
  savedCardBrand?: string;
  savedCardExpMonth?: number;
  savedCardExpYear?: number;
  autoPayEnabled?: boolean;
  stripeSubscriptionId?: string;
  subscriptionAmount?: number;
  subscriptionBillingDay?: number;
  subscriptionStatus?: string;
}

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  jcb: 'JCB',
  diners: 'Diners Club',
  unionpay: 'UnionPay',
};

function getCardBrandLabel(brand?: string) {
  if (!brand) return 'Card';
  return CARD_BRAND_LABELS[brand.toLowerCase()] || brand;
}

function ordinalSuffix(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function PaymentMethodsContent() {
  const { auth, db } = useFirebaseInstance();
  const searchParams = useSearchParams();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [removingCard, setRemovingCard] = useState(false);

  // Inline card form state
  const [showCardModal, setShowCardModal] = useState(false);
  const [submittingCard, setSubmittingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const cardMountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<any>(null);
  const cardElementRef = useRef<any>(null);

  // Show toast based on redirect from Stripe setup (legacy flow)
  useEffect(() => {
    const setup = searchParams.get('setup');
    if (setup === 'success') {
      toast.success('Card saved successfully! Auto-pay is now enabled.');
    } else if (setup === 'cancelled') {
      toast.info('Card setup was cancelled.');
    }
  }, [searchParams]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) { setLoading(false); return; }

      const unsubDoc = onSnapshot(doc(db, 'clients', user.uid), (snap) => {
        if (snap.exists()) {
          setClientData({ uid: user.uid, ...snap.data() } as ClientData);
        }
        setLoading(false);
      });

      return () => unsubDoc();
    });

    return () => unsubAuth();
  }, [auth, db]);

  // Mount / unmount Stripe Card Element when modal opens/closes
  useEffect(() => {
    if (!showCardModal) {
      if (cardElementRef.current) {
        cardElementRef.current.destroy();
        cardElementRef.current = null;
      }
      setCardError(null);
      return;
    }

    const initStripe = async () => {
      try {
        if (!stripeRef.current) {
          const { loadStripe } = await import('@stripe/stripe-js');
          stripeRef.current = await loadStripe(
            process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
          );
        }

        if (stripeRef.current && cardMountRef.current && !cardElementRef.current) {
          const elements = stripeRef.current.elements();
          const cardEl = elements.create('card', {
            style: {
              base: {
                fontSize: '15px',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                color: '#111827',
                '::placeholder': { color: '#9ca3af' },
                iconColor: '#6b7280',
              },
              invalid: { color: '#dc2626', iconColor: '#dc2626' },
            },
            hidePostalCode: false,
          });
          cardEl.mount(cardMountRef.current);
          cardEl.on('change', (event: any) => {
            setCardError(event.error ? event.error.message : null);
          });
          cardElementRef.current = cardEl;
        }
      } catch (err: any) {
        toast.error('Failed to load card form. Please refresh and try again.');
      }
    };

    const timer = setTimeout(initStripe, 80);
    return () => clearTimeout(timer);
  }, [showCardModal]);

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientData || !stripeRef.current || !cardElementRef.current) return;

    setSubmittingCard(true);
    setCardError(null);
    try {
      // 1. Create a SetupIntent on the server
      const intentRes = await fetch('/api/stripe/create-setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientData.uid }),
      });
      const { clientSecret, error: intentError } = await intentRes.json();
      if (!intentRes.ok) throw new Error(intentError || 'Failed to initialize card setup');

      // 2. Confirm the card setup using Stripe Elements
      const { setupIntent, error: stripeError } = await stripeRef.current.confirmCardSetup(
        clientSecret,
        { payment_method: { card: cardElementRef.current } }
      );
      if (stripeError) throw new Error(stripeError.message);

      // 3. Save the confirmed payment method to Firestore
      const saveRes = await fetch('/api/stripe/save-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientData.uid,
          paymentMethodId: setupIntent.payment_method,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Failed to save card');

      toast.success('Card saved! Auto-pay is now enabled.');
      setShowCardModal(false);
    } catch (error: any) {
      setCardError(error.message || 'Failed to save card. Please try again.');
    } finally {
      setSubmittingCard(false);
    }
  };

  const handleRemoveCard = async () => {
    if (!clientData) return;
    if (!confirm('Are you sure you want to remove your saved card? Auto-pay will be disabled.')) return;
    setRemovingCard(true);
    try {
      const res = await fetch('/api/stripe/remove-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientData.uid, paymentMethodId: clientData.defaultPaymentMethodId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove card');
      toast.success('Card removed. Auto-pay has been disabled.');
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove card');
    } finally {
      setRemovingCard(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </ClientLayout>
    );
  }

  const hasCard = !!(clientData?.defaultPaymentMethodId && clientData?.savedCardLast4);
  const hasSub = !!(clientData?.stripeSubscriptionId && clientData?.subscriptionStatus === 'active');

  return (
    <ClientLayout>
      <PageContainer>
        <PageHeader
          title="Payment Methods"
          subtitle="Manage your saved card and automatic payments"
          icon={CreditCard}
          iconClassName="text-blue-600"
        />

        {/* Auto-Pay Status Banner */}
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${
          clientData?.autoPayEnabled
            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
            : 'bg-muted border-border text-muted-foreground'
        }`}>
          {clientData?.autoPayEnabled ? (
            <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-500" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          )}
          <div>
            <p className="font-semibold text-sm">
              Auto-Pay {clientData?.autoPayEnabled ? 'Enabled' : 'Disabled'}
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              {clientData?.autoPayEnabled
                ? 'Your invoices will be charged automatically using your saved card.'
                : 'Save a card to enable automatic invoice payments.'}
            </p>
          </div>
        </div>

        {/* Saved Card */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-5">
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" />
              Saved Payment Method
            </h2>

            {hasCard ? (
              <div className="space-y-4">
                {/* Card Display */}
                <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-muted">
                  <div className="h-10 w-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-md flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {getCardBrandLabel(clientData?.savedCardBrand)} •••• {clientData?.savedCardLast4}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Expires {clientData?.savedCardExpMonth?.toString().padStart(2, '0')}/{clientData?.savedCardExpYear}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle className="h-3 w-3" />
                    Default
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCardModal(true)}
                    className="gap-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Update Card
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveCard}
                    disabled={removingCard}
                    className="gap-2 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {removingCard ? 'Removing…' : 'Remove Card'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 space-y-3">
                <div className="mx-auto h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No card saved</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Save a card to enable automatic invoice payments
                  </p>
                </div>
                <Button
                  onClick={() => setShowCardModal(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Save a Card
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Fixed Recurring Subscription */}
        {hasSub && (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="p-5">
              <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Fixed Recurring Plan
              </h2>
              <div className="flex items-center gap-4 p-4 rounded-lg border border-amber-100 bg-amber-50">
                <Clock className="h-8 w-8 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">
                    ${clientData?.subscriptionAmount?.toLocaleString()}/month
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Billed on the {ordinalSuffix(clientData?.subscriptionBillingDay || 1)} of each month
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 mt-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle className="h-3 w-3" />
                    Active
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                This subscription is managed by GroundOps. Contact your account manager to make changes.
              </p>
            </div>
          </div>
        )}

        {/* Security Notice */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">Secure &amp; PCI Compliant</p>
            <p className="text-xs text-blue-700 mt-1">
              Your card details are securely handled by Stripe and never stored on GroundOps servers.
              By saving a card, you authorize GroundOps to charge your card for invoices when they become due.
            </p>
          </div>
        </div>
      </PageContainer>

      {/* ── Add Card Modal ──────────────────────────────────────────────────── */}
      {showCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !submittingCard && setShowCardModal(false)}
          />

          {/* Dialog */}
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">
                    {hasCard ? 'Update Card' : 'Add Card'}
                  </h3>
                  <p className="text-xs text-muted-foreground">Secured by Stripe</p>
                </div>
              </div>
              <button
                onClick={() => !submittingCard && setShowCardModal(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCardSubmit} className="p-6 space-y-5">
              {/* Stripe Card Element mount point */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
                  Card details
                </label>
                <div
                  ref={cardMountRef}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3.5 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-all min-h-[46px]"
                />
                {cardError && (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 flex-shrink-0" />
                    {cardError}
                  </p>
                )}
              </div>

              {/* Mobile hint */}
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                On mobile, tap the card number field to scan your physical card
              </p>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCardModal(false)}
                  disabled={submittingCard}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
                  disabled={submittingCard || !!cardError}
                >
                  {submittingCard ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Save Card
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Footer security note */}
            <div className="px-6 pb-5">
              <div className="flex items-center gap-2 rounded-lg bg-muted border border-border px-3 py-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  Your card number is encrypted by Stripe and never touches our servers.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </ClientLayout>
  );
}

export default function PaymentMethodsPage() {
  return (
    <Suspense
      fallback={
        <ClientLayout>
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        </ClientLayout>
      }
    >
      <PaymentMethodsContent />
    </Suspense>
  );
}
