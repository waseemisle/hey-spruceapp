'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import {
  Download, Printer, ChevronDown, TrendingUp, TrendingDown,
  DollarSign, ArrowUpRight, BarChart2, Clock, PieChart,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  locationName?: string;
  title: string;
  category: string;
  status: string;
  assignedTo?: string;
  assignedToName?: string;
  estimateBudget?: number;
  scheduledServiceDate?: any;
  createdAt: any;
}

interface Invoice {
  id: string;
  workOrderId?: string;
  clientId?: string;
  invoiceNumber?: string;
  status: string;    // draft | sent | paid | overdue
  totalAmount: number;
  dueDate?: any;
  createdAt: any;
}

interface Quote {
  id: string;
  workOrderId: string;
  subcontractorId: string;
  subcontractorName?: string;
  businessName?: string;
  amount: number;
  status: string;
}

interface Client {
  id: string;
  fullName: string;
  companyName?: string;
  email: string;
}

interface Subcontractor {
  id: string;
  fullName: string;
  businessName?: string;
  email: string;
}

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

function exportCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) { toast.error('No data to export'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  toast.success('CSV exported');
}

function CustomerStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    none:    { label: 'Not Invoiced', cls: 'bg-gray-100 text-gray-600' },
    draft:   { label: 'Not Invoiced', cls: 'bg-gray-100 text-gray-600' },
    sent:    { label: 'Invoiced',     cls: 'bg-blue-100 text-blue-700' },
    paid:    { label: 'Paid',         cls: 'bg-green-100 text-green-700' },
    overdue: { label: 'Overdue',      cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function VendorStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-700' },
    assigned:   { label: 'Active',    cls: 'bg-blue-100 text-blue-700' },
    to_be_started: { label: 'Active', cls: 'bg-blue-100 text-blue-700' },
    accepted_by_subcontractor: { label: 'Active', cls: 'bg-cyan-100 text-cyan-700' },
    completed:  { label: 'Completed', cls: 'bg-green-100 text-green-700' },
    bidding:    { label: 'Bidding',   cls: 'bg-purple-100 text-purple-700' },
    quotes_received: { label: 'Quotes In', cls: 'bg-indigo-100 text-indigo-700' },
    none:       { label: 'Unassigned', cls: 'bg-gray-100 text-gray-500' },
  };
  const { label, cls } = map[status] ?? { label: status.replace(/_/g, ' '), cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, topColor, valueColor,
}: {
  label: string; value: string; sub: string; topColor: string; valueColor?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 relative overflow-hidden`}>
      <div className={`absolute top-0 left-0 right-0 h-1 ${topColor}`} />
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type AdditionalView = 'aging' | 'cashflow' | 'profit' | null;

export default function ReportsPage() {
  // Raw data
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [quotes,     setQuotes]     = useState<Quote[]>([]);
  const [clients,    setClients]    = useState<Client[]>([]);
  const [subs,       setSubs]       = useState<Subcontractor[]>([]);
  const [loading,    setLoading]    = useState(true);

  // Filters
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [period,         setPeriod]         = useState('all');
  const [filterClientId, setFilterClientId] = useState('');
  const [filterSubId,    setFilterSubId]    = useState('');

  // Additional view expanded
  const [expandedView, setExpandedView] = useState<AdditionalView>(null);

  // ── Real-time listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    let resolved = 0;
    const done = () => { resolved++; if (resolved >= 5) setLoading(false); };

    const u1 = onSnapshot(collection(db, 'workOrders'), (s) => {
      setWorkOrders(s.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder)));
      done();
    });
    const u2 = onSnapshot(collection(db, 'invoices'), (s) => {
      setInvoices(s.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice)));
      done();
    });
    const u3 = onSnapshot(collection(db, 'quotes'), (s) => {
      setQuotes(s.docs.map((d) => ({ id: d.id, ...d.data() } as Quote)));
      done();
    });
    const u4 = onSnapshot(collection(db, 'clients'), (s) => {
      setClients(s.docs.map((d) => ({ id: d.id, ...d.data() } as Client)));
      done();
    });
    const u5 = onSnapshot(collection(db, 'subcontractors'), (s) => {
      setSubs(s.docs.map((d) => ({ id: d.id, ...d.data() } as Subcontractor)));
      done();
    });

    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  // ── Compute date range from period shortcut ──────────────────────────────────

  const resolvedDates = useMemo(() => {
    const now = new Date();
    if (period === 'this-month') {
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      };
    }
    if (period === 'last-month') {
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
      };
    }
    if (period === 'this-quarter') {
      const q = Math.floor(now.getMonth() / 3);
      return {
        from: new Date(now.getFullYear(), q * 3, 1),
        to: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59),
      };
    }
    if (period === 'this-year') {
      return {
        from: new Date(now.getFullYear(), 0, 1),
        to: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
      };
    }
    if (period === 'custom') {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? (() => { const d = new Date(dateTo); d.setHours(23, 59, 59, 999); return d; })() : null;
      return { from, to };
    }
    return { from: null, to: null }; // all
  }, [period, dateFrom, dateTo]);

  // ── Build joined rows ────────────────────────────────────────────────────────

  const allRows = useMemo(() => {
    // Build lookup maps
    const invoiceByWoId = new Map<string, Invoice>();
    invoices.forEach((inv) => { if (inv.workOrderId) invoiceByWoId.set(inv.workOrderId, inv); });

    const acceptedQuoteByWoId = new Map<string, Quote>();
    quotes.forEach((q) => {
      if (q.status === 'accepted') acceptedQuoteByWoId.set(q.workOrderId, q);
    });

    const clientMap = new Map<string, Client>();
    clients.forEach((c) => clientMap.set(c.id, c));

    const subMap = new Map<string, Subcontractor>();
    subs.forEach((s) => subMap.set(s.id, s));

    return workOrders.map((wo) => {
      const invoice = invoiceByWoId.get(wo.id) ?? null;
      const acceptedQuote = acceptedQuoteByWoId.get(wo.id) ?? null;

      const clientName =
        clientMap.get(wo.clientId)?.companyName ||
        clientMap.get(wo.clientId)?.fullName ||
        wo.clientName ||
        '—';
      const vendorName = wo.assignedTo
        ? subMap.get(wo.assignedTo)?.businessName ||
          subMap.get(wo.assignedTo)?.fullName ||
          wo.assignedToName ||
          '—'
        : '—';

      const customerPrice = invoice?.totalAmount ?? 0;
      const vendorCost = acceptedQuote?.amount ?? 0;
      const profit = customerPrice - vendorCost;
      const profitMargin = customerPrice > 0 ? (profit / customerPrice) * 100 : 0;

      const customerStatus = invoice?.status ?? 'none';
      const vendorStatus = wo.assignedTo ? wo.status : 'none';

      const date = toDate(wo.scheduledServiceDate) ?? toDate(wo.createdAt);

      return {
        wo,
        invoice,
        acceptedQuote,
        clientId: wo.clientId,
        vendorId: wo.assignedTo ?? '',
        clientName,
        vendorName,
        customerPrice,
        vendorCost,
        profit,
        profitMargin,
        customerStatus,
        vendorStatus,
        date,
      };
    });
  }, [workOrders, invoices, quotes, clients, subs]);

  // ── Apply filters ────────────────────────────────────────────────────────────

  const rows = useMemo(() => {
    const { from, to } = resolvedDates;
    return allRows.filter((r) => {
      if (from && r.date && r.date < from) return false;
      if (to && r.date && r.date > to) return false;
      if (filterClientId && r.clientId !== filterClientId) return false;
      if (filterSubId && r.vendorId !== filterSubId) return false;
      return true;
    });
  }, [allRows, resolvedDates, filterClientId, filterSubId]);

  // ── KPI calculations ─────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalRevenue = rows.reduce((s, r) => s + r.customerPrice, 0);
    const totalCost    = rows.reduce((s, r) => s + r.vendorCost, 0);
    const totalProfit  = totalRevenue - totalCost;
    const margin       = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const receivables = rows
      .filter((r) => r.customerStatus === 'sent' || r.customerStatus === 'overdue')
      .reduce((s, r) => s + r.customerPrice, 0);

    const payables = rows
      .filter(
        (r) =>
          r.vendorId &&
          (r.wo.status === 'completed' || r.wo.status === 'assigned') &&
          r.customerStatus !== 'paid' &&
          r.vendorCost > 0
      )
      .reduce((s, r) => s + r.vendorCost, 0);

    const cashFlow = receivables - payables;

    return { totalRevenue, totalCost, totalProfit, margin, receivables, payables, cashFlow };
  }, [rows]);

  // ── Aging analysis ───────────────────────────────────────────────────────────

  const agingRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const buckets = [
      { label: '0–30 days', min: 0, max: 30, amount: 0, count: 0 },
      { label: '31–60 days', min: 31, max: 60, amount: 0, count: 0 },
      { label: '61–90 days', min: 61, max: 90, amount: 0, count: 0 },
      { label: '90+ days',   min: 91, max: Infinity, amount: 0, count: 0 },
    ];

    rows
      .filter((r) => r.customerStatus === 'sent' || r.customerStatus === 'overdue')
      .forEach((r) => {
        const dueDate = toDate(r.invoice?.dueDate);
        const days = dueDate
          ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000))
          : 0;
        const bucket = buckets.find((b) => days >= b.min && days <= b.max);
        if (bucket) {
          bucket.amount += r.customerPrice;
          bucket.count += 1;
        }
      });

    return buckets;
  }, [rows]);

  // ── Profit by customer ───────────────────────────────────────────────────────

  const profitByCustomer = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; cost: number; jobs: number }>();
    rows.forEach((r) => {
      const existing = map.get(r.clientId) ?? { name: r.clientName, revenue: 0, cost: 0, jobs: 0 };
      existing.revenue += r.customerPrice;
      existing.cost += r.vendorCost;
      existing.jobs += 1;
      map.set(r.clientId, existing);
    });
    return Array.from(map.values())
      .map((v) => ({ ...v, profit: v.revenue - v.cost, margin: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);
  }, [rows]);

  // ── Profit by vendor ─────────────────────────────────────────────────────────

  const profitByVendor = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; cost: number; jobs: number }>();
    rows
      .filter((r) => r.vendorId)
      .forEach((r) => {
        const existing = map.get(r.vendorId) ?? { name: r.vendorName, revenue: 0, cost: 0, jobs: 0 };
        existing.revenue += r.customerPrice;
        existing.cost += r.vendorCost;
        existing.jobs += 1;
        map.set(r.vendorId, existing);
      });
    return Array.from(map.values())
      .map((v) => ({ ...v, profit: v.revenue - v.cost, margin: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);
  }, [rows]);

  // ── Export ───────────────────────────────────────────────────────────────────

  const handleExport = () => {
    exportCSV(
      rows.map((r) => ({
        'WO #': r.wo.workOrderNumber || r.wo.id,
        Date: fmtDate(r.date),
        Customer: r.clientName,
        Vendor: r.vendorName,
        'Customer Price': r.customerPrice.toFixed(2),
        'Vendor Cost': r.vendorCost.toFixed(2),
        Profit: r.profit.toFixed(2),
        'Margin %': r.profitMargin.toFixed(1),
        'Customer Status': r.customerStatus,
        'Vendor Status': r.vendorStatus,
        'WO Status': r.wo.status,
        Location: r.wo.locationName || '',
      })),
      `groundops-report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-[1400px] mx-auto pb-10 print:space-y-4">
        {/* ── Page Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-gray-500 mt-1 text-sm">Financial overview of all jobs</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print Report
            </Button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print:hidden">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Period quick-select */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">Period:</span>
              <div className="flex gap-1">
                {[
                  { v: 'all', l: 'All Time' },
                  { v: 'this-month', l: 'This Month' },
                  { v: 'last-month', l: 'Last Month' },
                  { v: 'this-quarter', l: 'This Quarter' },
                  { v: 'this-year', l: 'This Year' },
                  { v: 'custom', l: 'Custom' },
                ].map(({ v, l }) => (
                  <button
                    key={v}
                    onClick={() => setPeriod(v)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      period === v
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom date inputs */}
            {period === 'custom' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">From:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-700"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">To:</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-700"
                  />
                </div>
              </>
            )}

            <div className="w-px h-6 bg-gray-200 mx-1" />

            {/* Customer filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">Customer:</span>
              <select
                value={filterClientId}
                onChange={(e) => setFilterClientId(e.target.value)}
                className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm text-gray-700 bg-white pr-7"
              >
                <option value="">All Customers</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName || c.fullName}
                  </option>
                ))}
              </select>
            </div>

            {/* Vendor filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">Vendor:</span>
              <select
                value={filterSubId}
                onChange={(e) => setFilterSubId(e.target.value)}
                className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm text-gray-700 bg-white pr-7"
              >
                <option value="">All Vendors</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.businessName || s.fullName}
                  </option>
                ))}
              </select>
            </div>

            {(filterClientId || filterSubId || period !== 'all') && (
              <button
                onClick={() => { setFilterClientId(''); setFilterSubId(''); setPeriod('all'); setDateFrom(''); setDateTo(''); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── KPI Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            label="Total Revenue"
            value={fmtMoney(kpis.totalRevenue)}
            sub="Customer side"
            topColor="bg-blue-500"
            valueColor="text-blue-700"
          />
          <KpiCard
            label="Total Cost"
            value={fmtMoney(kpis.totalCost)}
            sub="Vendor side"
            topColor="bg-red-500"
            valueColor="text-red-600"
          />
          <KpiCard
            label="Total Profit"
            value={fmtMoney(kpis.totalProfit)}
            sub={`${kpis.margin.toFixed(1)}% margin`}
            topColor="bg-green-500"
            valueColor="text-green-700"
          />
          <KpiCard
            label="Receivables"
            value={fmtMoney(kpis.receivables)}
            sub="Unpaid by customers"
            topColor="bg-yellow-500"
            valueColor="text-yellow-700"
          />
          <KpiCard
            label="Payables"
            value={fmtMoney(kpis.payables)}
            sub="Owed to vendors"
            topColor="bg-purple-500"
            valueColor="text-purple-700"
          />
          <KpiCard
            label="Cash Flow"
            value={(kpis.cashFlow >= 0 ? '+' : '') + fmtMoney(kpis.cashFlow)}
            sub="Recv − Payables"
            topColor={kpis.cashFlow >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
            valueColor={kpis.cashFlow >= 0 ? 'text-emerald-700' : 'text-red-600'}
          />
        </div>

        {/* ── Main Report Table ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 text-base">All Jobs</h3>
              <p className="text-xs text-gray-500 mt-0.5">{rows.length} job{rows.length !== 1 ? 's' : ''} in current filter</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 print:hidden" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    { label: 'Job #', cls: '' },
                    { label: 'Date', cls: '' },
                    { label: 'Customer', cls: '' },
                    { label: 'Vendor', cls: '' },
                    { label: 'Customer Price', cls: 'text-right' },
                    { label: 'Vendor Cost', cls: 'text-right' },
                    { label: 'Profit', cls: 'text-right' },
                    { label: 'Customer Status', cls: '' },
                    { label: 'Vendor Status', cls: '' },
                  ].map((h) => (
                    <th
                      key={h.label}
                      className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap border-b border-gray-200 ${h.cls}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                      No jobs found for the current filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.wo.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-blue-600 whitespace-nowrap">
                        {r.wo.workOrderNumber || r.wo.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                        {fmtDate(r.date)}
                      </td>
                      <td className="px-4 py-3.5 text-gray-700 max-w-[160px] truncate">
                        {r.clientName}
                      </td>
                      <td className="px-4 py-3.5 text-gray-700 max-w-[140px] truncate">
                        {r.vendorName}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {r.customerPrice > 0 ? fmtMoney(r.customerPrice) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {r.vendorCost > 0 ? fmtMoney(r.vendorCost) : '—'}
                      </td>
                      <td
                        className={`px-4 py-3.5 text-right font-semibold whitespace-nowrap ${
                          r.profit > 0
                            ? 'text-green-600'
                            : r.profit < 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}
                      >
                        {r.customerPrice > 0 || r.vendorCost > 0
                          ? (r.profit >= 0 ? '' : '') + fmtMoney(r.profit)
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <CustomerStatusBadge status={r.customerStatus} />
                      </td>
                      <td className="px-4 py-3.5">
                        <VendorStatusBadge status={r.vendorStatus} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Totals footer */}
              {rows.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-600">
                      Totals ({rows.length} jobs)
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {fmtMoney(kpis.totalRevenue)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {fmtMoney(kpis.totalCost)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">
                      {fmtMoney(kpis.totalProfit)}
                      <span className="text-xs text-gray-500 ml-1">({kpis.margin.toFixed(1)}%)</span>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* ── Additional Report Views ── */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-4 text-base">Additional Report Views</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Aging Report */}
            <div
              className={`bg-white border rounded-xl p-5 cursor-pointer transition-all hover:shadow-md ${
                expandedView === 'aging'
                  ? 'border-blue-400 ring-1 ring-blue-200'
                  : 'border-gray-200'
              }`}
              onClick={() => setExpandedView(expandedView === 'aging' ? null : 'aging')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <BarChart2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Aging Report</p>
                    <p className="text-xs text-gray-500 mt-0.5">0–30, 31–60, 61–90, 90+ days buckets</p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform ${expandedView === 'aging' ? 'rotate-180' : ''}`}
                />
              </div>
            </div>

            {/* Cash Flow */}
            <div
              className={`bg-white border rounded-xl p-5 cursor-pointer transition-all hover:shadow-md ${
                expandedView === 'cashflow'
                  ? 'border-green-400 ring-1 ring-green-200'
                  : 'border-gray-200'
              }`}
              onClick={() => setExpandedView(expandedView === 'cashflow' ? null : 'cashflow')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg">
                    <Clock className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Cash Flow</p>
                    <p className="text-xs text-gray-500 mt-0.5">Receivables vs payables breakdown</p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform ${expandedView === 'cashflow' ? 'rotate-180' : ''}`}
                />
              </div>
            </div>

            {/* Profit by Customer / Vendor */}
            <div
              className={`bg-white border rounded-xl p-5 cursor-pointer transition-all hover:shadow-md ${
                expandedView === 'profit'
                  ? 'border-purple-400 ring-1 ring-purple-200'
                  : 'border-gray-200'
              }`}
              onClick={() => setExpandedView(expandedView === 'profit' ? null : 'profit')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <PieChart className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Profit by Customer / Vendor</p>
                    <p className="text-xs text-gray-500 mt-0.5">Most profitable relationships</p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform ${expandedView === 'profit' ? 'rotate-180' : ''}`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Aging Report Detail ── */}
        {expandedView === 'aging' && (
          <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Accounts Receivable Aging</h3>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() =>
                  exportCSV(
                    agingRows.map((b) => ({ Bucket: b.label, 'Invoice Count': b.count, 'Amount Outstanding': b.amount.toFixed(2) })),
                    'aging-report.csv'
                  )
                }
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Age Bucket', 'Invoice Count', 'Amount Outstanding', 'Share'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agingRows.map((bucket) => {
                    const total = agingRows.reduce((s, b) => s + b.amount, 0);
                    const share = total > 0 ? (bucket.amount / total) * 100 : 0;
                    return (
                      <tr key={bucket.label} className="hover:bg-gray-50">
                        <td className="px-4 py-3.5 font-semibold text-gray-800">{bucket.label}</td>
                        <td className="px-4 py-3.5 text-gray-600">{bucket.count}</td>
                        <td className="px-4 py-3.5 font-semibold text-gray-900">{fmtMoney(bucket.amount)}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{share.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Cash Flow Detail ── */}
        {expandedView === 'cashflow' && (
          <div className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Cash Flow Summary</h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-blue-50 rounded-xl p-5">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total Receivables</p>
                <p className="text-3xl font-bold text-blue-700 mt-1">{fmtMoney(kpis.receivables)}</p>
                <p className="text-sm text-blue-500 mt-1">
                  {rows.filter((r) => r.customerStatus === 'sent' || r.customerStatus === 'overdue').length} invoices outstanding
                </p>
              </div>
              <div className="bg-red-50 rounded-xl p-5">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Total Payables</p>
                <p className="text-3xl font-bold text-red-700 mt-1">{fmtMoney(kpis.payables)}</p>
                <p className="text-sm text-red-500 mt-1">Owed to vendors for completed work</p>
              </div>
              <div className={`rounded-xl p-5 ${kpis.cashFlow >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${kpis.cashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Net Position
                </p>
                <p className={`text-3xl font-bold mt-1 ${kpis.cashFlow >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {kpis.cashFlow >= 0 ? '+' : ''}{fmtMoney(kpis.cashFlow)}
                </p>
                <p className={`text-sm mt-1 ${kpis.cashFlow >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  Receivables minus Payables
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Profit by Customer / Vendor ── */}
        {expandedView === 'profit' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Customer */}
            <div className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Profit by Customer</h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    exportCSV(
                      profitByCustomer.map((c) => ({
                        Customer: c.name,
                        Jobs: c.jobs,
                        Revenue: c.revenue.toFixed(2),
                        Cost: c.cost.toFixed(2),
                        Profit: c.profit.toFixed(2),
                        'Margin %': c.margin.toFixed(1),
                      })),
                      'profit-by-customer.csv'
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Customer', 'Jobs', 'Revenue', 'Cost', 'Profit', 'Margin'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {profitByCustomer.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No data</td></tr>
                    ) : (
                      profitByCustomer.map((c, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[140px] truncate">{c.name}</td>
                          <td className="px-4 py-3.5 text-gray-500">{c.jobs}</td>
                          <td className="px-4 py-3.5 font-medium text-gray-700">{fmtMoney(c.revenue)}</td>
                          <td className="px-4 py-3.5 text-gray-500">{fmtMoney(c.cost)}</td>
                          <td className="px-4 py-3.5 font-semibold text-green-600">{fmtMoney(c.profit)}</td>
                          <td className="px-4 py-3.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.margin >= 30 ? 'bg-green-100 text-green-700' : c.margin >= 15 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                              {c.margin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By Vendor */}
            <div className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Profit by Vendor</h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    exportCSV(
                      profitByVendor.map((v) => ({
                        Vendor: v.name,
                        Jobs: v.jobs,
                        Revenue: v.revenue.toFixed(2),
                        Cost: v.cost.toFixed(2),
                        Profit: v.profit.toFixed(2),
                        'Margin %': v.margin.toFixed(1),
                      })),
                      'profit-by-vendor.csv'
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Vendor', 'Jobs', 'Revenue', 'Cost', 'Profit', 'Margin'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {profitByVendor.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No data</td></tr>
                    ) : (
                      profitByVendor.map((v, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[140px] truncate">{v.name}</td>
                          <td className="px-4 py-3.5 text-gray-500">{v.jobs}</td>
                          <td className="px-4 py-3.5 font-medium text-gray-700">{fmtMoney(v.revenue)}</td>
                          <td className="px-4 py-3.5 text-gray-500">{fmtMoney(v.cost)}</td>
                          <td className="px-4 py-3.5 font-semibold text-green-600">{fmtMoney(v.profit)}</td>
                          <td className="px-4 py-3.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${v.margin >= 30 ? 'bg-green-100 text-green-700' : v.margin >= 15 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                              {v.margin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
