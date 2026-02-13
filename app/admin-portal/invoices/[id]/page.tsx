'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Receipt, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import InvoiceSystemInfo from '@/components/invoice-system-info';
import type { InvoiceTimelineEvent, InvoiceSystemInformation } from '@/types';

interface Invoice {
  id: string;
  invoiceNumber: string;
  workOrderId?: string;
  workOrderTitle: string;
  workOrderDescription?: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorName?: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  totalAmount: number;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  discountAmount?: number;
  dueDate: any;
  paidAt?: any;
  notes?: string;
  terms?: string;
  createdAt: any;
  sentAt?: any;
  timeline?: InvoiceTimelineEvent[];
  systemInformation?: InvoiceSystemInformation;
  creationSource?: string;
}

export default function AdminInvoiceDetail() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvoice = async () => {
      const id = params.id as string;
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'invoices', id));
        if (!snap.exists()) {
          router.push('/admin-portal/invoices');
          return;
        }
        setInvoice({ id: snap.id, ...snap.data() } as Invoice);
      } catch (error) {
        console.error('Error fetching invoice:', error);
        router.push('/admin-portal/invoices');
      } finally {
        setLoading(false);
      }
    };
    fetchInvoice();
  }, [params.id, router]);

  const handleDownloadPDF = () => {
    if (!invoice) return;
    downloadInvoicePDF({
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      workOrderName: invoice.workOrderTitle,
      vendorName: invoice.subcontractorName,
      serviceDescription: invoice.workOrderDescription,
      lineItems: invoice.lineItems || [],
      subtotal: invoice.totalAmount,
      discountAmount: invoice.discountAmount || 0,
      totalAmount: invoice.totalAmount,
      dueDate: invoice.dueDate?.toDate?.()?.toLocaleDateString() || 'N/A',
      notes: invoice.notes,
      terms: invoice.terms,
    });
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
    if ((inv as any).sentAt) {
      events.push({
        id: 'sent',
        timestamp: (inv as any).sentAt,
        type: 'sent',
        userId: inv.systemInformation?.sentBy?.id || 'unknown',
        userName: inv.systemInformation?.sentBy?.name || 'Admin',
        userRole: 'admin',
        details: 'Invoice sent to client',
        metadata: { invoiceNumber: inv.invoiceNumber },
      });
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

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
        </div>
      </AdminLayout>
    );
  }

  if (!invoice) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <Link href="/admin-portal/invoices">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Invoices
            </Button>
          </Link>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${invoice.status}`}>
            {invoice.status}
          </span>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-2xl mb-2">{invoice.invoiceNumber}</CardTitle>
              <p className="text-sm text-gray-600">{invoice.workOrderTitle}</p>
              <p className="text-sm text-gray-600">Client: {invoice.clientName}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="text-3xl font-bold text-gray-900">${invoice.totalAmount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Due Date</p>
                <p className="text-sm font-medium text-gray-900">
                  {invoice.dueDate?.toDate?.()?.toLocaleDateString() || 'N/A'}
                </p>
              </div>
            </div>
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
            <Button onClick={handleDownloadPDF} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </CardContent>
        </Card>

        <InvoiceSystemInfo
          timeline={buildInvoiceTimeline(invoice)}
          systemInformation={invoice.systemInformation}
          creationSourceLabel={getInvoiceCreationSourceLabel(invoice)}
        />
      </div>
    </AdminLayout>
  );
}
