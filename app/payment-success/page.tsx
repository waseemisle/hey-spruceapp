'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowLeft, Receipt, Download } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { InvoiceData } from '@/lib/pdf-generator';

interface PaymentDetails {
  amount: number;
  currency: string;
  status: string;
  invoiceNumber: string;
  clientName: string;
  paidAt: string;
}

function formatDueDateForPdf(value: unknown): string {
  if (value == null || value === '') return new Date().toLocaleDateString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? new Date().toLocaleDateString() : d.toLocaleDateString();
}

/** Build PDF payload from Firestore/API invoice fields (used for receipt download). */
function mapApiInvoiceToPdfData(
  inv: Record<string, unknown>,
  stripeSessionId: string | null
): InvoiceData {
  const total = Number(inv.totalAmount ?? inv.amount ?? 0) || 0;
  const rawItems = Array.isArray(inv.lineItems) ? inv.lineItems : [];
  let lineItems = rawItems.map((li: unknown) => {
    const row = li as Record<string, unknown>;
    const qty = Number(row.quantity) || 1;
    const unit = Number(row.unitPrice ?? row.rate ?? 0) || 0;
    const amount =
      Number(row.amount) || (Number.isFinite(qty * unit) ? qty * unit : 0);
    return {
      description: String(row.description ?? 'Item'),
      quantity: qty,
      unitPrice: unit,
      amount,
    };
  });
  if (lineItems.length === 0) {
    const title = inv.workOrderTitle ? String(inv.workOrderTitle) : 'Payment received';
    lineItems = [{ description: title, quantity: 1, unitPrice: total, amount: total }];
  }
  const subtotalFromLines = lineItems.reduce((s, li) => s + li.amount, 0);
  const subtotal = Number(inv.subtotal) || subtotalFromLines || total;
  const discountAmount = Number(inv.discountAmount) || 0;
  const baseNotes = inv.notes != null ? String(inv.notes) : '';
  const txnNote = stripeSessionId ? `Stripe checkout session: ${stripeSessionId}` : '';
  const notes = [baseNotes, txnNote].filter(Boolean).join('\n\n') || undefined;

  return {
    invoiceNumber: String(inv.invoiceNumber ?? 'RECEIPT'),
    clientName: String(inv.clientName ?? 'Customer'),
    clientEmail: String(inv.clientEmail ?? ''),
    workOrderName: inv.workOrderTitle ? String(inv.workOrderTitle) : undefined,
    vendorName: inv.subcontractorName ? String(inv.subcontractorName) : undefined,
    serviceDescription: inv.workOrderDescription
      ? String(inv.workOrderDescription)
      : undefined,
    lineItems,
    subtotal,
    discountAmount,
    totalAmount: total,
    dueDate: formatDueDateForPdf(inv.dueDate),
    notes,
    terms: inv.terms != null ? String(inv.terms) : undefined,
  };
}

function PaymentSuccessContent() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [invoiceRecord, setInvoiceRecord] = useState<Record<string, unknown> | null>(null);
  const [receiptDownloading, setReceiptDownloading] = useState(false);
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
      // Confirm payment status (fallback in case webhook was delayed)
      if (sessionIdParam) {
        fetch('/api/stripe/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdParam, invoiceId: invoiceIdParam }),
        }).catch(() => {}); // fire-and-forget
      }
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
        const result = await response.json();
        const invoice = result.data ?? result;
        setInvoiceRecord(invoice as Record<string, unknown>);
        setPaymentDetails({
          amount: Number(invoice.totalAmount ?? invoice.amount ?? 0) || 0,
          currency: 'USD',
          status: 'paid',
          invoiceNumber: invoice.invoiceNumber ?? 'N/A',
          clientName: invoice.clientName ?? 'N/A',
          paidAt: invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : new Date().toLocaleDateString(),
        });
      } else {
        setInvoiceRecord(null);
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
      setInvoiceRecord(null);
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

  const handleDownloadReceipt = async () => {
    if (!invoiceId) {
      toast.error('Receipt is unavailable without an invoice reference.');
      return;
    }
    setReceiptDownloading(true);
    try {
      let inv = invoiceRecord;
      if (!inv) {
        const response = await fetch(`/api/invoices/${invoiceId}`);
        if (!response.ok) throw new Error('Invoice could not be loaded');
        const result = await response.json();
        inv = (result.data ?? result) as Record<string, unknown>;
      }
      const { generateInvoicePDF } = await import('@/lib/pdf-generator');
      const payload = mapApiInvoiceToPdfData(inv, sessionId);
      const doc = generateInvoicePDF(payload);
      const safeName = String(payload.invoiceNumber).replace(/[^\w.-]+/g, '_');
      doc.save(`receipt_${safeName}.pdf`);
      toast.success('Receipt downloaded');
    } catch (e) {
      console.error('Receipt download failed:', e);
      toast.error('Could not download receipt. Use the copy from your email or try again later.');
    } finally {
      setReceiptDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Processing your payment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
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
            <p className="text-muted-foreground mb-4">
              Thank you for your payment. Your invoice has been processed successfully.
            </p>
            
            {sessionId && (
              <div className="mb-4 rounded-lg border border-border bg-muted/50 p-3 text-left">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Transaction ID
                </p>
                <p
                  className="select-all break-all font-mono text-[11px] leading-relaxed text-foreground sm:text-xs"
                  title={sessionId}
                >
                  {sessionId}
                </p>
              </div>
            )}
          </div>

          {paymentDetails && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <span className="text-sm font-medium text-foreground">Status</span>
                <span className="text-sm font-semibold text-green-600">Paid</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium text-foreground">Amount</span>
                <span className="text-sm font-semibold text-foreground">
                  ${(paymentDetails.amount || 0).toFixed(2)} {paymentDetails.currency}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium text-foreground">Invoice</span>
                <span className="text-sm font-semibold text-foreground">
                  {paymentDetails.invoiceNumber}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium text-foreground">Date</span>
                <span className="text-sm font-semibold text-foreground">
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
              disabled={!invoiceId || receiptDownloading}
            >
              <Download className="h-4 w-4 mr-2" />
              {receiptDownloading ? 'Preparing…' : 'Download Receipt'}
            </Button>
            
            <Link href="/portal-login" className="block">
              <Button variant="outline" className="w-full">
                <Receipt className="h-4 w-4 mr-2" />
                View All Invoices
              </Button>
            </Link>
          </div>

          <div className="text-center pt-4">
            <p className="text-xs text-muted-foreground">
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
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
