'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const router = useRouter();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const [holderName, setHolderName] = useState('');
  const [holderType, setHolderType] = useState<'individual' | 'company'>('individual');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

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
        setHolderName(data.clientName || '');
      } catch {
        setInvoice(null);
      } finally {
        setLoading(false);
      }
    }
    if (invoiceId) fetchInvoice();
  }, [invoiceId]);

  const handleSubmit = async () => {
    if (!routingNumber || routingNumber.length !== 9) {
      setResult({ success: false, message: 'Please enter a valid 9-digit routing number' });
      return;
    }
    if (!accountNumber || accountNumber.length < 4) {
      setResult({ success: false, message: 'Please enter a valid account number' });
      return;
    }
    if (!holderName.trim()) {
      setResult({ success: false, message: 'Please enter the account holder name' });
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/stripe/charge-bank-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          routingNumber,
          accountNumber,
          accountHolderType: holderType,
          accountType,
          holderName: holderName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, message: data.error || 'Payment failed' });
        return;
      }
      setResult({ success: true, message: data.message });
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Payment failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const fmtMoney = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <Logo />
          <h1 className="text-2xl font-bold text-foreground mt-4">Pay from Bank Account</h1>
          <p className="text-muted-foreground text-sm">ACH Direct Debit via Stripe</p>
        </div>

        {/* Invoice Summary */}
        <Card>
          <CardContent className="p-4">
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

        {/* Result */}
        {result && (
          <Card className={result.success ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}>
            <CardContent className="p-6 text-center space-y-3">
              {result.success ? (
                <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
              ) : (
                <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
              )}
              <p className={`font-semibold ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                {result.success ? 'Payment Submitted!' : 'Payment Failed'}
              </p>
              <p className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                {result.message}
              </p>
              {result.success && (
                <div className="pt-2 space-y-2">
                  <Link href="/portal-login">
                    <Button className="w-full">Back to Portal</Button>
                  </Link>
                </div>
              )}
              {!result.success && (
                <Button variant="outline" onClick={() => setResult(null)} className="mt-2">
                  Try Again
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bank Account Form */}
        {!result?.success && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5" />
                Add Bank Account
              </CardTitle>
              <p className="text-xs text-muted-foreground">ACH Direct Debit via Stripe</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Account Holder Name */}
              <div>
                <Label>Account Holder Name</Label>
                <Input
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="Full name on account"
                  className="mt-1"
                />
              </div>

              {/* Holder Type */}
              <div>
                <Label>Holder Type</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button"
                    variant={holderType === 'individual' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setHolderType('individual')}
                    className="flex-1"
                  >
                    Individual
                  </Button>
                  <Button
                    type="button"
                    variant={holderType === 'company' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setHolderType('company')}
                    className="flex-1"
                  >
                    Business
                  </Button>
                </div>
              </div>

              {/* Account Type */}
              <div>
                <Label>Account Type</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button"
                    variant={accountType === 'checking' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAccountType('checking')}
                    className="flex-1"
                  >
                    Checking
                  </Button>
                  <Button
                    type="button"
                    variant={accountType === 'savings' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAccountType('savings')}
                    className="flex-1"
                  >
                    Savings
                  </Button>
                </div>
              </div>

              {/* Routing Number */}
              <div>
                <Label>Routing Number</Label>
                <Input
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="9-digit routing number"
                  maxLength={9}
                  className="mt-1 font-mono"
                />
                {routingNumber && routingNumber.length !== 9 && (
                  <p className="text-xs text-yellow-600 mt-1">Must be exactly 9 digits</p>
                )}
              </div>

              {/* Account Number */}
              <div>
                <Label>Account Number</Label>
                <Input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="Account number"
                  className="mt-1 font-mono"
                  type="password"
                />
              </div>

              {/* Security note */}
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
                <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Your bank details are transmitted securely to Stripe and never stored on our servers.
                  ACH payments typically take 1-4 business days to process.
                </span>
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={submitting || !routingNumber || routingNumber.length !== 9 || !accountNumber || !holderName.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2 h-12 text-base"
              >
                {submitting ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</>
                ) : (
                  <><BanknoteIcon className="h-5 w-5" /> Pay {fmtMoney(invoice.totalAmount)}</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by <span className="font-medium">Stripe</span> &bull; Secure ACH Direct Debit
        </p>
      </div>
    </div>
  );
}
