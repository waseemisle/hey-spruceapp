'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import ClientLayout from '@/components/client-layout';
import { Button } from '@/components/ui/button';
import { Receipt, Download, CreditCard, Calendar, CheckCircle, Eye } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';

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
      draft: 'bg-gray-50 text-gray-700 border-gray-200',
      sent: 'bg-blue-50 text-blue-700 border-blue-200',
      paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      overdue: 'bg-red-50 text-red-700 border-red-200',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-50 text-gray-700 border-gray-200';
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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <PageContainer>
        <PageHeader
          title="Invoices"
          subtitle="View and pay your invoices"
          icon={Receipt}
          iconClassName="text-blue-600"
        />

        <StatCards
          items={[
            { label: 'Total', value: invoices.length, icon: Receipt, color: 'blue' },
            { label: 'Awaiting Payment', value: invoices.filter(i => i.status === 'sent').length, icon: CreditCard, color: 'amber' },
            { label: 'Paid', value: invoices.filter(i => i.status === 'paid').length, icon: CheckCircle, color: 'emerald' },
            { label: 'Overdue', value: invoices.filter(i => i.status === 'overdue').length, icon: Receipt, color: 'red' },
          ]}
        />

        {totalUnpaid > 0 && (
          <div className="rounded-xl border p-4 flex items-center gap-3 text-amber-600 bg-amber-50 border-amber-100">
            <Receipt className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-xs mt-0.5 opacity-75">Outstanding Balance</p>
              <p className="text-xl font-bold leading-none">${totalUnpaid.toLocaleString()}</p>
            </div>
            <p className="ml-auto text-sm text-amber-700">
              {invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length} unpaid invoice(s)
            </p>
          </div>
        )}

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                filter === option.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>

        {filteredInvoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={filter === 'all' ? 'No invoices yet' : `No ${filter} invoices`}
            subtitle={filter === 'all' ? 'Invoices will appear here once quotes are approved.' : 'Try a different filter'}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow ${invoice.status === 'overdue' ? 'border-red-200' : 'border-gray-200'}`}
              >
                <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-700" />
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{invoice.invoiceNumber}</h3>
                      <p className="text-sm text-gray-600">{invoice.workOrderTitle}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${getStatusBadge(invoice.status)}`}>
                      {getStatusLabel(invoice.status)}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">${invoice.totalAmount.toLocaleString()}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      <span>{invoice.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</span>
                    </div>
                    {invoice.dueDate && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>Due {invoice.dueDate?.toDate?.().toLocaleDateString() || 'N/A'}</span>
                      </div>
                    )}
                    {invoice.status === 'paid' && invoice.paidAt && (
                      <div className="col-span-2 flex items-center gap-2 text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Paid {invoice.paidAt?.toDate?.().toLocaleDateString() || 'N/A'}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                    <Link href={`/client-portal/invoices/${invoice.id}`} className="flex-1 min-w-[100px]">
                      <Button variant="secondary" className="w-full gap-2" size="sm">
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Button>
                    </Link>
                    <Button onClick={() => handleDownloadPDF(invoice)} variant="outline" className="gap-2" size="sm">
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </Button>
                    {(invoice.status === 'sent' || invoice.status === 'overdue') && invoice.stripePaymentLink && (
                      <Button onClick={() => handlePayNow(invoice)} className="gap-2 bg-emerald-600 hover:bg-emerald-700" size="sm">
                        <CreditCard className="h-3.5 w-3.5" />
                        Pay Now
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageContainer>
    </ClientLayout>
  );
}
