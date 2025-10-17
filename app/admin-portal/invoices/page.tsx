'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Receipt, Download, Send, CreditCard } from 'lucide-react';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import { Quote } from '@/types';

interface Invoice {
  id: string;
  invoiceNumber: string;
  quoteId?: string;
  workOrderId: string;
  workOrderTitle: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorId?: string;
  subcontractorName?: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  totalAmount: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  dueDate: any;
  stripePaymentLink?: string;
  stripeSessionId?: string;
  notes?: string;
  terms?: string;
  createdAt: any;
}

export default function InvoicesManagement() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'paid' | 'overdue'>('all');
  const [generating, setGenerating] = useState<string | null>(null);

  const fetchInvoices = async () => {
    try {
      const invoicesQuery = query(collection(db, 'invoices'));
      const snapshot = await getDocs(invoicesQuery);
      const invoicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Invoice[];
      setInvoices(invoicesData);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      alert('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const fetchAcceptedQuotes = async () => {
    try {
      const quotesQuery = query(collection(db, 'quotes'));
      const snapshot = await getDocs(quotesQuery);
      const acceptedQuotes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Quote))
        .filter(q => q.status === 'accepted');
      setQuotes(acceptedQuotes);
    } catch (error) {
      console.error('Error fetching quotes:', error);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchAcceptedQuotes();
  }, []);

  const generateInvoiceFromQuote = async (quote: any) => {
    try {
      setGenerating(quote.id);
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const invoiceNumber = `SPRUCE-${Date.now().toString().slice(-8).toUpperCase()}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

      const invoiceData = {
        invoiceNumber,
        quoteId: quote.id,
        workOrderId: quote.workOrderId,
        workOrderTitle: quote.workOrderTitle,
        clientId: quote.clientId,
        clientName: quote.clientName,
        clientEmail: quote.clientEmail,
        subcontractorId: quote.subcontractorId,
        subcontractorName: quote.subcontractorName,
        status: 'draft',
        totalAmount: quote.clientAmount || quote.totalAmount,
        lineItems: quote.lineItems || [],
        taxRate: quote.taxRate || 0,
        taxAmount: quote.taxAmount || 0,
        discountAmount: quote.discountAmount || 0,
        dueDate: dueDate,
        notes: quote.notes || '',
        terms: 'Payment due within 30 days. Late payments may incur additional fees.',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'invoices'), invoiceData);

      alert(`Invoice ${invoiceNumber} created successfully`);
      fetchInvoices();
      fetchAcceptedQuotes();
    } catch (error) {
      console.error('Error generating invoice:', error);
      alert('Failed to generate invoice');
    } finally {
      setGenerating(null);
    }
  };

  const createStripePaymentLink = async (invoice: Invoice) => {
    try {
      const response = await fetch('/api/stripe/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.totalAmount,
          customerEmail: invoice.clientEmail,
          clientName: invoice.clientName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create payment link');
      }

      const data = await response.json();

      // Update invoice with Stripe payment link
      await updateDoc(doc(db, 'invoices', invoice.id), {
        stripePaymentLink: data.paymentLink,
        stripeSessionId: data.sessionId,
        updatedAt: serverTimestamp(),
      });

      alert('Stripe payment link created successfully');
      fetchInvoices();
    } catch (error) {
      console.error('Error creating payment link:', error);
      alert('Failed to create Stripe payment link');
    }
  };

  const downloadInvoice = (invoice: Invoice) => {
    try {
      downloadInvoicePDF({
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        lineItems: invoice.lineItems,
        subtotal: invoice.totalAmount,
        taxRate: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate?.toDate?.()?.toLocaleDateString?.() || 'N/A',
        notes: invoice.notes,
        terms: invoice.terms,
      });
    } catch (error) {
      console.error('Error downloading invoice:', error);
      alert('Failed to download invoice');
    }
  };

  const markAsSent = async (invoiceId: string) => {
    try {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'sent',
        sentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert('Invoice marked as sent');
      fetchInvoices();
    } catch (error) {
      console.error('Error marking invoice as sent:', error);
      alert('Failed to update invoice status');
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (filter === 'all') return true;
    return inv.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'text-gray-600 bg-gray-50';
      case 'sent': return 'text-blue-600 bg-blue-50';
      case 'paid': return 'text-green-600 bg-green-50';
      case 'overdue': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
            <p className="text-gray-600 mt-2">Generate and manage invoices with Stripe payment links</p>
          </div>
        </div>

        {/* Generate from Accepted Quotes */}
        {quotes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Generate Invoices from Accepted Quotes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {quotes.map(quote => (
                  <div key={quote.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-semibold">{quote.workOrderTitle}</div>
                      <div className="text-sm text-gray-600">
                        {quote.clientName} - ${quote.clientAmount?.toLocaleString() || quote.totalAmount?.toLocaleString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => generateInvoiceFromQuote(quote)}
                      disabled={generating === quote.id}
                    >
                      {generating === quote.id ? 'Generating...' : 'Generate Invoice'}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'draft', 'sent', 'paid', 'overdue'].map((filterOption) => (
            <Button
              key={filterOption}
              variant={filter === filterOption ? 'default' : 'outline'}
              onClick={() => setFilter(filterOption as typeof filter)}
              className="capitalize"
              size="sm"
            >
              {filterOption} ({invoices.filter(i => filterOption === 'all' || i.status === filterOption).length})
            </Button>
          ))}
        </div>

        {/* Invoices Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredInvoices.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No invoices found</p>
              </CardContent>
            </Card>
          ) : (
            filteredInvoices.map((invoice) => (
              <Card key={invoice.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{invoice.invoiceNumber}</CardTitle>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(invoice.status)}`}>
                        {invoice.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">{invoice.workOrderTitle}</div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div><span className="font-semibold">Client:</span> {invoice.clientName}</div>
                    <div><span className="font-semibold">Email:</span> {invoice.clientEmail}</div>
                    {invoice.subcontractorName && (
                      <div><span className="font-semibold">Subcontractor:</span> {invoice.subcontractorName}</div>
                    )}
                  </div>

                  <div className="bg-purple-50 p-3 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold">Total Amount</span>
                      <span className="text-2xl font-bold text-purple-600">
                        ${invoice.totalAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Stripe Payment Link */}
                  {invoice.stripePaymentLink && (
                    <div className="bg-green-50 p-3 rounded-lg text-sm">
                      <div className="font-semibold text-green-800 mb-1">Payment Link Ready</div>
                      <a
                        href={invoice.stripePaymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs break-all"
                      >
                        {invoice.stripePaymentLink.substring(0, 50)}...
                      </a>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => downloadInvoice(invoice)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>

                    {invoice.status === 'draft' && (
                      <>
                        {!invoice.stripePaymentLink && (
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => createStripePaymentLink(invoice)}
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            Create Payment Link
                          </Button>
                        )}

                        {invoice.stripePaymentLink && (
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => markAsSent(invoice.id)}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Mark as Sent
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
