'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowLeft, Receipt, Download } from 'lucide-react';
import Link from 'next/link';

interface PaymentDetails {
  amount: number;
  currency: string;
  status: string;
  invoiceNumber: string;
  clientName: string;
  paidAt: string;
}

function PaymentSuccessContent() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const sessionIdParam = searchParams.get('session_id');
    const invoiceIdParam = searchParams.get('invoice_id');
    
    if (sessionIdParam) {
      setSessionId(sessionIdParam);
    }
    
    if (invoiceIdParam) {
      setInvoiceId(invoiceIdParam);
      fetchPaymentDetails(invoiceIdParam);
    } else {
      setLoading(false);
    }
  }, [searchParams]);

  const fetchPaymentDetails = async (invoiceId: string) => {
    try {
      // Fetch invoice details from your backend
      const response = await fetch(`/api/invoices/${invoiceId}`);
      if (response.ok) {
        const invoice = await response.json();
        setPaymentDetails({
          amount: invoice.totalAmount,
          currency: 'USD',
          status: 'paid',
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName,
          paidAt: new Date().toLocaleDateString(),
        });
      } else {
        // Fallback to basic details if API fails
        setPaymentDetails({
          amount: 0,
          currency: 'USD',
          status: 'paid',
          invoiceNumber: 'Loading...',
          clientName: 'Loading...',
          paidAt: new Date().toLocaleDateString(),
        });
      }
    } catch (error) {
      console.error('Error fetching payment details:', error);
      setError('Unable to load payment details');
      // Set fallback details
      setPaymentDetails({
        amount: 0,
        currency: 'USD',
        status: 'paid',
        invoiceNumber: 'N/A',
        clientName: 'N/A',
        paidAt: new Date().toLocaleDateString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToPortal = () => {
    // Determine which portal to redirect to based on user role
    // For now, redirect to home page
    router.push('/');
  };

  const handleDownloadReceipt = () => {
    // Implement receipt download functionality
    console.log('Download receipt for session:', sessionId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Processing your payment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 p-3 rounded-full">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-green-600">
            Payment Successful!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Thank you for your payment. Your invoice has been processed successfully.
            </p>
            
            {sessionId && (
              <div className="bg-gray-50 p-3 rounded-lg mb-4">
                <p className="text-sm text-gray-500">
                  <strong>Transaction ID:</strong> {sessionId}
                </p>
              </div>
            )}
          </div>

          {paymentDetails && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Status</span>
                <span className="text-sm font-semibold text-green-600">Paid</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Amount</span>
                <span className="text-sm font-semibold text-gray-900">
                  ${paymentDetails.amount.toFixed(2)} {paymentDetails.currency}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Invoice</span>
                <span className="text-sm font-semibold text-gray-900">
                  {paymentDetails.invoiceNumber}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Date</span>
                <span className="text-sm font-semibold text-gray-900">
                  {paymentDetails.paidAt}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
              <p className="text-sm text-yellow-800">{error}</p>
            </div>
          )}

          <div className="pt-4 space-y-3">
            <Button 
              onClick={handleBackToPortal}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Portal
            </Button>
            
            <Button 
              variant="outline"
              onClick={handleDownloadReceipt}
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Receipt
            </Button>
            
            <Link href="/portal-login" className="block">
              <Button variant="outline" className="w-full">
                <Receipt className="h-4 w-4 mr-2" />
                View All Invoices
              </Button>
            </Link>
          </div>

          <div className="text-center pt-4">
            <p className="text-xs text-gray-500">
              A receipt has been sent to your email address.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentSuccess() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
