'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';

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
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-yellow-100 p-3 rounded-full">
              <X className="h-8 w-8 text-yellow-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-yellow-600">
            Payment Cancelled
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Your payment was cancelled. No charges have been made to your account.
            </p>
            
            {invoiceId && (
              <div className="bg-gray-50 p-3 rounded-lg mb-4">
                <p className="text-sm text-gray-500">
                  <strong>Invoice ID:</strong> {invoiceId}
                </p>
              </div>
            )}
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-blue-800">
                  <strong>Need to complete your payment?</strong>
                </p>
                <p className="mt-1 text-sm text-blue-700">
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
            <p className="text-xs text-gray-500">
              Questions? Contact us at{' '}
              <a href="mailto:support@groundops.com" className="text-blue-600 hover:underline">
                support@groundops.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentCancelled() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <PaymentCancelledContent />
    </Suspense>
  );
}
