'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import ClientLayout from '@/components/client-layout';
import { Button } from '@/components/ui/button';
import { Receipt, Download, CreditCard, Calendar, CheckCircle, Eye, Zap, AlertCircle } from 'lucide-react';
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
  autoChargeAttempted?: boolean;
  autoChargeStatus?: string;
  autoChargeError?: string;
  paidAt?: any;
  notes?: string;
  terms?: string;
  createdAt: any;
}

function ClientInvoicesInner() {
  const searchParams = useSearchParams();
  const workOrderIdFilter = searchParams.get('workOrderId');
  const { auth, db } = useFirebaseInstance();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [autoPayEnabled, setAutoPayEnabled] = useState(false);
  const [savedCardLast4, setSavedCardLast4] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Load client billing info once
        getDoc(doc(db, 'clients', user.uid)).then((snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setAutoPayEnabled(d.autoPayEnabled || false);
            setSavedCardLast4(d.savedCardLast4 || null);
          }
        });

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
        }, (error) => {
          console.error('Invoices listener error:', error);
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
      draft: 'bg-muted text-foreground border-border',
      sent: 'bg-blue-50 text-blue-700 border-blue-200',
      paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      overdue: 'bg-red-50 text-red-700 border-red-200',
    };
    return styles[status as keyof typeof styles] || 'bg-muted text-foreground border-border';
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

  const scopedInvoices = workOrderIdFilter
    ? invoices.filter((i) => i.workOrderId === workOrderIdFilter)
    : invoices;

  const filteredInvoices = scopedInvoices.filter(invoice => {
    if (filter === 'all') return true;
    return invoice.status === filter;
  });

  const filterOptions = [
    { value: 'all', label: 'All', count: scopedInvoices.length },
    { value: 'sent', label: 'Awaiting Payment', count: scopedInvoices.filter(i => i.status === 'sent').length },
    { value: 'paid', label: 'Paid', count: scopedInvoices.filter(i => i.status === 'paid').length },
    { value: 'overdue', label: 'Overdue', count: scopedInvoices.filter(i => i.status === 'overdue').length },
  ];

  const totalUnpaid = scopedInvoices
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

        {workOrderIdFilter && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
            Showing invoices for this work order ·{' '}
            <Link href={`/client-portal/work-orders/${workOrderIdFilter}`} className="font-medium underline">
              Back to work order
            </Link>
            {' · '}
            <Link href="/client-portal/invoices" className="font-medium underline">
              All invoices
            </Link>
          </div>
        )}

        <StatCards
          items={[
            { label: 'Total', value: scopedInvoices.length, icon: Receipt, color: 'blue' },
            { label: 'Awaiting Payment', value: scopedInvoices.filter(i => i.status === 'sent').length, icon: CreditCard, color: 'amber' },
            { label: 'Paid', value: scopedInvoices.filter(i => i.status === 'paid').length, icon: CheckCircle, color: 'emerald' },
            { label: 'Overdue', value: scopedInvoices.filter(i => i.status === 'overdue').length, icon: Receipt, color: 'red' },
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
              {scopedInvoices.filter(i => i.status === 'sent' || i.status === 'overdue').length} unpaid invoice(s)
            </p>
          </div>
        )}

        {/* Auto-Pay Banner */}
        {autoPayEnabled && savedCardLast4 ? (
          <div className="rounded-xl border p-3.5 flex items-center gap-3 bg-emerald-50 border-emerald-100 text-emerald-700">
            <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Auto-Pay Enabled</p>
              <p className="text-xs opacity-75">Invoices will be charged automatically to card ending in {savedCardLast4}</p>
            </div>
            <Link href="/client-portal/payment-methods">
              <Button variant="outline" size="sm" className="text-emerald-700 border-emerald-300 hover:border-emerald-400 shrink-0 text-xs">
                Manage
              </Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border p-3.5 flex items-center gap-3 bg-blue-50 border-blue-100 text-blue-700">
            <CreditCard className="h-5 w-5 flex-shrink-0 text-blue-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Save a card for automatic payments</p>
              <p className="text-xs opacity-75">Set up auto-pay so invoices are charged automatically</p>
            </div>
            <Link href="/client-portal/payment-methods">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 shrink-0 text-xs">
                Set Up
              </Button>
            </Link>
          </div>
        )}

        <div className="flex items-center gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                filter === option.value ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
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
            subtitle={
              workOrderIdFilter
                ? 'No invoices for this work order yet.'
                : filter === 'all'
                  ? 'Invoices will appear here once quotes are approved.'
                  : 'Try a different filter'
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className={`bg-card rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow ${invoice.status === 'overdue' ? 'border-red-200' : 'border-border'}`}
              >
                <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-700" />
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-foreground">{invoice.invoiceNumber}</h3>
                      <p className="text-sm text-muted-foreground">{invoice.workOrderTitle}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${getStatusBadge(invoice.status)}`}>
                      {getStatusLabel(invoice.status)}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">${invoice.totalAmount.toLocaleString()}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{invoice.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</span>
                    </div>
                    {invoice.dueDate && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
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
                  {/* Auto-charge status */}
                  {invoice.autoChargeAttempted && (
                    <div className={`text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${
                      invoice.autoChargeStatus === 'succeeded' ? 'bg-emerald-50 text-emerald-700' :
                      invoice.autoChargeStatus === 'failed' ? 'bg-red-50 text-red-700' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      {invoice.autoChargeStatus === 'succeeded'
                        ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      }
                      <span>
                        {invoice.autoChargeStatus === 'succeeded' ? 'Auto-charged successfully' :
                         invoice.autoChargeStatus === 'failed' ? `Auto-charge failed: ${invoice.autoChargeError || 'contact support'}` :
                         `Auto-charge: ${invoice.autoChargeStatus}`}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
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
                    {(invoice.status === 'sent' || invoice.status === 'overdue') && invoice.stripePaymentLink && invoice.autoChargeStatus !== 'succeeded' && (
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

export default function ClientInvoices() {
  return (
    <Suspense
      fallback={
        <ClientLayout>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        </ClientLayout>
      }
    >
      <ClientInvoicesInner />
    </Suspense>
  );
}
