'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BarChart2, Download, Save, Filter, ClipboardList, Receipt,
  FileText, Users, Building2, TrendingUp, AlertCircle, CheckCircle,
  Clock, X, RefreshCw, ChevronDown, ChevronUp, ChevronRight,
  DollarSign, Activity, Layers, PieChart
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  clientId: string;
  clientName: string;
  companyId?: string;
  companyName?: string;
  assignedTo?: string;
  assignedToName?: string;
  isMaintenanceRequestOrder?: boolean;
  estimateBudget?: number;
  createdAt: any;
  scheduledServiceDate?: any;
}

interface Invoice {
  id: string;
  invoiceNumber?: string;
  clientId: string;
  clientName: string;
  workOrderId?: string;
  subcontractorId?: string;
  subcontractorName?: string;
  status: string;
  totalAmount: number;
  dueDate?: any;
  createdAt: any;
  paidAt?: any;
  updatedAt?: any;
}

interface Quote {
  id: string;
  workOrderId: string;
  subcontractorId: string;
  subcontractorName?: string;
  businessName?: string;
  amount: number;
  clientAmount?: number;
  totalAmount?: number;
  clientId?: string;
  clientName?: string;
  status: string;
  createdAt: any;
}

interface Client {
  id: string;
  fullName: string;
  email: string;
  companyName?: string;
}

interface Subcontractor {
  id: string;
  fullName: string;
  email: string;
  businessName?: string;
  status: string;
}

interface SavedSearch {
  id: string;
  name: string;
  filters: FilterState;
  tab: string;
  createdAt: string;
}

interface FilterState {
  dateFrom: string;
  dateTo: string;
  period: string;   // 'custom' | 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter' | 'this-year'
  clientId: string;
  subcontractorId: string;
  status: string;
  priority: string;
  category: string;
  woType: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SAVED_SEARCHES_KEY = 'spruce_report_saved_searches_v2';

const AGING_BUCKETS = ['Current', '1–7 days', '8–14 days', '15–30 days', '31–60 days', '60+ days'] as const;
type AgingBucket = typeof AGING_BUCKETS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(val: any) {
  const d = toDate(val);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function ageBucket(dueDate: Date | null): AgingBucket {
  if (!dueDate) return 'Current';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
  if (days <= 0) return 'Current';
  if (days <= 7) return '1–7 days';
  if (days <= 14) return '8–14 days';
  if (days <= 30) return '15–30 days';
  if (days <= 60) return '31–60 days';
  return '60+ days';
}

function periodDates(period: string, dateFrom: string, dateTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (period === 'custom') {
    return { from: dateFrom ? new Date(dateFrom) : null, to: dateTo ? (() => { const d = new Date(dateTo); d.setHours(23,59,59,999); return d; })() : null };
  }
  if (period === 'this-month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
  }
  if (period === 'last-month') {
    return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
  }
  if (period === 'this-quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return { from: new Date(now.getFullYear(), q * 3, 1), to: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59) };
  }
  if (period === 'last-quarter') {
    const q = Math.floor(now.getMonth() / 3) - 1;
    const yr = q < 0 ? now.getFullYear() - 1 : now.getFullYear();
    const aq = (q + 4) % 4;
    return { from: new Date(yr, aq * 3, 1), to: new Date(yr, aq * 3 + 3, 0, 23, 59, 59) };
  }
  if (period === 'this-year') {
    return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
  }
  return { from: null, to: null };
}

function inPeriod(val: any, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  const d = toDate(val);
  if (!d) return true;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function exportCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) { toast.error('No data to export'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click();
  toast.success('CSV exported');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, negative }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; negative?: boolean;
}) {
  const bg = color.replace('text-', 'bg-').replace('-700', '-100').replace('-600', '-100').replace('-500', '-100');
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className={`text-xl font-bold mt-1 ${negative ? 'text-red-600' : color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg shrink-0 ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, count, onExport, children }: {
  title: string; count?: number; onExport?: () => void; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
      <h3 className="font-semibold text-base">
        {title}{count !== undefined && <span className="text-muted-foreground text-sm font-normal ml-1">({count})</span>}
      </h3>
      <div className="flex items-center gap-2">
        {children}
        {onExport && (
          <Button size="sm" variant="outline" onClick={onExport}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    assigned: 'bg-indigo-100 text-indigo-800',
    bidding: 'bg-purple-100 text-purple-800',
    quotes_received: 'bg-orange-100 text-orange-800',
    to_be_started: 'bg-cyan-100 text-cyan-800',
    accepted_by_subcontractor: 'bg-teal-100 text-teal-800',
    rejected_by_subcontractor: 'bg-rose-100 text-rose-800',
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-700',
    accepted: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function AgingBadge({ bucket }: { bucket: AgingBucket }) {
  const map: Record<AgingBucket, string> = {
    'Current': 'bg-green-100 text-green-800',
    '1–7 days': 'bg-yellow-100 text-yellow-800',
    '8–14 days': 'bg-orange-100 text-orange-800',
    '15–30 days': 'bg-red-100 text-red-700',
    '31–60 days': 'bg-red-200 text-red-800',
    '60+ days': 'bg-red-300 text-red-900 font-semibold',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[bucket]}`}>
      {bucket}
    </span>
  );
}

function ProgressBar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ReportTab = 'overview' | 'pl' | 'clients' | 'subcontractors' | 'service-revenue' | 'aging' | 'work-orders' | 'quotes' | 'invoices';

const TABS: { id: ReportTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',       label: 'Overview',         icon: BarChart2 },
  { id: 'pl',             label: 'P&L Statement',    icon: DollarSign },
  { id: 'clients',        label: 'Clients',          icon: Users },
  { id: 'subcontractors', label: 'Subcontractors',   icon: Building2 },
  { id: 'service-revenue',label: 'Service Revenue',  icon: PieChart },
  { id: 'aging',          label: 'Aging Report',     icon: Clock },
  { id: 'work-orders',    label: 'Work Orders',      icon: ClipboardList },
  { id: 'quotes',         label: 'Quotes',           icon: FileText },
  { id: 'invoices',       label: 'Invoices',         icon: Receipt },
];

