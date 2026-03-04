'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import {
  CreditCard, ShieldCheck, Plus, Trash2, Zap, RefreshCw, CheckCircle, AlertCircle, Clock
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

export default function PaymentMethodsPage() {
  const { auth, db } = useFirebaseInstance();
  const searchParams = useSearchParams();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCard, setSavingCard] = useState(false);
  const [removingCard, setRemovingCard] = useState(false);

  // Show toast based on redirect from Stripe setup
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

  const handleSaveCard = async () => {
    if (!clientData) return;
    setSavingCard(true);
    try {
      const res = await fetch('/api/stripe/create-setup-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientData.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start card setup');
      // Redirect to Stripe hosted setup page
      window.location.href = data.url;
    } catch (error: any) {
      toast.error(error.message || 'Failed to start card setup');
      setSavingCard(false);
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
        body: JSON.stringify({ clientId: clientData.uid }),
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
            : 'bg-gray-50 border-gray-200 text-gray-600'
        }`}>
          {clientData?.autoPayEnabled ? (
            <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-500" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-gray-400" />
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" />
              Saved Payment Method
            </h2>

            {hasCard ? (
              <div className="space-y-4">
                {/* Card Display */}
                <div className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="h-10 w-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-md flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {getCardBrandLabel(clientData?.savedCardBrand)} •••• {clientData?.savedCardLast4}
                    </p>
                    <p className="text-sm text-gray-500">
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
                    onClick={handleSaveCard}
                    disabled={savingCard}
                    className="gap-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {savingCard ? 'Redirecting…' : 'Update Card'}
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
                  <p className="text-sm font-medium text-gray-900">No card saved</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Save a card to enable automatic invoice payments
                  </p>
                </div>
                <Button
                  onClick={handleSaveCard}
                  disabled={savingCard}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {savingCard ? 'Redirecting to secure page…' : 'Save a Card'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Fixed Recurring Subscription */}
        {hasSub && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Fixed Recurring Plan
              </h2>
              <div className="flex items-center gap-4 p-4 rounded-lg border border-amber-100 bg-amber-50">
                <Clock className="h-8 w-8 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900">
                    ${clientData?.subscriptionAmount?.toLocaleString()}/month
                  </p>
                  <p className="text-sm text-gray-600">
                    Billed on the {ordinalSuffix(clientData?.subscriptionBillingDay || 1)} of each month
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 mt-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle className="h-3 w-3" />
                    Active
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                This subscription is managed by GroundOps. Contact your account manager to make changes.
              </p>
            </div>
          </div>
        )}

        {/* Security Notice */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">Secure & PCI Compliant</p>
            <p className="text-xs text-blue-700 mt-1">
              Your card details are securely handled by Stripe and never stored on GroundOps servers.
              By saving a card, you authorize GroundOps to charge your card for invoices when they become due.
            </p>
          </div>
        </div>
      </PageContainer>
    </ClientLayout>
  );
}
