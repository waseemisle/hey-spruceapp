'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, ExternalLink, Mail, Loader2, Landmark, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subcontractor {
  uid: string;
  email: string;
  fullName: string;
  businessName: string;
  phone: string;
  skills: string[];
  licenseNumber?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  bankAccount?: {
    bankName: string;
    accountHolderName: string;
    accountType: 'checking' | 'savings';
    routingNumber: string;
    accountNumberLast4: string;
    accountNumberEncrypted: string;
    addedAt: any;
    updatedAt: any;
  };
}

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  locationName?: string;
  locationAddress?: any;
  title: string;
  category: string;
  status: string;
  assignedTo?: string;
  scheduledServiceDate?: any;
  estimateBudget?: number;
  createdAt: any;
}

interface Quote {
  id: string;
  workOrderId: string;
  subcontractorId: string;
  amount: number;
  status: string;
  createdAt: any;
}

interface Invoice {
  id: string;
  workOrderId?: string;
  status: string;
  totalAmount: number;
  dueDate?: any;
  createdAt: any;
}

type TabKey = 'all' | 'active' | 'completed' | 'overdue';

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

function WoStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-700' },
    approved:  { label: 'Approved',  cls: 'bg-blue-100 text-blue-700' },
    bidding:   { label: 'Bidding',   cls: 'bg-purple-100 text-purple-700' },
    quotes_received: { label: 'Quotes In', cls: 'bg-indigo-100 text-indigo-700' },
    to_be_started: { label: 'To Be Started', cls: 'bg-cyan-100 text-cyan-700' },
    assigned:  { label: 'Assigned',  cls: 'bg-blue-100 text-blue-700' },
    accepted_by_subcontractor: { label: 'Accepted', cls: 'bg-teal-100 text-teal-700' },
    completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
    rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-700' },
    rejected_by_subcontractor: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubcontractorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [sub, setSub] = useState<Subcontractor | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [resendingInvitation, setResendingInvitation] = useState(false);

  // Real-time subcontractor doc
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'subcontractors', id), (snap) => {
      if (snap.exists()) {
        setSub({ uid: snap.id, ...snap.data() } as Subcontractor);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  // Real-time work orders — fetch all, filter client-side (avoids composite index)
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(collection(db, 'workOrders'), (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
      setWorkOrders(all.filter((wo) => wo.assignedTo === id));
    });
    return () => unsub();
  }, [id]);

  // Real-time quotes by this subcontractor
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'quotes'), where('subcontractorId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      setQuotes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Quote)));
    });
    return () => unsub();
  }, [id]);

  // Real-time all invoices (filter client-side by workOrderId)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'invoices'), (snap) => {
      setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice)));
    });
    return () => unsub();
  }, []);

  // ─── Enrich work orders with quote + invoice data ──────────────────────────

  const enriched = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return workOrders.map((wo) => {
      const acceptedQuote = quotes.find(
        (q) => q.workOrderId === wo.id && q.status === 'accepted'
      );
      const invoice = invoices.find((inv) => inv.workOrderId === wo.id);

      const scheduledDate = toDate(wo.scheduledServiceDate);
      const isPastSchedule = scheduledDate ? scheduledDate < today : false;
      const isCompleted = wo.status === 'completed';
      const isActive = ['assigned', 'to_be_started', 'accepted_by_subcontractor'].includes(wo.status);

      let tabCategory: TabKey = 'active';
      if (isCompleted) {
        tabCategory = 'completed';
      } else if (isPastSchedule && !isCompleted) {
        tabCategory = 'overdue';
      }

      return {
        ...wo,
        quoteAmount: acceptedQuote?.amount ?? 0,
        invoice,
        isActive,
        tabCategory,
      };
    });
  }, [workOrders, quotes, invoices]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return enriched;
    return enriched.filter((wo) => wo.tabCategory === activeTab);
  }, [enriched, activeTab]);

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = enriched.length;
    const active = enriched.filter((w) => w.tabCategory === 'active').length;
    const completed = enriched.filter((w) => w.tabCategory === 'completed').length;
    const overdue = enriched.filter((w) => w.tabCategory === 'overdue').length;
    const totalQuoteValue = enriched.reduce((s, w) => s + w.quoteAmount, 0);
    const paidValue = enriched
      .filter((w) => w.invoice?.status === 'paid')
      .reduce((s, w) => s + w.quoteAmount, 0);
    return { total, active, completed, overdue, totalQuoteValue, paidValue };
  }, [enriched]);

  // ─── Export CSV ────────────────────────────────────────────────────────────

  const handleResendInvitation = async () => {
    if (!sub) return;
    setResendingInvitation(true);
    try {
      const res = await fetch('/api/auth/resend-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sub.email, fullName: sub.fullName, role: 'subcontractor', uid: sub.uid }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
      toast.success('Invitation email resent successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend invitation');
    } finally {
      setResendingInvitation(false);
    }
  };

  const handleExport = () => {
    const rows = filtered.map((wo) => ({
      'WO #': wo.workOrderNumber || wo.id,
      Date: fmtDate(wo.scheduledServiceDate || wo.createdAt),
      Location: wo.locationName || '',
      Title: wo.title,
      'WO Status': wo.status,
      'Quote Amount': wo.quoteAmount ? wo.quoteAmount.toFixed(2) : '0.00',
      'Invoice Status': wo.invoice?.status || 'none',
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
    a.download = `subcontractor-${id}-jobs.csv`;
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

  if (!sub) {
    return (
      <AdminLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">Subcontractor not found.</p>
          <Button onClick={() => router.push('/admin-portal/subcontractors')}>Go Back</Button>
        </div>
      </AdminLayout>
    );
  }

  const initials = getInitials(sub.businessName || sub.fullName);

  const tabs: { key: TabKey; label: string; count: number; danger?: boolean }[] = [
    { key: 'all',       label: 'All',       count: stats.total     },
    { key: 'active',    label: 'Active',    count: stats.active    },
    { key: 'completed', label: 'Completed', count: stats.completed },
    { key: 'overdue',   label: 'Overdue',   count: stats.overdue, danger: true },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-10">
        {/* Back */}
        <Button
          variant="ghost"
          className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => router.push('/admin-portal/subcontractors')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Subcontractors
        </Button>

        {/* Entity Header */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-6 flex items-center gap-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">
              {sub.businessName || sub.fullName}
            </h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-sm text-muted-foreground">
              <span>👤 {sub.fullName}</span>
              {sub.phone && <span>📞 {sub.phone}</span>}
              <span>✉️ {sub.email}</span>
              {sub.licenseNumber && <span>🪪 {sub.licenseNumber}</span>}
              {sub.skills?.length > 0 && (
                <span>
                  🔧{' '}
                  {sub.skills.slice(0, 3).join(', ')}
                  {sub.skills.length > 3 ? ` +${sub.skills.length - 3} more` : ''}
                </span>
              )}
            </div>
          </div>
          <div className="ml-auto flex-shrink-0 flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={handleResendInvitation}
              disabled={resendingInvitation}
            >
              {resendingInvitation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Resend Invitation Email
            </Button>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                sub.status === 'approved'
                  ? 'bg-green-100 text-green-700'
                  : sub.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {sub.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Bank Account Information */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Landmark className="h-4 w-4 text-blue-600" />
            <h3 className="font-semibold text-foreground text-sm">ACH Payment Information</h3>
          </div>
          {sub.bankAccount ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Bank Name</div>
                <div className="font-medium text-foreground mt-0.5">{sub.bankAccount.bankName}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Account Holder</div>
                <div className="font-medium text-foreground mt-0.5">{sub.bankAccount.accountHolderName}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Account Type</div>
                <div className="font-medium text-foreground mt-0.5 capitalize">{sub.bankAccount.accountType}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Routing Number</div>
                <div className="font-medium text-foreground mt-0.5">{sub.bankAccount.routingNumber}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Account Number</div>
                <div className="font-medium text-foreground mt-0.5">••••••••{sub.bankAccount.accountNumberLast4}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>Subcontractor has not added bank account details yet.</span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            {
              label: 'Total Jobs',
              value: stats.total,
              sub: 'All time',
              top: 'bg-blue-500',
            },
            {
              label: 'Active Jobs',
              value: stats.active,
              sub: 'In progress',
              top: 'bg-yellow-500',
            },
            {
              label: 'Completed',
              value: stats.completed,
              sub: 'Done',
              top: 'bg-green-500',
            },
            {
              label: 'Overdue',
              value: stats.overdue,
              sub: 'Past schedule',
              top: 'bg-red-500',
            },
            {
              label: 'Total Quote Value',
              value: fmtMoney(stats.totalQuoteValue),
              sub: 'Accepted quotes',
              top: 'bg-purple-500',
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-card rounded-xl border border-border shadow-sm p-5 relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 right-0 h-1 ${s.top}`} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {s.label}
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Work Orders Card */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Card Header */}
          <div className="px-5 pt-4 pb-0 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground text-base">Work Orders</h3>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit mb-[-1px]">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                    activeTab === tab.key
                      ? 'bg-card text-blue-600 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
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
                        : 'bg-gray-200 text-muted-foreground'
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
              <thead className="bg-muted">
                <tr>
                  {['WO #', 'Date', 'Location', 'Title', 'Quote Amount', 'Status', 'Scheduled', 'Action'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-b border-border"
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
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      No work orders found for this tab.
                    </td>
                  </tr>
                ) : (
                  filtered.map((wo) => (
                    <tr key={wo.id} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-blue-600 whitespace-nowrap">
                        {wo.workOrderNumber || wo.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                        {fmtDate(wo.scheduledServiceDate || wo.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 text-foreground max-w-[160px] truncate">
                        {wo.locationName || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-foreground max-w-[200px] truncate">
                        {wo.title}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-foreground whitespace-nowrap">
                        {wo.quoteAmount > 0 ? fmtMoney(wo.quoteAmount) : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <WoStatusBadge status={wo.status} />
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                        {fmtDate(wo.scheduledServiceDate)}
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
