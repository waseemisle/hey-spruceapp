'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Receipt, Download, ArrowLeft, History, Paperclip, MapPin, FileText, CreditCard, GitBranch, Edit2, Zap, X, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import InvoiceSystemInfo from '@/components/invoice-system-info';
import { toast } from 'sonner';
import type { InvoiceTimelineEvent, InvoiceSystemInformation } from '@/types';

interface LaborLine {
  description?: string;
  approvalCode?: string;
  additionalCodes?: string;
  timeType?: string;
  hourlyRate?: number;
  hours?: number;
  amount: number;
}

interface MaterialsLine {
  item?: string;
  partNumber?: string;
  approvalCode?: string;
  units?: string;
  unitPrice?: number;
  markupPercent?: number;
  quantity?: number;
  amount: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle: string;
  workOrderDescription?: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorName?: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  totalAmount: number;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  laborLines?: LaborLine[];
  travelAmount?: number;
  materialsLines?: MaterialsLine[];
  discountAmount?: number;
  dueDate: any;
  paidAt?: any;
  completedDate?: any;
  purchaseOrderNumber?: string;
  notes?: string;
  terms?: string;
  createdAt: any;
  sentAt?: any;
  timeline?: InvoiceTimelineEvent[];
  systemInformation?: InvoiceSystemInformation;
  creationSource?: string;
  stripePaymentLink?: string;
  checkInOut?: Array<{ type: 'check_in' | 'check_out'; timestamp: any; location?: string }>;
  attachments?: Array<{ name: string; url: string }>;
  approvalChain?: Array<{ role: string; name?: string; status: 'pending' | 'approved' | 'rejected'; at?: any }>;
}

type InvoiceTab = 'charges' | 'history' | 'attachments' | 'checkinout' | 'related' | 'approval';

interface ClientBilling {
  savedCardLast4?: string;
  savedCardBrand?: string;
  savedCardExpMonth?: number;
  savedCardExpYear?: number;
  defaultPaymentMethodId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionAmount?: number;
  subscriptionBillingDay?: number;
}

