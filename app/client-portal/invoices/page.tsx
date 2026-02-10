'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Receipt, Download, CreditCard, Calendar, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

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
  discountAmount?: number;
  dueDate: any;
  stripePaymentLink?: string;
  stripeSessionId?: string;
  paidAt?: any;
  notes?: string;
  terms?: string;
  createdAt: any;
}

export default function ClientInvoices() {
  const { auth, db } = useFirebaseInstance();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const invoicesQuery = query(
          collection(db, 'invoices'),
          where('clientId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );

        const unsubscribeSnapshot = onSnapshot(invoicesQuery, (snapshot) => {
          const invoicesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as Invoice[];
          setInvoices(invoicesData);
          setLoading(false);
        });

        return () => unsubscribeSnapshot();
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db]);

  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      const invoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        lineItems: invoice.lineItems || [{
          description: invoice.workOrderTitle,
          quantity: 1,
          unitPrice: invoice.totalAmount,
          amount: invoice.totalAmount
        }],
        subtotal: invoice.totalAmount,
        discountAmount: invoice.discountAmount || 0,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate?.toDate?.()?.toLocaleDateString() || 'N/A',
        notes: invoice.notes || '',
        terms: invoice.terms || ''
      };
      await downloadInvoicePDF(invoiceData);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF');
    }
  };

  const handlePayNow = (invoice: Invoice) => {
    if (invoice.stripePaymentLink) {
      window.open(invoice.stripePaymentLink, '_blank');
    } else {
      toast.error('Payment link not available');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
      overdue: 'bg-red-100 text-red-800',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      draft: 'Draft',
      sent: 'Awaiting Payment',
      paid: 'Paid',
      overdue: 'Overdue',
    };
    return labels[status as keyof typeof labels] || status;
  };

  const filteredInvoices = invoices.filter(invoice => {
    if (filter === 'all') return true;
    return invoice.status === filter;
  });

  const filterOptions = [
    { value: 'all', label: 'All', count: invoices.length },
    { value: 'sent', label: 'Awaiting Payment', count: invoices.filter(i => i.status === 'sent').length },
    { value: 'paid', label: 'Paid', count: invoices.filter(i => i.status === 'paid').length },
    { value: 'overdue', label: 'Overdue', count: invoices.filter(i => i.status === 'overdue').length },
  ];

  const totalUnpaid = invoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((sum, i) => sum + i.totalAmount, 0);

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600 mt-2">View and pay your invoices</p>
        </div>

        {totalUnpaid > 0 && (
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Receipt className="h-8 w-8 text-yellow-600" />
                  <div>
                    <p className="font-semibold text-gray-900">Outstanding Balance</p>
                    <p className="text-2xl font-bold text-yellow-600">${totalUnpaid.toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  {invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length} unpaid invoice(s)
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 overflow-x-auto pb-2">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                filter === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>

        {filteredInvoices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Receipt className="h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {filter === 'all' ? 'No invoices yet' : `No ${filter} invoices`}
              </h3>
              <p className="text-gray-600 text-center">
                {filter === 'all'
                  ? 'Invoices will appear here once quotes are approved.'
                  : 'Try a different filter'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredInvoices.map((invoice) => (
              <Card key={invoice.id} className={invoice.status === 'overdue' ? 'border-red-300' : ''}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg mb-1">{invoice.invoiceNumber}</CardTitle>
                      <p className="text-sm text-gray-600">{invoice.workOrderTitle}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBadge(invoice.status)}`}>
                      {getStatusLabel(invoice.status)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-3xl font-bold text-gray-900">${invoice.totalAmount.toLocaleString()}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <Calendar className="h-4 w-4" />
                        <span>Invoice Date</span>
                      </div>
                      <p className="font-medium text-gray-900">
                        {invoice.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </p>
                    </div>

                    {invoice.dueDate && (
                      <div>
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                          <Calendar className="h-4 w-4" />
                          <span>Due Date</span>
                        </div>
                        <p className="font-medium text-gray-900">
                          {invoice.dueDate?.toDate?.().toLocaleDateString() || 'N/A'}
                        </p>
                      </div>
                    )}

                    {invoice.status === 'paid' && invoice.paidAt && (
                      <div className="col-span-2">
                        <div className="flex items-center gap-2 text-green-600 mb-1">
                          <CheckCircle className="h-4 w-4" />
                          <span>Paid On</span>
                        </div>
                        <p className="font-medium text-gray-900">
                          {invoice.paidAt?.toDate?.().toLocaleDateString() || 'N/A'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => handleDownloadPDF(invoice)}
                      variant="outline"
                      className="flex-1"
                      size="sm"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>

                    {(invoice.status === 'sent' || invoice.status === 'overdue') && invoice.stripePaymentLink && (
                      <Button
                        onClick={() => handlePayNow(invoice)}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        size="sm"
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Pay Now
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
