'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  uid: string;
  email: string;
  fullName: string;
  companyName?: string;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  locationName?: string;
  title: string;
  status: string;
  assignedTo?: string;
  assignedToName?: string;
  scheduledServiceDate?: any;
  estimateBudget?: number;
  createdAt: any;
}

interface Invoice {
  id: string;
  workOrderId?: string;
  clientId?: string;
  invoiceNumber?: string;
  status: string;   // draft | sent | paid | overdue
  totalAmount: number;
  dueDate?: any;
  createdAt: any;
  paidAt?: any;
}

type TabKey = 'all' | 'not-invoiced' | 'invoiced' | 'paid' | 'overdue';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(val: any): string {
  const d = toDate(val);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:    { label: 'Not Invoiced', cls: 'bg-gray-100 text-gray-600' },
    sent:     { label: 'Invoiced',     cls: 'bg-blue-100 text-blue-700' },
    paid:     { label: 'Paid',         cls: 'bg-green-100 text-green-700' },
    overdue:  { label: 'Overdue',      cls: 'bg-red-100 text-red-700' },
    none:     { label: 'Not Invoiced', cls: 'bg-gray-100 text-gray-600' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  // Real-time client doc
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'clients', id), (snap) => {
      if (snap.exists()) {
        setClient({ uid: snap.id, ...snap.data() } as Client);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  // Real-time work orders for this client — fetch all, filter client-side
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(collection(db, 'workOrders'), (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
      setWorkOrders(all.filter((wo) => wo.clientId === id));
    });
    return () => unsub();
  }, [id]);

  // Real-time invoices for this client
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'invoices'), where('clientId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice)));
    });
    return () => unsub();
  }, [id]);

  // ─── Enrich work orders ────────────────────────────────────────────────────

  const enriched = useMemo(() => {
    return workOrders.map((wo) => {
      const invoice = invoices.find((inv) => inv.workOrderId === wo.id);
      const invStatus = invoice?.status ?? 'none';

      let tabCategory: TabKey = 'not-invoiced';
      if (invStatus === 'paid') tabCategory = 'paid';
      else if (invStatus === 'overdue') tabCategory = 'overdue';
      else if (invStatus === 'sent') tabCategory = 'invoiced';
      else tabCategory = 'not-invoiced';

      return {
        ...wo,
        invoice,
        invStatus,
        tabCategory,
        invoiceAmount: invoice?.totalAmount ?? wo.estimateBudget ?? 0,
        dueDate: invoice?.dueDate ?? null,
      };
    });
  }, [workOrders, invoices]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return enriched;
    return enriched.filter((wo) => wo.tabCategory === activeTab);
  }, [enriched, activeTab]);

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalJobs = enriched.length;
    const notInvoicedCount = enriched.filter((w) => w.tabCategory === 'not-invoiced').length;
    const outstandingAmount = enriched
      .filter((w) => w.invStatus === 'sent' || w.invStatus === 'overdue')
      .reduce((s, w) => s + w.invoiceAmount, 0);
    const collectedAmount = enriched
      .filter((w) => w.invStatus === 'paid')
      .reduce((s, w) => s + w.invoiceAmount, 0);
    const overdueAmount = enriched
      .filter((w) => w.invStatus === 'overdue')
      .reduce((s, w) => s + w.invoiceAmount, 0);
    const overdueCount = enriched.filter((w) => w.tabCategory === 'overdue').length;
    return { totalJobs, notInvoicedCount, outstandingAmount, collectedAmount, overdueAmount, overdueCount };
  }, [enriched]);

  // ─── Export CSV ────────────────────────────────────────────────────────────

  const handleExport = () => {
    const rows = filtered.map((wo) => ({
      'WO #': wo.workOrderNumber || wo.id,
      Date: fmtDate(wo.scheduledServiceDate || wo.createdAt),
      Location: wo.locationName || '',
      Title: wo.title,
      'Invoice Amount': wo.invoiceAmount ? wo.invoiceAmount.toFixed(2) : '0.00',
      'Invoice Status': wo.invStatus,
      'Due Date': fmtDate(wo.dueDate),
      'WO Status': wo.status,
    }));
    if (!rows.length) { toast.error('No data to export'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        headers.map((h) => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `client-${id}-jobs.csv`;
    a.click();
    toast.success('CSV exported');
  };

  // ─── Loading / Not Found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (!client) {
    return (
      <AdminLayout>
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">Client not found.</p>
          <Button onClick={() => router.push('/admin-portal/clients')}>Go Back</Button>
        </div>
      </AdminLayout>
    );
  }

  const initials = getInitials(client.companyName || client.fullName);

  const tabs: { key: TabKey; label: string; count: number; danger?: boolean }[] = [
    { key: 'all',          label: 'All',          count: enriched.length },
    { key: 'not-invoiced', label: 'Not Invoiced',  count: enriched.filter((w) => w.tabCategory === 'not-invoiced').length },
    { key: 'invoiced',     label: 'Invoiced',      count: enriched.filter((w) => w.tabCategory === 'invoiced').length },
    { key: 'paid',         label: 'Paid',          count: enriched.filter((w) => w.tabCategory === 'paid').length },
    { key: 'overdue',      label: 'Overdue',       count: stats.overdueCount, danger: true },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  const backButton = (
    <Button
      variant="ghost"
      className="gap-2 text-gray-600 hover:text-gray-900 shrink-0"
      onClick={() => router.push('/admin-portal/clients')}
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Clients
    </Button>
  );

  return (
    <AdminLayout headerExtra={backButton}>
      <div className="space-y-6 max-w-7xl mx-auto pb-10">

        {/* Entity Header */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex items-center gap-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">
              {client.companyName || client.fullName}
            </h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-sm text-gray-500">
              <span>👤 {client.fullName}</span>
              {client.phone && <span>📞 {client.phone}</span>}
              <span>✉️ {client.email}</span>
            </div>
          </div>
          <div className="ml-auto flex-shrink-0">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                client.status === 'approved'
                  ? 'bg-green-100 text-green-700'
                  : client.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {client.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            {
              label: 'Total Jobs',
              value: stats.totalJobs,
              sub: 'All time',
              top: 'bg-blue-500',
            },
            {
              label: 'Outstanding',
              value: fmtMoney(stats.outstandingAmount),
              sub: 'Invoiced + Overdue',
              top: 'bg-yellow-500',
            },
            {
              label: 'Total Collected',
              value: fmtMoney(stats.collectedAmount),
              sub: 'All time',
              top: 'bg-green-500',
            },
            {
              label: 'Overdue',
              value: fmtMoney(stats.overdueAmount),
              sub: `${stats.overdueCount} invoice${stats.overdueCount !== 1 ? 's' : ''} past due`,
              top: 'bg-red-500',
            },
            {
              label: 'Not Invoiced',
              value: stats.notInvoicedCount + ' jobs',
              sub: 'No invoice sent',
              top: 'bg-purple-500',
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 right-0 h-1 ${s.top}`} />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {s.label}
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Work Orders Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Card Header */}
          <div className="px-5 pt-4 pb-0 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-base">Work Orders</h3>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-[-1px]">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                    activeTab === tab.key
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-xs font-bold px-1 ${
                      activeTab === tab.key
                        ? tab.danger
                          ? 'bg-red-100 text-red-600'
                          : 'bg-blue-100 text-blue-600'
                        : tab.danger
                        ? 'bg-red-50 text-red-500'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['WO #', 'Date', 'Location', 'Title', 'Amount', 'Invoice Status', 'Due Date', 'Action'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap border-b border-gray-200"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                      No work orders found for this tab.
                    </td>
                  </tr>
                ) : (
                  filtered.map((wo) => (
                    <tr key={wo.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-blue-600 whitespace-nowrap">
                        {wo.workOrderNumber || wo.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                        {fmtDate(wo.scheduledServiceDate || wo.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 text-gray-700 max-w-[160px] truncate">
                        {wo.locationName || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-gray-700 max-w-[200px] truncate">
                        {wo.title}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-gray-900 whitespace-nowrap">
                        {wo.invoiceAmount > 0 ? fmtMoney(wo.invoiceAmount) : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <InvoiceStatusBadge status={wo.invStatus} />
                      </td>
                      <td
                        className={`px-4 py-3.5 whitespace-nowrap font-medium ${
                          wo.invStatus === 'overdue' ? 'text-red-600' : 'text-gray-600'
                        }`}
                      >
                        {fmtDate(wo.dueDate)}
                      </td>
                      <td className="px-4 py-3.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() =>
                            router.push(`/admin-portal/work-orders/${wo.id}`)
                          }
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