export default function ReportsPage() {
  // ── Raw data ────────────────────────────────────────────────────────────────
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [quotes,     setQuotes]     = useState<Quote[]>([]);
  const [clients,    setClients]    = useState<Client[]>([]);
  const [subs,       setSubs]       = useState<Subcontractor[]>([]);
  const [loading,    setLoading]    = useState(true);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab,       setActiveTab]       = useState<ReportTab>('overview');
  const [showFilters,     setShowFilters]     = useState(true);
  const [savedSearches,   setSavedSearches]   = useState<SavedSearch[]>([]);
  const [saveSearchName,  setSaveSearchName]  = useState('');
  const [showSaveDialog,  setShowSaveDialog]  = useState(false);
  const [plBasis,         setPlBasis]         = useState<'accrual' | 'cash'>('accrual');
  const [expandedClientId,setExpandedClientId]= useState<string | null>(null);
  const [expandedSubId,   setExpandedSubId]   = useState<string | null>(null);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>({
    period: 'this-year',
    dateFrom: '', dateTo: '',
    clientId: '', subcontractorId: '',
    status: '', priority: '', category: '', woType: 'all',
  });
  const setF = (patch: Partial<FilterState>) => setFilters(f => ({ ...f, ...patch }));

  // ── Load saved searches ──────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
      if (raw) setSavedSearches(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // ── Fetch all data ───────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [woSnap, invSnap, qSnap, cSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, 'workOrders'),     orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'invoices'))),
        getDocs(query(collection(db, 'quotes'))),
        getDocs(query(collection(db, 'clients'))),
        getDocs(query(collection(db, 'subcontractors'))),
      ]);
      setWorkOrders(woSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkOrder)));
      setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
      setQuotes(qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Quote)));
      setClients(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
      setSubs(sSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subcontractor)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Period range ─────────────────────────────────────────────────────────────
  const { from: periodFrom, to: periodTo } = useMemo(
    () => periodDates(filters.period, filters.dateFrom, filters.dateTo),
    [filters.period, filters.dateFrom, filters.dateTo]
  );

  // ── Build WO lookup map ──────────────────────────────────────────────────────
  const woMap = useMemo(() => {
    const m = new Map<string, WorkOrder>();
    workOrders.forEach(w => m.set(w.id, w));
    return m;
  }, [workOrders]);

  // ── Filtered slices ──────────────────────────────────────────────────────────
  const filteredWO = useMemo(() => workOrders.filter(w => {
    if (!inPeriod(w.createdAt, periodFrom, periodTo)) return false;
    if (filters.clientId    && w.clientId  !== filters.clientId)    return false;
    if (filters.status      && w.status    !== filters.status)      return false;
    if (filters.priority    && w.priority  !== filters.priority)    return false;
    if (filters.category    && w.category  !== filters.category)    return false;
    if (filters.woType === 'standard'    &&  w.isMaintenanceRequestOrder) return false;
    if (filters.woType === 'maintenance' && !w.isMaintenanceRequestOrder) return false;
    return true;
  }), [workOrders, filters, periodFrom, periodTo]);

  const filteredInv = useMemo(() => invoices.filter(i => {
    if (!inPeriod(i.createdAt, periodFrom, periodTo)) return false;
    if (filters.clientId        && i.clientId        !== filters.clientId)        return false;
    if (filters.subcontractorId && i.subcontractorId !== filters.subcontractorId) return false;
    if (filters.status          && i.status          !== filters.status)          return false;
    return true;
  }), [invoices, filters, periodFrom, periodTo]);

  const filteredQ = useMemo(() => quotes.filter(q => {
    if (!inPeriod(q.createdAt, periodFrom, periodTo)) return false;
    if (filters.subcontractorId && q.subcontractorId !== filters.subcontractorId) return false;
    if (filters.status          && q.status          !== filters.status)          return false;
    return true;
  }), [quotes, filters, periodFrom, periodTo]);

  // ── Unique filter values ─────────────────────────────────────────────────────
  const categories  = useMemo(() => Array.from(new Set(workOrders.map(w => w.category).filter(Boolean))).sort(), [workOrders]);
  const woStatuses  = useMemo(() => Array.from(new Set(workOrders.map(w => w.status).filter(Boolean))), [workOrders]);
  const invStatuses = useMemo(() => Array.from(new Set(invoices.map(i => i.status).filter(Boolean))), [invoices]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── P & L CALCULATIONS ───────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  const acceptedQuotes = useMemo(() => quotes.filter(q => q.status === 'accepted'), [quotes]);

  // Accrual: revenue = invoices in period; COGS = accepted quotes in period
  const accrualRevenue = useMemo(() =>
    filteredInv.reduce((s, i) => s + (i.totalAmount || 0), 0), [filteredInv]);

  // Revenue by category (link invoice → workOrder → category)
  const accrualByCategory = useMemo(() => {
    const map = new Map<string, number>();
    filteredInv.forEach(inv => {
      const wo = inv.workOrderId ? woMap.get(inv.workOrderId) : undefined;
      const cat = wo?.category || 'Uncategorized';
      map.set(cat, (map.get(cat) ?? 0) + (inv.totalAmount || 0));
    });
    return Array.from(map.entries()).map(([cat, rev]) => ({ cat, rev })).sort((a, b) => b.rev - a.rev);
  }, [filteredInv, woMap]);

  // COGS = accepted quotes in period (vendor costs)
  const accrualCOGS = useMemo(() =>
    filteredQ.filter(q => q.status === 'accepted').reduce((s, q) => s + (q.amount || 0), 0),
    [filteredQ]);

  const accrualProfit = accrualRevenue - accrualCOGS;
  const accrualMargin = accrualRevenue > 0 ? (accrualProfit / accrualRevenue) * 100 : 0;

  // Cash: cash-in = paid invoices in period; cash-out = accepted quotes for completed WOs in period
  const cashIn = useMemo(() =>
    filteredInv.filter(i => i.status === 'paid').reduce((s, i) => s + (i.totalAmount || 0), 0),
    [filteredInv]);

  const cashInCurrent = useMemo(() =>
    filteredInv.filter(i => i.status === 'paid' && (() => {
      const wo = i.workOrderId ? woMap.get(i.workOrderId) : undefined;
      return inPeriod(i.createdAt, periodFrom, periodTo) && (!wo || inPeriod(wo.createdAt, periodFrom, periodTo));
    })()).reduce((s, i) => s + (i.totalAmount || 0), 0),
    [filteredInv, woMap, periodFrom, periodTo]);

  const cashInPrior = cashIn - cashInCurrent;

  const cashOut = useMemo(() =>
    filteredQ.filter(q => q.status === 'accepted' && (() => {
      const wo = woMap.get(q.workOrderId);
      return wo?.status === 'completed';
    })()).reduce((s, q) => s + (q.amount || 0), 0),
    [filteredQ, woMap]);

  const cashFlow = cashIn - cashOut;

  // ─────────────────────────────────────────────────────────────────────────────
  // ── CLIENT REPORT ────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  const clientReport = useMemo(() => {
    return clients.map(c => {
      const cInv  = invoices.filter(i => i.clientId === c.id);
      const cWO   = workOrders.filter(w => w.clientId === c.id);
      const totalBilled   = cInv.reduce((s, i) => s + (i.totalAmount || 0), 0);
      const collected     = cInv.filter(i => i.status === 'paid').reduce((s, i) => s + (i.totalAmount || 0), 0);
      const outstanding   = cInv.filter(i => ['sent', 'draft', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.totalAmount || 0), 0);
      const overdue       = cInv.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.totalAmount || 0), 0);
      const netReceivable = outstanding;

      // Aging buckets for this client's unpaid invoices
      const aging: Record<AgingBucket, number> = { 'Current': 0, '1–7 days': 0, '8–14 days': 0, '15–30 days': 0, '31–60 days': 0, '60+ days': 0 };
      cInv.filter(i => i.status !== 'paid').forEach(i => {
        const bucket = ageBucket(toDate(i.dueDate));
        aging[bucket] = (aging[bucket] ?? 0) + (i.totalAmount || 0);
      });

      // Payment days average
      const paidInvs = cInv.filter(i => i.status === 'paid' && i.dueDate && i.createdAt);
      const avgDays = paidInvs.length
        ? Math.round(paidInvs.reduce((s, i) => {
            const created = toDate(i.createdAt);
            const due = toDate(i.dueDate);
            return s + (created && due ? (due.getTime() - created.getTime()) / 86400000 : 0);
          }, 0) / paidInvs.length)
        : null;

      return { id: c.id, name: c.fullName, company: c.companyName || '',
        workOrders: cWO.length, completed: cWO.filter(w => w.status === 'completed').length,
        invoices: cInv.length, totalBilled, collected, outstanding, overdue, netReceivable, aging, avgDays,
        invoiceList: cInv };
    }).filter(c => c.totalBilled > 0 || c.workOrders > 0).sort((a, b) => b.totalBilled - a.totalBilled);
  }, [clients, invoices, workOrders]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── SUBCONTRACTOR REPORT ─────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  const subReport = useMemo(() => {
    return subs.map(s => {
      const sQuotes = quotes.filter(q => q.subcontractorId === s.id);
      const sInv    = invoices.filter(i => i.subcontractorId === s.id);
      const accepted       = sQuotes.filter(q => q.status === 'accepted');
      const totalAssigned  = accepted.reduce((sum, q) => sum + (q.amount || 0), 0);
      const paidOut        = sInv.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.totalAmount || 0), 0);
      const outstanding    = sInv.filter(i => ['sent', 'draft'].includes(i.status)).reduce((sum, i) => sum + (i.totalAmount || 0), 0);
      const overdue        = sInv.filter(i => i.status === 'overdue').reduce((sum, i) => sum + (i.totalAmount || 0), 0);
      const netPayable     = outstanding + overdue;

      // Aging of unpaid vendor invoices
      const aging: Record<AgingBucket, number> = { 'Current': 0, '1–7 days': 0, '8–14 days': 0, '15–30 days': 0, '31–60 days': 0, '60+ days': 0 };
      sInv.filter(i => i.status !== 'paid').forEach(i => {
        const bucket = ageBucket(toDate(i.dueDate));
        aging[bucket] = (aging[bucket] ?? 0) + (i.totalAmount || 0);
      });

      // Per-client breakdown: accepted quotes → workOrder → client
      const clientBreakdown = new Map<string, { clientName: string; jobs: number; vendorAmt: number; paid: number }>();
      accepted.forEach(q => {
        const wo = woMap.get(q.workOrderId);
        if (!wo) return;
        const existing = clientBreakdown.get(wo.clientId) ?? { clientName: wo.clientName, jobs: 0, vendorAmt: 0, paid: 0 };
        existing.jobs++;
        existing.vendorAmt += q.amount || 0;
        // paid = vendor invoices for this work order
        const inv = invoices.find(i => i.workOrderId === wo.id && i.subcontractorId === s.id && i.status === 'paid');
        existing.paid += inv?.totalAmount ?? 0;
        clientBreakdown.set(wo.clientId, existing);
      });

      const acceptanceRate = sQuotes.length ? Math.round(accepted.length / sQuotes.length * 100) : 0;

      return { id: s.id, name: s.fullName, business: s.businessName || '', status: s.status,
        quotes: sQuotes.length, accepted: accepted.length, acceptanceRate,
        totalAssigned, paidOut, outstanding, overdue, netPayable, aging,
        clientBreakdown: Array.from(clientBreakdown.values()).sort((a, b) => b.vendorAmt - a.vendorAmt) };
    }).filter(s => s.quotes > 0 || s.totalAssigned > 0).sort((a, b) => b.totalAssigned - a.totalAssigned);
  }, [subs, quotes, invoices, woMap]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── SERVICE REVENUE REPORT ───────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  const serviceRevenue = useMemo(() => {
    return categories.map(cat => {
      const catWO   = filteredWO.filter(w => w.category === cat);
      const catInv  = filteredInv.filter(i => {
        const wo = i.workOrderId ? woMap.get(i.workOrderId) : undefined;
        return wo?.category === cat;
      });
      const catQ = filteredQ.filter(q => {
        const wo = woMap.get(q.workOrderId);
        return wo?.category === cat && q.status === 'accepted';
      });
      const revenue    = catInv.reduce((s, i) => s + (i.totalAmount || 0), 0);
      const cost       = catQ.reduce((s, q) => s + (q.amount || 0), 0);
      const profit     = revenue - cost;
      const margin     = revenue > 0 ? (profit / revenue) * 100 : 0;
      return { cat, jobs: catWO.length, revenue, cost, profit, margin };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [categories, filteredWO, filteredInv, filteredQ, woMap]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── COMBINED AGING REPORT ────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  const agingAR = useMemo(() => {
    const buckets: Record<AgingBucket, { count: number; amount: number }> = {
      'Current': { count: 0, amount: 0 }, '1–7 days': { count: 0, amount: 0 },
      '8–14 days': { count: 0, amount: 0 }, '15–30 days': { count: 0, amount: 0 },
      '31–60 days': { count: 0, amount: 0 }, '60+ days': { count: 0, amount: 0 },
    };
    invoices.filter(i => i.status !== 'paid').forEach(i => {
      const b = ageBucket(toDate(i.dueDate));
      buckets[b].count++;
      buckets[b].amount += i.totalAmount || 0;
    });
    return buckets;
  }, [invoices]);

  const agingAP = useMemo(() => {
    const buckets: Record<AgingBucket, { count: number; amount: number }> = {
      'Current': { count: 0, amount: 0 }, '1–7 days': { count: 0, amount: 0 },
      '8–14 days': { count: 0, amount: 0 }, '15–30 days': { count: 0, amount: 0 },
      '31–60 days': { count: 0, amount: 0 }, '60+ days': { count: 0, amount: 0 },
    };
    // AP = vendor invoices not yet paid (invoices assigned to subcontractors)
    invoices.filter(i => i.subcontractorId && i.status !== 'paid').forEach(i => {
      const b = ageBucket(toDate(i.dueDate));
      buckets[b].count++;
      buckets[b].amount += i.totalAmount || 0;
    });
    return buckets;
  }, [invoices]);

  const totalAR = useMemo(() => Object.values(agingAR).reduce((s, v) => s + v.amount, 0), [agingAR]);
  const totalAP = useMemo(() => Object.values(agingAP).reduce((s, v) => s + v.amount, 0), [agingAP]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── OVERVIEW KPIs ────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  const totalInvoiced  = filteredInv.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const totalPaid      = filteredInv.filter(i => i.status === 'paid').reduce((s, i) => s + (i.totalAmount || 0), 0);
  const totalOverdue   = filteredInv.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.totalAmount || 0), 0);
  const completedWO    = filteredWO.filter(w => w.status === 'completed').length;
  const pendingWO      = filteredWO.filter(w => w.status === 'pending').length;
  const acceptedQ      = filteredQ.filter(q => q.status === 'accepted').length;
  const acceptRate     = filteredQ.length ? Math.round(acceptedQ / filteredQ.length * 100) : 0;
  const woByStatus     = woStatuses.map(s => ({ status: s, count: filteredWO.filter(w => w.status === s).length })).sort((a, b) => b.count - a.count);
  const invByStatus    = invStatuses.map(s => ({ status: s, count: filteredInv.filter(i => i.status === s).length, total: filteredInv.filter(i => i.status === s).reduce((sum, i) => sum + (i.totalAmount || 0), 0) })).sort((a, b) => b.total - a.total);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── SAVED SEARCHES ───────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  const saveSearch = () => {
    if (!saveSearchName.trim()) { toast.error('Enter a name'); return; }
    const entry: SavedSearch = { id: Date.now().toString(), name: saveSearchName.trim(), filters: { ...filters }, tab: activeTab, createdAt: new Date().toISOString() };
    const updated = [...savedSearches, entry];
    setSavedSearches(updated);
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated));
    setSaveSearchName(''); setShowSaveDialog(false);
    toast.success('Search saved');
  };

  const deleteSearch = (id: string) => {
    const updated = savedSearches.filter(s => s.id !== id);
    setSavedSearches(updated);
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // ── CSV EXPORTS ──────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  const dte = () => new Date().toISOString().slice(0, 10);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── RENDER ───────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-5">

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Reports & Analytics</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Comprehensive reporting — P&amp;L, client receivables, vendor payables, aging analysis, and more.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={fetchAll} loading={loading} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(v => !v)}>
              <Save className="h-4 w-4 mr-1" /> Save Search
            </Button>
          </div>
        </div>

        {/* ── Saved Searches ──────────────────────────────────────────────── */}
        {showSaveDialog && (
          <Card className="border-primary/40">
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-2">Name this saved search</p>
              <div className="flex gap-2">
                <Input value={saveSearchName} onChange={e => setSaveSearchName(e.target.value)}
                  placeholder="e.g. Q1 2026 – Overdue Clients"
                  onKeyDown={e => e.key === 'Enter' && saveSearch()} className="flex-1" />
                <Button size="sm" onClick={saveSearch}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowSaveDialog(false)}><X className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {savedSearches.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium">Saved:</span>
            {savedSearches.map(s => (
              <div key={s.id} className="flex items-center gap-1 bg-muted rounded-full px-3 py-1 text-xs">
                <button onClick={() => { setFilters(s.filters); setActiveTab(s.tab as ReportTab); toast.success(`Loaded: ${s.name}`); }}
                  className="hover:text-primary font-medium">{s.name}</button>
                <span className="text-muted-foreground">({s.tab})</span>
                <button onClick={() => deleteSearch(s.id)} className="ml-1 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}

        {/* ── Filters Panel ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Filter className="h-4 w-4" /> Filters
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setF({ period: 'this-year', dateFrom: '', dateTo: '', clientId: '', subcontractorId: '', status: '', priority: '', category: '', woType: 'all' })}>
                  <X className="h-3 w-3 mr-1" /> Reset
                </Button>
                <Button variant="ghost" size="sm" className="h-7" onClick={() => setShowFilters(v => !v)}>
                  {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          {showFilters && (
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {/* Period */}
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs mb-1 block">Period</Label>
                  <select className="w-full border rounded-md px-2 py-2 text-sm bg-background" value={filters.period}
                    onChange={e => setF({ period: e.target.value })}>
                    <option value="this-month">This Month</option>
                    <option value="last-month">Last Month</option>
                    <option value="this-quarter">This Quarter</option>
                    <option value="last-quarter">Last Quarter</option>
                    <option value="this-year">This Year</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                {filters.period === 'custom' && (<>
                  <div>
                    <Label className="text-xs mb-1 block">Date From</Label>
                    <Input type="date" value={filters.dateFrom} onChange={e => setF({ dateFrom: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Date To</Label>
                    <Input type="date" value={filters.dateTo} onChange={e => setF({ dateTo: e.target.value })} />
                  </div>
                </>)}
                <div>
                  <Label className="text-xs mb-1 block">Client</Label>
                  <select className="w-full border rounded-md px-2 py-2 text-sm bg-background" value={filters.clientId}
                    onChange={e => setF({ clientId: e.target.value })}>
                    <option value="">All Clients</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Subcontractor</Label>
                  <select className="w-full border rounded-md px-2 py-2 text-sm bg-background" value={filters.subcontractorId}
                    onChange={e => setF({ subcontractorId: e.target.value })}>
                    <option value="">All Subcontractors</option>
                    {subs.map(s => <option key={s.id} value={s.id}>{s.fullName}{s.businessName ? ` (${s.businessName})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">WO Type</Label>
                  <select className="w-full border rounded-md px-2 py-2 text-sm bg-background" value={filters.woType}
                    onChange={e => setF({ woType: e.target.value })}>
                    <option value="all">All</option>
                    <option value="standard">Standard</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Status</Label>
                  <select className="w-full border rounded-md px-2 py-2 text-sm bg-background" value={filters.status}
                    onChange={e => setF({ status: e.target.value })}>
                    <option value="">All</option>
                    {[...new Set([...woStatuses, ...invStatuses])].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Priority</Label>
                  <select className="w-full border rounded-md px-2 py-2 text-sm bg-background" value={filters.priority}
                    onChange={e => setF({ priority: e.target.value })}>
                    <option value="">All</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Category</Label>
                  <select className="w-full border rounded-md px-2 py-2 text-sm bg-background" value={filters.category}
                    onChange={e => setF({ category: e.target.value })}>
                    <option value="">All Categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ── Tabs Bar ────────────────────────────────────────────────────── */}
        <div className="flex overflow-x-auto gap-0 border-b">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <t.icon className="h-3.5 w-3.5 shrink-0" />{t.label}
            </button>
          ))}
        </div>

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">Loading report data…</p>
            </div>
          </div>
        ) : (
        <>

        {/* ══════════════════════════════════════════════════════════════════
            OVERVIEW TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* KPIs Row 1 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard label="Total Work Orders" value={filteredWO.length} sub={`${pendingWO} pending`} icon={ClipboardList} color="text-blue-600" />
              <KpiCard label="Completed WOs" value={completedWO} sub={filteredWO.length ? `${Math.round(completedWO/filteredWO.length*100)}%` : '0%'} icon={CheckCircle} color="text-green-600" />
              <KpiCard label="Total Invoiced" value={`$${fmtMoney(totalInvoiced)}`} sub={`${filteredInv.length} invoices`} icon={Receipt} color="text-orange-600" />
              <KpiCard label="Collected" value={`$${fmtMoney(totalPaid)}`} sub={`${filteredInv.filter(i=>i.status==='paid').length} paid`} icon={TrendingUp} color="text-emerald-600" />
              <KpiCard label="Overdue" value={`$${fmtMoney(totalOverdue)}`} sub={`${filteredInv.filter(i=>i.status==='overdue').length} invoices`} icon={AlertCircle} color="text-red-600" negative />
            </div>
            {/* KPIs Row 2 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Accrual Revenue" value={`$${fmtMoney(accrualRevenue)}`} icon={DollarSign} color="text-blue-700" />
              <KpiCard label="Accrual COGS" value={`$${fmtMoney(accrualCOGS)}`} icon={Building2} color="text-orange-600" />
              <KpiCard label="Gross Profit" value={`$${fmtMoney(accrualProfit)}`} sub={`${accrualMargin.toFixed(1)}% margin`} icon={TrendingUp} color="text-green-600" negative={accrualProfit < 0} />
              <KpiCard label="Quote Accept Rate" value={`${acceptRate}%`} sub={`${acceptedQ}/${filteredQ.length} quotes`} icon={FileText} color="text-purple-600" />
            </div>

            {/* WO Status */}
            <Card>
              <CardHeader><CardTitle className="text-base">Work Order Status Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {woByStatus.map(row => (
                  <div key={row.status} className="flex items-center gap-3">
                    <div className="w-40 shrink-0"><StatusBadge status={row.status} /></div>
                    <ProgressBar value={row.count} max={filteredWO.length} />
                    <span className="text-sm font-medium w-8 text-right">{row.count}</span>
                  </div>
                ))}
                {woByStatus.length === 0 && <p className="text-sm text-muted-foreground">No data for this period.</p>}
              </CardContent>
            </Card>

            {/* Invoice Status */}
            <Card>
              <CardHeader><CardTitle className="text-base">Invoice Revenue by Status</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {invByStatus.map(row => (
                  <div key={row.status} className="flex items-center gap-3">
                    <div className="w-24 shrink-0"><StatusBadge status={row.status} /></div>
                    <ProgressBar value={row.total} max={totalInvoiced} color="bg-orange-500" />
                    <span className="text-xs text-muted-foreground w-6 text-right">{row.count}</span>
                    <span className="text-sm font-medium font-mono w-28 text-right">${fmtMoney(row.total)}</span>
                  </div>
                ))}
                {invByStatus.length === 0 && <p className="text-sm text-muted-foreground">No invoice data for this period.</p>}
              </CardContent>
            </Card>

            {/* Service Margin Summary */}
            {serviceRevenue.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Revenue by Service Type</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b">
                      <th className="text-left py-2 text-muted-foreground font-medium">Service</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Jobs</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Revenue</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Cost</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Profit</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Margin</th>
                    </tr></thead>
                    <tbody>
                      {serviceRevenue.map(r => (
                        <tr key={r.cat} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="py-2 font-medium">{r.cat}</td>
                          <td className="py-2 text-right text-muted-foreground">{r.jobs}</td>
                          <td className="py-2 text-right font-mono text-xs">${fmtMoney(r.revenue)}</td>
                          <td className="py-2 text-right font-mono text-xs text-red-600">({fmtMoney(r.cost)})</td>
                          <td className={`py-2 text-right font-mono text-xs font-semibold ${r.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>${fmtMoney(r.profit)}</td>
                          <td className={`py-2 text-right text-xs font-semibold ${r.margin >= 30 ? 'text-green-600' : r.margin >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>{r.margin.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            P&L STATEMENT TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'pl' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <SectionHeader title="Profit & Loss Statement" />
              <div className="flex rounded-lg overflow-hidden border">
                <button onClick={() => setPlBasis('accrual')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${plBasis === 'accrual' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                  Accrual Basis
                </button>
                <button onClick={() => setPlBasis('cash')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${plBasis === 'cash' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                  Cash Basis
                </button>
              </div>
            </div>

            {plBasis === 'accrual' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Accrual P&L */}
                <Card className="border-green-200 dark:border-green-900">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-md">ACCRUAL BASIS</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Revenue recognized on <strong>service date</strong>, regardless of payment collection.</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-0">
                      {/* Revenue */}
                      <div className="flex justify-between py-2.5 border-b font-semibold">
                        <span>Revenue (Invoiced)</span>
                        <span className="font-mono text-green-600">${fmtMoney(accrualRevenue)}</span>
                      </div>
                      {accrualByCategory.map(r => (
                        <div key={r.cat} className="flex justify-between py-1.5 text-sm text-muted-foreground pl-4">
                          <span>{r.cat}</span>
                          <span className="font-mono">${fmtMoney(r.rev)}</span>
                        </div>
                      ))}
                      {/* COGS */}
                      <div className="flex justify-between py-2.5 border-t border-b font-semibold mt-1">
                        <span>COGS — Vendor / Subcontractor Costs</span>
                        <span className="font-mono text-red-600">({fmtMoney(accrualCOGS)})</span>
                      </div>
                      {/* Gross Profit */}
                      <div className="flex justify-between py-3 border-t-2 border-green-500 mt-2">
                        <span className="font-bold text-green-700">GROSS PROFIT</span>
                        <span className={`font-bold text-lg font-mono ${accrualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>${fmtMoney(accrualProfit)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-sm">
                        <span className="text-muted-foreground">Profit Margin</span>
                        <span className={`font-semibold ${accrualMargin >= 20 ? 'text-green-600' : 'text-yellow-600'}`}>{accrualMargin.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg text-xs text-muted-foreground">
                      <p className="font-semibold text-green-700 dark:text-green-400 mb-1">📌 Accrual Logic</p>
                      Revenue = SUM(invoice.totalAmount) in period<br/>
                      COGS = SUM(accepted quote amounts) in period<br/>
                      Service date = revenue recognition date
                    </div>
                  </CardContent>
                </Card>

                {/* Period comparison KPIs */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <KpiCard label="Gross Revenue" value={`$${fmtMoney(accrualRevenue)}`} icon={DollarSign} color="text-blue-600" />
                    <KpiCard label="Total COGS" value={`$${fmtMoney(accrualCOGS)}`} icon={Building2} color="text-orange-600" />
                    <KpiCard label="Gross Profit" value={`$${fmtMoney(accrualProfit)}`} icon={TrendingUp} color="text-green-600" negative={accrualProfit < 0} />
                    <KpiCard label="Margin %" value={`${accrualMargin.toFixed(1)}%`} icon={Activity} color="text-purple-600" />
                  </div>
                  {/* Revenue by category bars */}
                  <Card>
                    <CardHeader><CardTitle className="text-sm">Revenue by Service Category</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {accrualByCategory.map(r => (
                        <div key={r.cat} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-28 truncate shrink-0">{r.cat}</span>
                          <ProgressBar value={r.rev} max={accrualRevenue} color="bg-blue-500" />
                          <span className="text-xs font-mono w-24 text-right shrink-0">${fmtMoney(r.rev)}</span>
                        </div>
                      ))}
                      {accrualByCategory.length === 0 && <p className="text-sm text-muted-foreground">No invoices linked to work orders in this period.</p>}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              /* CASH BASIS */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card className="border-blue-200 dark:border-blue-900">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-md">CASH BASIS</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Revenue recognized on <strong>payment received date</strong>. Expenses when vendor is paid.</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-0">
                      <div className="flex justify-between py-2.5 border-b font-semibold">
                        <span>Cash Received (Collections)</span>
                        <span className="font-mono text-blue-600">${fmtMoney(cashIn)}</span>
                      </div>
                      <div className="flex justify-between py-1.5 text-sm text-muted-foreground pl-4">
                        <span>From current-period invoices</span>
                        <span className="font-mono">${fmtMoney(cashInCurrent)}</span>
                      </div>
                      <div className="flex justify-between py-1.5 text-sm text-muted-foreground pl-4">
                        <span>From prior-period invoices</span>
                        <span className="font-mono">${fmtMoney(cashInPrior)}</span>
                      </div>
                      <div className="flex justify-between py-2.5 border-t border-b font-semibold mt-1">
                        <span>Cash Paid (Vendor Costs)</span>
                        <span className="font-mono text-red-600">({fmtMoney(cashOut)})</span>
                      </div>
                      <div className="flex justify-between py-3 border-t-2 border-blue-500 mt-2">
                        <span className="font-bold text-blue-700">NET CASH FLOW</span>
                        <span className={`font-bold text-lg font-mono ${cashFlow >= 0 ? 'text-blue-600' : 'text-red-600'}`}>${fmtMoney(cashFlow)}</span>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg text-xs text-muted-foreground">
                      <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">📌 Cash Logic</p>
                      Revenue = SUM(paid invoice amounts) in period<br/>
                      Expense = SUM(accepted quote amounts for completed WOs) in period<br/>
                      Only actual money movement counts
                    </div>
                  </CardContent>
                </Card>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <KpiCard label="Cash In" value={`$${fmtMoney(cashIn)}`} icon={TrendingUp} color="text-blue-600" />
                    <KpiCard label="Cash Out" value={`$${fmtMoney(cashOut)}`} icon={Building2} color="text-red-600" />
                    <KpiCard label="Net Cash Flow" value={`$${fmtMoney(cashFlow)}`} icon={DollarSign} color="text-green-600" negative={cashFlow < 0} />
                    <KpiCard label="Paid Invoices" value={filteredInv.filter(i => i.status === 'paid').length} sub="in period" icon={CheckCircle} color="text-emerald-600" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            CLIENTS TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'clients' && (
          <div className="space-y-4">
            <SectionHeader title="Client-Wise Report — Receivables" count={clientReport.length}
              onExport={() => exportCSV(clientReport.map(c => ({
                Client: c.name, Company: c.company, 'Work Orders': c.workOrders,
                'Total Billed': c.totalBilled.toFixed(2), Collected: c.collected.toFixed(2),
                Outstanding: c.outstanding.toFixed(2), Overdue: c.overdue.toFixed(2),
                'Net Receivable': c.netReceivable.toFixed(2),
              })), `clients-${dte()}.csv`)} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total Billed" value={`$${fmtMoney(clientReport.reduce((s,c)=>s+c.totalBilled,0))}`} icon={Receipt} color="text-orange-600" />
              <KpiCard label="Collected" value={`$${fmtMoney(clientReport.reduce((s,c)=>s+c.collected,0))}`} icon={CheckCircle} color="text-green-600" />
              <KpiCard label="Outstanding" value={`$${fmtMoney(clientReport.reduce((s,c)=>s+c.outstanding,0))}`} icon={Clock} color="text-yellow-600" />
              <KpiCard label="Overdue" value={`$${fmtMoney(clientReport.reduce((s,c)=>s+c.overdue,0))}`} icon={AlertCircle} color="text-red-600" negative />
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium w-6" />
                        <th className="text-left px-4 py-3 font-medium">Client</th>
                        <th className="text-right px-4 py-3 font-medium">WOs</th>
                        <th className="text-right px-4 py-3 font-medium">Invoices</th>
                        <th className="text-right px-4 py-3 font-medium">Total Billed</th>
                        <th className="text-right px-4 py-3 font-medium">Collected</th>
                        <th className="text-right px-4 py-3 font-medium">Outstanding</th>
                        <th className="text-right px-4 py-3 font-medium">Overdue</th>
                        <th className="text-right px-4 py-3 font-medium">Net Receivable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientReport.map(c => (
                        <>
                          <tr key={c.id}
                            className="border-b hover:bg-muted/40 cursor-pointer"
                            onClick={() => setExpandedClientId(expandedClientId === c.id ? null : c.id)}>
                            <td className="px-4 py-3 text-muted-foreground">
                              {expandedClientId === c.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{c.name}</p>
                              {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                            </td>
                            <td className="px-4 py-3 text-right">{c.workOrders}</td>
                            <td className="px-4 py-3 text-right">{c.invoices}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs">${fmtMoney(c.totalBilled)}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-green-600">${fmtMoney(c.collected)}</td>
                            <td className={`px-4 py-3 text-right font-mono text-xs ${c.outstanding > 0 ? 'text-yellow-600' : ''}`}>${fmtMoney(c.outstanding)}</td>
                            <td className={`px-4 py-3 text-right font-mono text-xs ${c.overdue > 0 ? 'text-red-600 font-semibold' : ''}`}>${fmtMoney(c.overdue)}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-semibold">${fmtMoney(c.netReceivable)}</td>
                          </tr>
                          {/* ── DRILL-DOWN ─────────────────────────────── */}
                          {expandedClientId === c.id && (
                            <tr key={`${c.id}-drill`}>
                              <td colSpan={9} className="bg-muted/30 px-6 py-4">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  {/* Invoice List */}
                                  <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Outstanding Invoices</p>
                                    <div className="space-y-1.5">
                                      {c.invoiceList.filter(i => i.status !== 'paid').slice(0, 8).map(inv => (
                                        <div key={inv.id} className="flex items-center justify-between text-xs bg-background rounded p-2 border">
                                          <div>
                                            <span className="font-mono text-muted-foreground">{inv.invoiceNumber || inv.id.slice(0, 8)}</span>
                                            <span className="ml-2"><StatusBadge status={inv.status} /></span>
                                          </div>
                                          <div className="text-right">
                                            <span className="font-mono font-semibold">${fmtMoney(inv.totalAmount || 0)}</span>
                                            {inv.dueDate && <span className="ml-2 text-muted-foreground">due {fmtDate(inv.dueDate)}</span>}
                                          </div>
                                        </div>
                                      ))}
                                      {c.invoiceList.filter(i => i.status !== 'paid').length === 0 && (
                                        <p className="text-xs text-muted-foreground">No outstanding invoices.</p>
                                      )}
                                    </div>
                                  </div>
                                  {/* Aging Schedule */}
                                  <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Aging Schedule</p>
                                    <div className="space-y-1.5">
                                      {AGING_BUCKETS.map(bucket => (
                                        <div key={bucket} className="flex items-center gap-2 text-xs">
                                          <AgingBadge bucket={bucket} />
                                          <ProgressBar value={c.aging[bucket] ?? 0} max={c.outstanding || 1} color={bucket === 'Current' ? 'bg-green-500' : bucket.includes('60+') ? 'bg-red-600' : 'bg-orange-500'} />
                                          <span className="font-mono w-20 text-right shrink-0">${fmtMoney(c.aging[bucket] ?? 0)}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {c.avgDays !== null && (
                                      <p className="text-xs text-muted-foreground mt-3">Avg payment terms: <strong>{c.avgDays} days</strong></p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                      {clientReport.length > 0 && (
                        <tr className="border-t-2 bg-muted/30 font-semibold">
                          <td /><td className="px-4 py-3">TOTAL</td>
                          <td className="px-4 py-3 text-right">{clientReport.reduce((s,c)=>s+c.workOrders,0)}</td>
                          <td className="px-4 py-3 text-right">{clientReport.reduce((s,c)=>s+c.invoices,0)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">${fmtMoney(clientReport.reduce((s,c)=>s+c.totalBilled,0))}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-green-600">${fmtMoney(clientReport.reduce((s,c)=>s+c.collected,0))}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-yellow-600">${fmtMoney(clientReport.reduce((s,c)=>s+c.outstanding,0))}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-red-600">${fmtMoney(clientReport.reduce((s,c)=>s+c.overdue,0))}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">${fmtMoney(clientReport.reduce((s,c)=>s+c.netReceivable,0))}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {clientReport.length === 0 && <p className="text-center py-10 text-muted-foreground">No client activity in this period.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SUBCONTRACTORS TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'subcontractors' && (
          <div className="space-y-4">
            <SectionHeader title="Subcontractor / Vendor Report — Payables" count={subReport.length}
              onExport={() => exportCSV(subReport.map(s => ({
                Subcontractor: s.name, Business: s.business, Status: s.status,
                Quotes: s.quotes, Accepted: s.accepted, 'Accept Rate %': s.acceptanceRate,
                'Total Assigned': s.totalAssigned.toFixed(2), 'Paid Out': s.paidOut.toFixed(2),
                Outstanding: s.outstanding.toFixed(2), Overdue: s.overdue.toFixed(2),
                'Net Payable': s.netPayable.toFixed(2),
              })), `subcontractors-${dte()}.csv`)} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total Assigned" value={`$${fmtMoney(subReport.reduce((s,r)=>s+r.totalAssigned,0))}`} icon={ClipboardList} color="text-blue-600" />
              <KpiCard label="Paid Out" value={`$${fmtMoney(subReport.reduce((s,r)=>s+r.paidOut,0))}`} icon={CheckCircle} color="text-green-600" />
              <KpiCard label="Outstanding AP" value={`$${fmtMoney(subReport.reduce((s,r)=>s+r.outstanding,0))}`} icon={Clock} color="text-yellow-600" />
              <KpiCard label="Overdue AP" value={`$${fmtMoney(subReport.reduce((s,r)=>s+r.overdue,0))}`} icon={AlertCircle} color="text-red-600" negative />
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium w-6" />
                        <th className="text-left px-4 py-3 font-medium">Subcontractor</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-right px-4 py-3 font-medium">Quotes</th>
                        <th className="text-right px-4 py-3 font-medium">Accepted</th>
                        <th className="text-right px-4 py-3 font-medium">Accept %</th>
                        <th className="text-right px-4 py-3 font-medium">Total Assigned</th>
                        <th className="text-right px-4 py-3 font-medium">Paid Out</th>
                        <th className="text-right px-4 py-3 font-medium">Outstanding</th>
                        <th className="text-right px-4 py-3 font-medium">Overdue</th>
                        <th className="text-right px-4 py-3 font-medium">Net Payable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subReport.map(s => (
                        <>
                          <tr key={s.id} className="border-b hover:bg-muted/40 cursor-pointer"
                            onClick={() => setExpandedSubId(expandedSubId === s.id ? null : s.id)}>
                            <td className="px-4 py-3 text-muted-foreground">
                              {expandedSubId === s.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{s.name}</p>
                              {s.business && <p className="text-xs text-muted-foreground">{s.business}</p>}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                            <td className="px-4 py-3 text-right">{s.quotes}</td>
                            <td className="px-4 py-3 text-right text-green-600">{s.accepted}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={s.acceptanceRate >= 50 ? 'text-green-600 font-semibold' : 'text-yellow-600'}>{s.acceptanceRate}%</span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">${fmtMoney(s.totalAssigned)}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-green-600">${fmtMoney(s.paidOut)}</td>
                            <td className={`px-4 py-3 text-right font-mono text-xs ${s.outstanding > 0 ? 'text-yellow-600' : ''}`}>${fmtMoney(s.outstanding)}</td>
                            <td className={`px-4 py-3 text-right font-mono text-xs ${s.overdue > 0 ? 'text-red-600 font-semibold' : ''}`}>${fmtMoney(s.overdue)}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-semibold">${fmtMoney(s.netPayable)}</td>
                          </tr>
                          {/* ── DRILL-DOWN ─────────────────────────────── */}
                          {expandedSubId === s.id && (
                            <tr key={`${s.id}-drill`}>
                              <td colSpan={11} className="bg-muted/30 px-6 py-4">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  {/* Per-customer breakdown */}
                                  <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Per-Client Breakdown</p>
                                    {s.clientBreakdown.length > 0 ? (
                                      <table className="w-full text-xs">
                                        <thead><tr className="border-b">
                                          <th className="text-left py-1.5 font-medium text-muted-foreground">Client</th>
                                          <th className="text-right py-1.5 font-medium text-muted-foreground">Jobs</th>
                                          <th className="text-right py-1.5 font-medium text-muted-foreground">Vendor Amt</th>
                                          <th className="text-right py-1.5 font-medium text-muted-foreground">Paid</th>
                                          <th className="text-right py-1.5 font-medium text-muted-foreground">Outstanding</th>
                                        </tr></thead>
                                        <tbody>
                                          {s.clientBreakdown.map((cb, idx) => (
                                            <tr key={idx} className="border-b last:border-0 hover:bg-background/50">
                                              <td className="py-1.5 font-medium">{cb.clientName}</td>
                                              <td className="py-1.5 text-right text-muted-foreground">{cb.jobs}</td>
                                              <td className="py-1.5 text-right font-mono">${fmtMoney(cb.vendorAmt)}</td>
                                              <td className="py-1.5 text-right font-mono text-green-600">${fmtMoney(cb.paid)}</td>
                                              <td className={`py-1.5 text-right font-mono ${cb.vendorAmt - cb.paid > 0 ? 'text-yellow-600' : ''}`}>${fmtMoney(cb.vendorAmt - cb.paid)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : <p className="text-xs text-muted-foreground">No job breakdowns available.</p>}
                                  </div>
                                  {/* Aging Schedule */}
                                  <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vendor Aging Schedule</p>
                                    <div className="space-y-1.5">
                                      {AGING_BUCKETS.map(bucket => (
                                        <div key={bucket} className="flex items-center gap-2 text-xs">
                                          <AgingBadge bucket={bucket} />
                                          <ProgressBar value={s.aging[bucket] ?? 0} max={s.netPayable || 1} color={bucket === 'Current' ? 'bg-green-500' : 'bg-orange-500'} />
                                          <span className="font-mono w-20 text-right shrink-0">${fmtMoney(s.aging[bucket] ?? 0)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                  {subReport.length === 0 && <p className="text-center py-10 text-muted-foreground">No subcontractor activity in this period.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SERVICE REVENUE TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'service-revenue' && (
          <div className="space-y-4">
            <SectionHeader title="Service-Wise Revenue & Margin Report" count={serviceRevenue.length}
              onExport={() => exportCSV(serviceRevenue.map(r => ({
                Category: r.cat, Jobs: r.jobs,
                Revenue: r.revenue.toFixed(2), Cost: r.cost.toFixed(2),
                Profit: r.profit.toFixed(2), 'Margin %': r.margin.toFixed(1),
              })), `service-revenue-${dte()}.csv`)} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total Revenue" value={`$${fmtMoney(serviceRevenue.reduce((s,r)=>s+r.revenue,0))}`} icon={DollarSign} color="text-blue-600" />
              <KpiCard label="Total Cost" value={`$${fmtMoney(serviceRevenue.reduce((s,r)=>s+r.cost,0))}`} icon={Building2} color="text-orange-600" />
              <KpiCard label="Gross Profit" value={`$${fmtMoney(serviceRevenue.reduce((s,r)=>s+r.profit,0))}`} icon={TrendingUp} color="text-green-600" />
              <KpiCard label="Avg Margin" value={serviceRevenue.length ? `${(serviceRevenue.reduce((s,r)=>s+r.margin,0)/serviceRevenue.length).toFixed(1)}%` : '0%'} icon={Activity} color="text-purple-600" />
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium">Service Category</th>
                        <th className="text-right px-4 py-3 font-medium">Job Volume</th>
                        <th className="text-right px-4 py-3 font-medium">Revenue</th>
                        <th className="text-right px-4 py-3 font-medium">Vendor Cost</th>
                        <th className="text-right px-4 py-3 font-medium">Gross Profit</th>
                        <th className="text-right px-4 py-3 font-medium">Margin %</th>
                        <th className="text-left px-4 py-3 font-medium">Revenue Bar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceRevenue.map(r => {
                        const maxRev = serviceRevenue[0]?.revenue || 1;
                        return (
                          <tr key={r.cat} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="px-4 py-3 font-medium">{r.cat || 'Uncategorized'}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{r.jobs}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs">${fmtMoney(r.revenue)}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-red-600">({fmtMoney(r.cost)})</td>
                            <td className={`px-4 py-3 text-right font-mono text-xs font-semibold ${r.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>${fmtMoney(r.profit)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-xs font-bold ${r.margin >= 30 ? 'text-green-600' : r.margin >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>{r.margin.toFixed(1)}%</span>
                            </td>
                            <td className="px-4 py-3 w-40">
                              <ProgressBar value={r.revenue} max={maxRev} color="bg-blue-500" />
                            </td>
                          </tr>
                        );
                      })}
                      {serviceRevenue.length > 0 && (
                        <tr className="border-t-2 bg-muted/30 font-semibold">
                          <td className="px-4 py-3">TOTAL</td>
                          <td className="px-4 py-3 text-right">{serviceRevenue.reduce((s,r)=>s+r.jobs,0)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">${fmtMoney(serviceRevenue.reduce((s,r)=>s+r.revenue,0))}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-red-600">({fmtMoney(serviceRevenue.reduce((s,r)=>s+r.cost,0))})</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-green-600">${fmtMoney(serviceRevenue.reduce((s,r)=>s+r.profit,0))}</td>
                          <td colSpan={2} />
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {serviceRevenue.length === 0 && <p className="text-center py-10 text-muted-foreground">No service category data for this period.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            AGING REPORT TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'aging' && (
          <div className="space-y-5">
            <SectionHeader title="Combined Aging Report — AR &amp; AP" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total AR (Receivables)" value={`$${fmtMoney(totalAR)}`} icon={TrendingUp} color="text-blue-600" />
              <KpiCard label="Total AP (Payables)" value={`$${fmtMoney(totalAP)}`} icon={Building2} color="text-orange-600" />
              <KpiCard label="Net Position" value={`$${fmtMoney(totalAR - totalAP)}`} sub="AR minus AP" icon={DollarSign} color="text-green-600" negative={totalAR - totalAP < 0} />
              <KpiCard label="Critical (60+ days)" value={`$${fmtMoney((agingAR['60+ days']?.amount??0) + (agingAP['60+ days']?.amount??0))}`} sub="AR + AP combined" icon={AlertCircle} color="text-red-600" negative />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* AR Aging */}
              <Card className="border-blue-200 dark:border-blue-900">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">AR</span>
                    Accounts Receivable — Customer Aging
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {AGING_BUCKETS.map(bucket => (
                      <div key={bucket} className="flex items-center gap-3">
                        <div className="w-28 shrink-0"><AgingBadge bucket={bucket} /></div>
                        <ProgressBar value={agingAR[bucket]?.amount ?? 0} max={totalAR || 1} color={bucket === 'Current' ? 'bg-green-500' : bucket === '60+ days' ? 'bg-red-600' : 'bg-orange-500'} />
                        <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{agingAR[bucket]?.count ?? 0}</span>
                        <span className="text-sm font-mono font-medium w-24 text-right shrink-0">${fmtMoney(agingAR[bucket]?.amount ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t flex justify-between font-semibold text-sm">
                    <span>Total AR</span>
                    <span className="font-mono text-blue-600">${fmtMoney(totalAR)}</span>
                  </div>
                  {agingAR['60+ days']?.amount > 0 && (
                    <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                      ⚠️ ${fmtMoney(agingAR['60+ days'].amount)} is 60+ days overdue — escalation recommended
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* AP Aging */}
              <Card className="border-orange-200 dark:border-orange-900">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded">AP</span>
                    Accounts Payable — Vendor Aging
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {AGING_BUCKETS.map(bucket => (
                      <div key={bucket} className="flex items-center gap-3">
                        <div className="w-28 shrink-0"><AgingBadge bucket={bucket} /></div>
                        <ProgressBar value={agingAP[bucket]?.amount ?? 0} max={totalAP || 1} color={bucket === 'Current' ? 'bg-green-500' : bucket === '60+ days' ? 'bg-red-600' : 'bg-orange-500'} />
                        <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{agingAP[bucket]?.count ?? 0}</span>
                        <span className="text-sm font-mono font-medium w-24 text-right shrink-0">${fmtMoney(agingAP[bucket]?.amount ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t flex justify-between font-semibold text-sm">
                    <span>Total AP</span>
                    <span className="font-mono text-orange-600">${fmtMoney(totalAP)}</span>
                  </div>
                  {agingAP['60+ days']?.amount > 0 && (
                    <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                      ⚠️ ${fmtMoney(agingAP['60+ days'].amount)} vendor AP is 60+ days overdue
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Net Position Table */}
            <Card>
              <CardHeader><CardTitle className="text-base">Net Position by Aging Bucket</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground">Bucket</th>
                    <th className="text-right py-2 font-medium text-blue-600">AR (Receivable)</th>
                    <th className="text-right py-2 font-medium text-orange-600">AP (Payable)</th>
                    <th className="text-right py-2 font-medium">Net Position</th>
                  </tr></thead>
                  <tbody>
                    {AGING_BUCKETS.map(bucket => {
                      const ar = agingAR[bucket]?.amount ?? 0;
                      const ap = agingAP[bucket]?.amount ?? 0;
                      const net = ar - ap;
                      return (
                        <tr key={bucket} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="py-2"><AgingBadge bucket={bucket} /></td>
                          <td className="py-2 text-right font-mono text-xs text-blue-600">${fmtMoney(ar)}</td>
                          <td className="py-2 text-right font-mono text-xs text-orange-600">${fmtMoney(ap)}</td>
                          <td className={`py-2 text-right font-mono text-xs font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>${fmtMoney(net)}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 font-semibold">
                      <td className="py-2">TOTAL</td>
                      <td className="py-2 text-right font-mono text-xs text-blue-600">${fmtMoney(totalAR)}</td>
                      <td className="py-2 text-right font-mono text-xs text-orange-600">${fmtMoney(totalAP)}</td>
                      <td className={`py-2 text-right font-mono text-xs ${totalAR-totalAP>=0?'text-green-600':'text-red-600'}`}>${fmtMoney(totalAR-totalAP)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            WORK ORDERS TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'work-orders' && (
          <div className="space-y-4">
            <SectionHeader title="Work Orders" count={filteredWO.length}
              onExport={() => exportCSV(filteredWO.map(w => ({
                'WO #': w.workOrderNumber || w.id, Title: w.title, Client: w.clientName,
                Company: w.companyName || '', Category: w.category, Priority: w.priority,
                Status: w.status, Type: w.isMaintenanceRequestOrder ? 'Maintenance' : 'Standard',
                'Assigned To': w.assignedToName || '', Budget: w.estimateBudget || '',
                Created: fmtDate(w.createdAt),
              })), `work-orders-${dte()}.csv`)} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {woByStatus.slice(0, 4).map(row => (
                <Card key={row.status}>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{row.count}</p>
                    <div className="mt-1"><StatusBadge status={row.status} /></div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium">WO #</th>
                        <th className="text-left px-4 py-3 font-medium">Title</th>
                        <th className="text-left px-4 py-3 font-medium">Client</th>
                        <th className="text-left px-4 py-3 font-medium">Category</th>
                        <th className="text-left px-4 py-3 font-medium">Priority</th>
                        <th className="text-left px-4 py-3 font-medium">Type</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Assigned</th>
                        <th className="text-right px-4 py-3 font-medium">Budget</th>
                        <th className="text-left px-4 py-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWO.map(wo => (
                        <tr key={wo.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{wo.workOrderNumber || wo.id.slice(0,8)}</td>
                          <td className="px-4 py-3 font-medium max-w-[180px] truncate">{wo.title}</td>
                          <td className="px-4 py-3 text-muted-foreground">{wo.clientName}</td>
                          <td className="px-4 py-3">{wo.category || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold capitalize ${wo.priority==='high'?'text-red-600':wo.priority==='medium'?'text-yellow-600':'text-green-600'}`}>{wo.priority}</span>
                          </td>
                          <td className="px-4 py-3 text-xs">{wo.isMaintenanceRequestOrder ? 'Maintenance' : 'Standard'}</td>
                          <td className="px-4 py-3"><StatusBadge status={wo.status} /></td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{wo.assignedToName || '—'}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">{wo.estimateBudget ? `$${wo.estimateBudget.toLocaleString()}` : '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(wo.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredWO.length === 0 && <p className="text-center py-10 text-muted-foreground">No work orders match the current filters.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            QUOTES TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'quotes' && (
          <div className="space-y-4">
            <SectionHeader title="Quotes Analysis" count={filteredQ.length}
              onExport={() => exportCSV(filteredQ.map(q => ({
                ID: q.id, 'Work Order': q.workOrderId, Subcontractor: q.subcontractorName || q.subcontractorId,
                Amount: (q.amount||0).toFixed(2), Status: q.status, Created: fmtDate(q.createdAt),
              })), `quotes-${dte()}.csv`)} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total Quotes" value={filteredQ.length} icon={FileText} color="text-purple-600" />
              <KpiCard label="Accepted" value={filteredQ.filter(q=>q.status==='accepted').length} sub={`${acceptRate}% rate`} icon={CheckCircle} color="text-green-600" />
              <KpiCard label="Total Value" value={`$${fmtMoney(filteredQ.reduce((s,q)=>s+q.amount,0))}`} icon={DollarSign} color="text-blue-600" />
              <KpiCard label="Avg Quote" value={filteredQ.length ? `$${fmtMoney(filteredQ.reduce((s,q)=>s+q.amount,0)/filteredQ.length)}` : '$0.00'} icon={BarChart2} color="text-orange-600" />
            </div>

            {/* Status bars */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Quote Status Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Array.from(new Set(filteredQ.map(q=>q.status))).map(st => {
                  const rows = filteredQ.filter(q=>q.status===st);
                  const total = rows.reduce((s,q)=>s+q.amount,0);
                  return (
                    <div key={st} className="flex items-center gap-3">
                      <div className="w-28 shrink-0"><StatusBadge status={st} /></div>
                      <ProgressBar value={rows.length} max={filteredQ.length} color="bg-purple-500" />
                      <span className="text-xs w-6 text-right">{rows.length}</span>
                      <span className="text-xs font-mono w-24 text-right">${fmtMoney(total)}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium">Quote ID</th>
                        <th className="text-left px-4 py-3 font-medium">Subcontractor</th>
                        <th className="text-right px-4 py-3 font-medium">Amount</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQ.map(q => (
                        <tr key={q.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{q.id.slice(0,12)}…</td>
                          <td className="px-4 py-3">{q.subcontractorName || q.subcontractorId.slice(0,12)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">${fmtMoney(q.amount||0)}</td>
                          <td className="px-4 py-3"><StatusBadge status={q.status} /></td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(q.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredQ.length === 0 && <p className="text-center py-10 text-muted-foreground">No quotes match the current filters.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            INVOICES TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <SectionHeader title="Invoice Report" count={filteredInv.length}
              onExport={() => exportCSV(filteredInv.map(i => ({
                'Invoice #': i.invoiceNumber || i.id, Client: i.clientName,
                Subcontractor: i.subcontractorName || '', Amount: (i.totalAmount||0).toFixed(2),
                Status: i.status, 'Due Date': fmtDate(i.dueDate), Created: fmtDate(i.createdAt),
              })), `invoices-${dte()}.csv`)} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total Invoiced" value={`$${fmtMoney(totalInvoiced)}`} sub={`${filteredInv.length} invoices`} icon={Receipt} color="text-orange-600" />
              <KpiCard label="Collected" value={`$${fmtMoney(totalPaid)}`} sub={`${filteredInv.filter(i=>i.status==='paid').length} paid`} icon={CheckCircle} color="text-green-600" />
              <KpiCard label="Overdue" value={`$${fmtMoney(totalOverdue)}`} sub={`${filteredInv.filter(i=>i.status==='overdue').length} invoices`} icon={AlertCircle} color="text-red-600" negative />
              <KpiCard label="Collection Rate" value={totalInvoiced ? `${Math.round(totalPaid/totalInvoiced*100)}%` : '0%'} icon={TrendingUp} color="text-blue-600" />
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium">Invoice #</th>
                        <th className="text-left px-4 py-3 font-medium">Client</th>
                        <th className="text-left px-4 py-3 font-medium">Subcontractor</th>
                        <th className="text-right px-4 py-3 font-medium">Amount</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Due Date</th>
                        <th className="text-left px-4 py-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInv.map(inv => (
                        <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inv.invoiceNumber || inv.id.slice(0,10)}</td>
                          <td className="px-4 py-3 font-medium">{inv.clientName}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{inv.subcontractorName || '—'}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">${fmtMoney(inv.totalAmount||0)}</td>
                          <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(inv.dueDate)}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(inv.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {filteredInv.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 bg-muted/30 font-semibold">
                          <td className="px-4 py-3" colSpan={3}>TOTAL</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">${fmtMoney(totalInvoiced)}</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {filteredInv.length === 0 && <p className="text-center py-10 text-muted-foreground">No invoices match the current filters.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        </>
        )}
      </div>
    </AdminLayout>
  );
}
