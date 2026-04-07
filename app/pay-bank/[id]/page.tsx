'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Building2, CheckCircle, AlertCircle, Loader2, ArrowLeft, Shield, BanknoteIcon,
} from 'lucide-react';
import Link from 'next/link';
import Logo from '@/components/ui/logo';

interface InvoiceInfo {
  invoiceNumber: string;
  totalAmount: number;
  clientName: string;
  clientEmail: string;
  status: string;
}

export default function PayBankPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const invoiceId = params.id as string;
  const cancelled = searchParams.get('cancelled');

  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInvoice() {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}`);
        if (!res.ok) throw new Error('Invoice not found');
        const json = await res.json();
        const data = json.data || json;
        setInvoice({
          invoiceNumber: data.invoiceNumber || `INV-${invoiceId.slice(-6)}`,
          totalAmount: data.totalAmount || 0,
          clientName: data.clientName || '',
          clientEmail: data.clientEmail || '',
          status: data.status || '',
        });
      } catch {
        setInvoice(null);
      } finally {
        setLoading(false);
      }
    }
    if (invoiceId) fetchInvoice();
  }, [invoiceId]);

  const handlePayFromBank = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/charge-bank-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start bank payment');
        return;
      }
      // Redirect to Stripe Checkout (ACH flow)
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      } else {
        setError('No checkout URL returned');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start bank payment');
    } finally {
      setSubmitting(false);
    }
  };

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-lg font-semibold">Invoice Not Found</h2>
            <p className="text-sm text-muted-foreground">This invoice could not be loaded.</p>
            <Link href="/portal-login">
              <Button variant="outline" className="mt-2">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Portal
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invoice.status === 'paid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-semibold">Invoice Already Paid</h2>
            <p className="text-sm text-muted-foreground">
              Invoice {invoice.invoiceNumber} has already been paid.
            </p>
            <Link href="/portal-login">
              <Button variant="outline" className="mt-2">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Portal
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <Logo />
          <h1 className="text-2xl font-bold text-foreground mt-4">Pay from Bank Account</h1>
          <p className="text-muted-foreground text-sm">ACH Direct Debit via Stripe</p>
        </div>

        {/* Invoice Summary */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Invoice</p>
                <p className="font-semibold">{invoice.invoiceNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Amount Due</p>
                <p className="text-2xl font-bold text-foreground">{fmtMoney(invoice.totalAmount)}</p>
              </div>
            </div>
            {invoice.clientName && (
              <p className="text-xs text-muted-foreground mt-2">Client: {invoice.clientName}</p>
            )}
          </CardContent>
        </Card>

        {/* Cancelled notice */}
        {cancelled && (
          <Card className="border-yellow-300 bg-yellow-50">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-yellow-800">Payment was cancelled. You can try again below.</p>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="p-4 text-center space-y-2">
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setError(null)}>Dismiss</Button>
            </CardContent>
          </Card>
        )}

        {/* Pay Button */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Bank Account Payment</p>
                <p className="text-xs text-muted-foreground">Securely connect your bank via Stripe</p>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
              <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                You&apos;ll be redirected to Stripe&apos;s secure checkout to connect your bank account.
                ACH payments typically take 1-4 business days to process. No card processing fees.
              </span>
            </div>

            <Button
              onClick={handlePayFromBank}
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2 h-12 text-base"
            >
              {submitting ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Redirecting to Stripe...</>
              ) : (
                <><BanknoteIcon className="h-5 w-5" /> Pay {fmtMoney(invoice.totalAmount)} from Bank</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by <span className="font-medium">Stripe</span> &bull; Secure ACH Direct Debit
        </p>
      </div>
    </div>
  );
}
