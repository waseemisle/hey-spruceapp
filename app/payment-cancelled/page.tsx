'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';
import { AuthShell } from '@/components/ui/auth-shell';

function PaymentCancelledContent() {
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const invoiceIdParam = searchParams.get('invoice_id');
    if (invoiceIdParam) {
      setInvoiceId(invoiceIdParam);
    }
    setLoading(false);
  }, [searchParams]);

  const handleRetryPayment = () => {
    // Redirect back to invoices page to retry payment
    router.push('/client-portal/invoices');
  };

  const handleBackToPortal = () => {
    router.push('/client-portal/invoices');
  };

  if (loading) {
    return (
      <AuthShell title="Payment Cancelled" subtitle="Loading…" icon={X}>
        <div className="flex items-center justify-center py-10">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Payment Cancelled" subtitle="No charges were made." icon={X}>
      <Card className="w-full rounded-xl border-border/80 shadow-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
          <div className="rounded-full bg-amber-500/15 p-3 dark:bg-amber-500/20">
              <X className="h-8 w-8 text-amber-700 dark:text-amber-300" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Payment Cancelled
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">
              Your payment was cancelled. No charges have been made to your account.
            </p>
            
            {invoiceId && (
              <div className="bg-muted p-3 rounded-lg mb-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Invoice ID:</strong> {invoiceId}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm font-medium text-foreground">
                  <strong>Need to complete your payment?</strong>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can retry the payment at any time from your invoices page.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <Button 
              onClick={handleRetryPayment}
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Payment
            </Button>
            
            <Button 
              variant="outline"
              onClick={handleBackToPortal}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Portal
            </Button>
          </div>

          <div className="text-center pt-4">
            <p className="text-xs text-muted-foreground">
              Questions? Contact us at{' '}
              <a href="mailto:support@groundops.com" className="text-primary underline-offset-4 hover:underline">
                support@groundops.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

export default function PaymentCancelled() {
  return (
    <Suspense fallback={
      <AuthShell title="Payment Cancelled" subtitle="Loading…" icon={X}>
        <div className="text-center py-10">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </AuthShell>
    }>
      <PaymentCancelledContent />
    </Suspense>
  );
}
