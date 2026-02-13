'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Receipt, Download, CreditCard, Calendar, CheckCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import InvoiceSystemInfo from '@/components/invoice-system-info';
import type { InvoiceTimelineEvent, InvoiceSystemInformation } from '@/types';

interface Invoice {
  id: string;
  invoiceNumber: string;
  workOrderId?: string;
  workOrderTitle: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorName?: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  totalAmount: number;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  discountAmount?: number;
  dueDate: any;
  stripePaymentLink?: string;
  paidAt?: any;
  notes?: string;
  terms?: string;
  createdAt: any;
  timeline?: InvoiceTimelineEvent[];
  systemInformation?: InvoiceSystemInformation;
  creationSource?: string;
}

export default function ClientInvoiceDetail() {
  const { auth, db } = useFirebaseInstance();
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [canViewTimeline, setCanViewTimeline] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        router.push('/client-portal/login');
        return;
      }
      try {
        setLoading(true);
        const invoiceId = params.id as string;
        const invoiceDoc = await getDoc(doc(db, 'invoices', invoiceId));
        if (!invoiceDoc.exists()) {
          toast.error('Invoice not found');
          router.push('/client-portal/invoices');
          return;
        }
        const data = { id: invoiceDoc.id, ...invoiceDoc.data() } as Invoice;
        if (data.clientId !== user.uid) {
          toast.error('You are not authorized to view this invoice');
          router.push('/client-portal/invoices');
          return;
        }
        const clientDoc = await getDoc(doc(db, 'clients', user.uid));
        const clientData = clientDoc.data();
        setCanViewTimeline(clientData?.permissions?.viewTimeline === true);
        setInvoice(data);
        setIsAuthorized(true);
      } catch (error) {
        console.error('Error fetching invoice:', error);
        toast.error('Failed to load invoice');
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, [auth, db, params.id, router]);

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    try {
      await downloadInvoicePDF({
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        lineItems: invoice.lineItems?.length
          ? invoice.lineItems
          : [{ description: invoice.workOrderTitle, quantity: 1, unitPrice: invoice.totalAmount, amount: invoice.totalAmount }],
        subtotal: invoice.totalAmount,
        discountAmount: invoice.discountAmount || 0,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate?.toDate?.()?.toLocaleDateString() || 'N/A',
        notes: invoice.notes || '',
        terms: invoice.terms || '',
      });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF');
    }
  };

  const handlePayNow = () => {
    if (invoice?.stripePaymentLink) {
      window.open(invoice.stripePaymentLink, '_blank');
    } else {
      toast.error('Payment link not available');
    }
  };

  const toDate = (val: any) => {
    if (!val) return null;
    if (val?.toDate) return val.toDate();
    if (val instanceof Date) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const buildInvoiceTimeline = (inv: Invoice): InvoiceTimelineEvent[] => {
    if (inv.timeline && inv.timeline.length > 0) {
      return [...inv.timeline].sort((a, b) => (toDate(a.timestamp)?.getTime() ?? 0) - (toDate(b.timestamp)?.getTime() ?? 0));
    }
    const events: InvoiceTimelineEvent[] = [];
    const createdTs = toDate(inv.createdAt);
    if (createdTs) {
      events.push({
        id: 'created',
        timestamp: inv.createdAt,
        type: 'created',
        userId: (inv as any).createdBy || 'unknown',
        userName: inv.systemInformation?.createdBy?.name || 'Admin',
        userRole: 'admin',
        details: inv.creationSource === 'from_quote' ? 'Invoice created from accepted quote' : 'Invoice created',
        metadata: { source: inv.creationSource || 'admin_portal' },
      });
    }
    if (inv.status === 'sent' || inv.status === 'paid') {
      const sentAt = (inv as any).sentAt;
      if (sentAt) {
        events.push({
          id: 'sent',
          timestamp: sentAt,
          type: 'sent',
          userId: inv.systemInformation?.sentBy?.id || 'unknown',
          userName: inv.systemInformation?.sentBy?.name || 'Admin',
          userRole: 'admin',
          details: 'Invoice sent to client',
          metadata: { invoiceNumber: inv.invoiceNumber },
        });
      }
    }
    if (inv.status === 'paid' && inv.paidAt) {
      events.push({
        id: 'paid',
        timestamp: inv.paidAt,
        type: 'paid',
        userId: inv.systemInformation?.paidBy?.id || 'system',
        userName: inv.systemInformation?.paidBy?.name || 'Payment System',
        userRole: 'system',
        details: 'Payment received',
        metadata: {},
      });
    }
    return events.sort((a, b) => (toDate(a.timestamp)?.getTime() ?? 0) - (toDate(b.timestamp)?.getTime() ?? 0));
  };

  const getInvoiceCreationSourceLabel = (inv: Invoice): string => {
    if (inv.systemInformation?.createdBy?.name && inv.creationSource === 'from_quote') {
      return `Invoice created by ${inv.systemInformation.createdBy.name} from accepted quote`;
    }
    if (inv.systemInformation?.createdBy?.name) {
      return `Invoice created by ${inv.systemInformation.createdBy.name} via Admin Portal`;
    }
    if (inv.creationSource === 'scheduled') return 'Invoice created from scheduled invoice';
    if (inv.creationSource === 'upload') return 'Invoice created from uploaded PDF';
    return 'Invoice created via portal';
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
      overdue: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Draft',
      sent: 'Awaiting Payment',
      paid: 'Paid',
      overdue: 'Overdue',
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </ClientLayout>
    );
  }

  if (!isAuthorized || !invoice) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Receipt className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Invoice not found</h3>
            <p className="text-gray-600 mb-4">This invoice does not exist or you do not have access.</p>
            <Link href="/client-portal/invoices">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Invoices
              </Button>
            </Link>
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <Link href="/client-portal/invoices">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Invoices
            </Button>
          </Link>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBadge(invoice.status)}`}>
            {getStatusLabel(invoice.status)}
          </span>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-2xl mb-2">{invoice.invoiceNumber}</CardTitle>
              <p className="text-sm text-gray-600">{invoice.workOrderTitle}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Total Amount</p>
                  <p className="text-3xl font-bold text-gray-900">${invoice.totalAmount.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Due Date</p>
                  <p className="text-sm font-medium text-gray-900">
                    {invoice.dueDate?.toDate?.()?.toLocaleDateString() || 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            {invoice.status === 'paid' && invoice.paidAt && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">Paid on {invoice.paidAt?.toDate?.()?.toLocaleDateString() || 'N/A'}</p>
                </div>
              </div>
            )}
            {invoice.lineItems && invoice.lineItems.length > 0 && (
              <div className="border-t pt-6">
                <h4 className="font-semibold text-gray-900 mb-3">Line Items</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">Description</th>
                        <th className="px-4 py-2 text-center font-semibold text-gray-700">Qty</th>
                        <th className="px-4 py-2 text-right font-semibold text-gray-700">Rate</th>
                        <th className="px-4 py-2 text-right font-semibold text-gray-700">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {invoice.lineItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2">{item.description}</td>
                          <td className="px-4 py-2 text-center">{item.quantity}</td>
                          <td className="px-4 py-2 text-right">${item.unitPrice.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-semibold">${item.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button onClick={handleDownloadPDF} variant="outline" className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              {(invoice.status === 'sent' || invoice.status === 'overdue') && invoice.stripePaymentLink && (
                <Button onClick={handlePayNow} className="flex-1 bg-green-600 hover:bg-green-700">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay Now
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {canViewTimeline && (
          <InvoiceSystemInfo
            timeline={buildInvoiceTimeline(invoice)}
            systemInformation={invoice.systemInformation}
            creationSourceLabel={getInvoiceCreationSourceLabel(invoice)}
          />
        )}
      </div>
    </ClientLayout>
  );
}