export default function AdminInvoiceDetail() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<InvoiceTab>('charges');
  const [relatedInvoices, setRelatedInvoices] = useState<Invoice[]>([]);
  const [clientBilling, setClientBilling] = useState<ClientBilling | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ status: '', notes: '', terms: '' });
  const [editLineItems, setEditLineItems] = useState<Array<{ description: string; quantity: number; unitPrice: number; amount: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [charging, setCharging] = useState(false);

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
        const data = { id: snap.id, ...snap.data() } as Invoice;
        setInvoice(data);
        // Fetch client billing info
        if (data.clientId) {
          const clientSnap = await getDoc(doc(db, 'clients', data.clientId));
          if (clientSnap.exists()) {
            const cd = clientSnap.data();
            setClientBilling({
              savedCardLast4: cd.savedCardLast4,
              savedCardBrand: cd.savedCardBrand,
              savedCardExpMonth: cd.savedCardExpMonth,
              savedCardExpYear: cd.savedCardExpYear,
              defaultPaymentMethodId: cd.defaultPaymentMethodId,
              stripeSubscriptionId: cd.stripeSubscriptionId,
              subscriptionStatus: cd.subscriptionStatus,
              subscriptionAmount: cd.subscriptionAmount,
              subscriptionBillingDay: cd.subscriptionBillingDay,
            });
          }
        }
        if (data.workOrderId) {
          const relatedSnap = await getDocs(
            query(collection(db, 'invoices'), where('workOrderId', '==', data.workOrderId))
          );
          const related = relatedSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Invoice))
            .filter((inv) => inv.id !== id);
          setRelatedInvoices(related);
        }
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

  const handleOpenEdit = () => {
    if (!invoice) return;
    setEditForm({
      status: invoice.status,
      notes: invoice.notes || '',
      terms: invoice.terms || '',
    });
    setEditLineItems(
      invoice.lineItems?.length
        ? invoice.lineItems.map(li => ({ ...li }))
        : [{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]
    );
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!invoice) return;
    setSaving(true);
    try {
      const newTotal = editLineItems.reduce((s, li) => s + (li.amount || 0), 0);
      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: editForm.status,
        notes: editForm.notes,
        terms: editForm.terms,
        lineItems: editLineItems,
        totalAmount: newTotal,
        updatedAt: serverTimestamp(),
      });
      setInvoice(prev => prev ? { ...prev, status: editForm.status as any, notes: editForm.notes, terms: editForm.terms, lineItems: editLineItems, totalAmount: newTotal } : prev);
      setShowEditModal(false);
      toast.success('Invoice updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateEditLineItem = (index: number, field: string, raw: string) => {
    setEditLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === 'description') {
        item.description = raw;
      } else {
        const num = parseFloat(raw) || 0;
        (item as any)[field] = num;
        if (field === 'quantity') item.amount = num * item.unitPrice;
        if (field === 'unitPrice') item.amount = item.quantity * num;
        if (field === 'amount') item.amount = num;
      }
      updated[index] = item;
      return updated;
    });
  };

  const handleAutoCharge = async () => {
    if (!invoice || !clientBilling) return;
    if (!confirm(`Auto-charge $${invoice.totalAmount.toLocaleString()} from ${invoice.clientName}'s saved ${clientBilling.savedCardBrand || 'card'} ending in ${clientBilling.savedCardLast4}?`)) return;
    setCharging(true);
    try {
      const res = await fetch('/api/stripe/charge-saved-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, clientId: invoice.clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Charge failed');
      if (data.status === 'succeeded') {
        toast.success(`Charged $${invoice.totalAmount.toLocaleString()} successfully!`);
        setInvoice(prev => prev ? { ...prev, status: 'paid' } : prev);
      } else {
        toast.warning(`Charge status: ${data.status}. Client may need to authenticate.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to charge');
    } finally {
      setCharging(false);
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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (!invoice) {
    return null;
  }

  const tabs: { id: InvoiceTab; label: string; icon: React.ElementType }[] = [
    { id: 'charges', label: 'Charges', icon: Receipt },
    { id: 'history', label: 'History', icon: History },
    { id: 'attachments', label: 'Attachments', icon: Paperclip },
    { id: 'checkinout', label: 'Check-In/Out', icon: MapPin },
    { id: 'related', label: 'Related Invoices', icon: FileText },
    { id: 'approval', label: 'Approval Workflow', icon: GitBranch },
  ];

  type ApprovalStep = { role: string; name?: string; status: string };
  const defaultApprovalChain: ApprovalStep[] = [
    { role: 'Service Provider', status: invoice?.subcontractorName ? 'approved' : 'pending' },
    { role: 'Location User', status: 'pending' },
    { role: 'Store Manager', status: 'pending' },
    { role: 'Regional Manager', status: 'pending' },
    { role: 'Director of Facilities', status: invoice?.status === 'paid' ? 'approved' : 'pending' },
  ];
  const approvalSteps: ApprovalStep[] = invoice?.approvalChain?.length ? invoice.approvalChain : defaultApprovalChain;

  const laborRows: LaborLine[] = invoice.laborLines?.length
    ? invoice.laborLines
    : (invoice.lineItems?.length
        ? invoice.lineItems.map((li) => ({
            description: li.description,
            approvalCode: '—',
            additionalCodes: '—',
            timeType: 'Regular',
            hourlyRate: li.unitPrice,
            hours: li.quantity,
            amount: li.amount,
          }))
        : []);
  const laborTotal = laborRows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const travelTotal = invoice.travelAmount ?? 0;
  const materialsRows = invoice.materialsLines ?? [];
  const materialsTotal = materialsRows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const subTotal = laborTotal + travelTotal + materialsTotal;
  const discount = invoice.discountAmount ?? 0;
  const totalDisplay = invoice.totalAmount;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleDownloadPDF} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            <Button onClick={handleOpenEdit} variant="outline" size="sm">
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            {(invoice.status === 'sent' || invoice.status === 'overdue') &&
              clientBilling?.defaultPaymentMethodId && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleAutoCharge}
                disabled={charging}
              >
                <Zap className="h-4 w-4 mr-2" />
                {charging ? 'Charging…' : 'Auto-Charge Saved Card'}
              </Button>
            )}
            {invoice.status !== 'paid' && invoice.stripePaymentLink && (
              <Button size="sm" asChild>
                <a href={invoice.stripePaymentLink} target="_blank" rel="noopener noreferrer">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay via Stripe
                </a>
              </Button>
            )}
            {invoice.status !== 'paid' && !invoice.stripePaymentLink && (
              <Button size="sm" variant="secondary" disabled title="Payment link not set">
                Pay
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-2xl mb-2">{invoice.invoiceNumber}</CardTitle>
              <p className="text-sm text-muted-foreground">{invoice.workOrderTitle}</p>
              {invoice.workOrderId ? (
                <Link
                  href={`/admin-portal/work-orders/${invoice.workOrderId}`}
                  className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                >
                  {invoice.workOrderNumber ? `Work order #${invoice.workOrderNumber}` : 'View work order'}
                </Link>
              ) : invoice.workOrderNumber ? (
                <p className="text-sm text-muted-foreground mt-1">Tracking: {invoice.workOrderNumber}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">Client: {invoice.clientName}</p>
              {invoice.subcontractorName && (
                <p className="text-sm text-muted-foreground">Provider: {invoice.subcontractorName}</p>
              )}
              {invoice.completedDate && (
                <p className="text-sm text-muted-foreground">
                  Completed: {toDate(invoice.completedDate)?.toLocaleDateString() ?? 'N/A'}
                </p>
              )}
              {/* Client billing info */}
              {clientBilling && (clientBilling.defaultPaymentMethodId || clientBilling.stripeSubscriptionId) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {clientBilling.defaultPaymentMethodId && clientBilling.savedCardLast4 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      <CreditCard className="h-3 w-3" />
                      Client has saved {clientBilling.savedCardBrand
                        ? clientBilling.savedCardBrand.charAt(0).toUpperCase() + clientBilling.savedCardBrand.slice(1)
                        : 'card'} ending in {clientBilling.savedCardLast4}
                    </span>
                  )}
                  {clientBilling.stripeSubscriptionId && clientBilling.subscriptionStatus === 'active' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      <span>⚡</span>
                      Client has Fixed Recurring Plan: ${(clientBilling.subscriptionAmount || 0).toLocaleString()}/month
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1 border-b mb-4">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors ${
                    activeTab === t.id
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'charges' && (
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-sm uppercase text-muted-foreground mb-2">Labor</h4>
                  <div className="overflow-x-auto border rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Labor Item / Approval Code</th>
                          <th className="px-4 py-2 text-left font-medium">Add'l Codes</th>
                          <th className="px-4 py-2 text-left font-medium">Time Type</th>
                          <th className="px-4 py-2 text-right font-medium">Rate</th>
                          <th className="px-4 py-2 text-right font-medium">Hrs</th>
                          <th className="px-4 py-2 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {laborRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-4 text-center text-muted-foreground">
                              No labor lines
                            </td>
                          </tr>
                        ) : (
                          laborRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-2">{row.description ?? '—'}</td>
                              <td className="px-4 py-2">{row.additionalCodes ?? '—'}</td>
                              <td className="px-4 py-2">{row.timeType ?? 'Regular'}</td>
                              <td className="px-4 py-2 text-right">
                                {row.hourlyRate != null ? `$${Number(row.hourlyRate).toLocaleString()}` : '—'}
                              </td>
                              <td className="px-4 py-2 text-right">{row.hours ?? '—'}</td>
                              <td className="px-4 py-2 text-right font-medium">
                                ${Number(row.amount).toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-sm font-medium mt-2">Labor Total: ${laborTotal.toLocaleString()}</p>
                </div>

                <div>
                  <h4 className="font-semibold text-sm uppercase text-muted-foreground mb-2">Travel</h4>
                  <p className="text-sm">Travel Total: ${travelTotal.toLocaleString()}</p>
                </div>

                <div>
                  <h4 className="font-semibold text-sm uppercase text-muted-foreground mb-2">Materials</h4>
                  <div className="overflow-x-auto border rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Item</th>
                          <th className="px-4 py-2 text-left font-medium">Part #</th>
                          <th className="px-4 py-2 text-right font-medium">Unit Price</th>
                          <th className="px-4 py-2 text-right font-medium">Markup %</th>
                          <th className="px-4 py-2 text-right font-medium">Qty</th>
                          <th className="px-4 py-2 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {materialsRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-4 text-center text-muted-foreground">
                              No materials
                            </td>
                          </tr>
                        ) : (
                          materialsRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-2">{row.item ?? '—'}</td>
                              <td className="px-4 py-2">{row.partNumber ?? '—'}</td>
                              <td className="px-4 py-2 text-right">
                                {row.unitPrice != null ? `$${Number(row.unitPrice).toLocaleString()}` : '—'}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {row.markupPercent != null ? `${row.markupPercent}%` : '—'}
                              </td>
                              <td className="px-4 py-2 text-right">{row.quantity ?? '—'}</td>
                              <td className="px-4 py-2 text-right font-medium">
                                ${Number(row.amount).toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-sm font-medium mt-2">Materials Total: ${materialsTotal.toLocaleString()}</p>
                </div>

                <div className="border-t pt-4 space-y-1 text-sm">
                  <p>Sub Total: ${subTotal.toLocaleString()}</p>
                  {discount > 0 && <p>Discount: -${discount.toLocaleString()}</p>}
                  <p className="font-bold text-lg">Total: ${totalDisplay.toLocaleString()}</p>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <InvoiceSystemInfo
                timeline={buildInvoiceTimeline(invoice)}
                systemInformation={invoice.systemInformation}
                creationSourceLabel={getInvoiceCreationSourceLabel(invoice)}
              />
            )}

            {activeTab === 'attachments' && (
              <div className="space-y-2">
                {invoice.attachments?.length ? (
                  invoice.attachments.map((a, i) => (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Paperclip className="h-4 w-4" />
                      {a.name}
                    </a>
                  ))
                ) : (
                  <p className="text-muted-foreground">No attachments</p>
                )}
              </div>
            )}

            {activeTab === 'checkinout' && (
              <div className="space-y-2">
                {invoice.checkInOut?.length ? (
                  <ul className="divide-y">
                    {invoice.checkInOut.map((c, i) => (
                      <li key={i} className="py-2 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium capitalize">{c.type.replace('_', ' ')}</span>
                        <span className="text-muted-foreground">
                          {toDate(c.timestamp)?.toLocaleString() ?? 'N/A'}
                          {c.location && ` — ${c.location}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No check-in/out records</p>
                )}
              </div>
            )}

            {activeTab === 'related' && (
              <div className="space-y-2">
                {relatedInvoices.length ? (
                  <ul className="divide-y">
                    {relatedInvoices.map((inv) => (
                      <li key={inv.id} className="py-2">
                        <Link
                          href={`/admin-portal/invoices/${inv.id}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {inv.invoiceNumber}
                        </Link>
                        <span className="text-muted-foreground ml-2">
                          ${inv.totalAmount?.toLocaleString() ?? 0} — {inv.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No related invoices</p>
                )}
              </div>
            )}

            {activeTab === 'approval' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Multi-level approval chain for this invoice.</p>
                <div className="flex flex-wrap items-center gap-2">
                  {approvalSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`px-3 py-1.5 rounded-lg border text-sm ${
                        step.status === 'approved' ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:text-green-300' :
                        step.status === 'rejected' ? 'bg-red-50 border-red-200 text-red-800' :
                        'bg-muted/50 border-muted text-muted-foreground'
                      }`}>
                        <span className="font-medium">{step.role}</span>
                        {step.name && <span className="ml-1 text-xs">({step.name})</span>}
                        <span className="ml-1 text-xs capitalize">— {step.status}</span>
                      </div>
                      {i < approvalSteps.length - 1 && (
                        <span className="text-muted-foreground">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-card z-10 flex justify-between items-center">
              <h2 className="text-xl font-bold">Edit Invoice</h2>
              <Button variant="outline" size="sm" onClick={() => setShowEditModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-6">
              {/* Status */}
              <div>
                <Label>Status</Label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((prev) => ({ ...prev, status: v }))}
                  options={['draft', 'sent', 'paid', 'overdue'].map((s) => ({
                    value: s,
                    label: s.charAt(0).toUpperCase() + s.slice(1),
                  }))}
                  placeholder="Status"
                  aria-label="Invoice status"
                />
              </div>

              {/* Line Items */}
              <div>
                <Label className="mb-2 block">Line Items</Label>
                <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground uppercase px-1 mb-1">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1" />
                </div>
                {editLineItems.map((li, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
                    <div className="col-span-12 md:col-span-5">
                      <Input value={li.description} onChange={e => updateEditLineItem(i, 'description', e.target.value)} placeholder="Description" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input type="number" min="0" step="0.01" value={li.quantity} onChange={e => updateEditLineItem(i, 'quantity', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input type="number" min="0" step="0.01" value={li.unitPrice} onChange={e => updateEditLineItem(i, 'unitPrice', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <Input type="number" min="0" step="0.01" value={li.amount} onChange={e => updateEditLineItem(i, 'amount', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {editLineItems.length > 1 && (
                        <Button type="button" size="sm" variant="ghost" className="text-red-500 hover:text-red-700 p-1 h-auto"
                          onClick={() => setEditLineItems(prev => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setEditLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, amount: 0 }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add Line Item
                </Button>
                <div className="text-right mt-2">
                  <span className="text-sm text-muted-foreground">Total: </span>
                  <span className="font-bold">${editLineItems.reduce((s, li) => s + (li.amount || 0), 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes</Label>
                <textarea
                  className="mt-1 w-full border border-gray-300 rounded-md p-2 min-h-[80px] text-sm"
                  value={editForm.notes}
                  onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              {/* Terms */}
              <div>
                <Label>Terms</Label>
                <textarea
                  className="mt-1 w-full border border-gray-300 rounded-md p-2 min-h-[80px] text-sm"
                  value={editForm.terms}
                  onChange={e => setEditForm(prev => ({ ...prev, terms: e.target.value }))}
                />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <Button className="flex-1" onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
