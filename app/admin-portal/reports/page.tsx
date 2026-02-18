'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BarChart2, Download, Search, Save, Trash2, Filter,
  ClipboardList, Receipt, FileText, Users, Building2,
  TrendingUp, AlertCircle, CheckCircle, Clock, X,
  RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  locationId?: string;
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
}

interface Quote {
  id: string;
  workOrderId: string;
  subcontractorId: string;
  subcontractorName?: string;
  amount: number;
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
  reportType: string;
  createdAt: string;
}

interface FilterState {
  dateFrom: string;
  dateTo: string;
  clientId: string;
  subcontractorId: string;
  status: string;
  priority: string;
  category: string;
  woType: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SAVED_SEARCHES_KEY = 'spruce_report_saved_searches';

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  return new Date(val);
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function exportCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) { toast.error('No data to export'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success('CSV exported');
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color.replace('text-', 'bg-').replace('-600', '-100').replace('-500', '-100')}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, count, onExport }: {
  title: string; count?: number; onExport?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-semibold text-base">
        {title} {count !== undefined && <span className="text-muted-foreground text-sm font-normal">({count})</span>}
      </h3>
      {onExport && (
        <Button size="sm" variant="outline" onClick={onExport}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
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
  };
  const cls = map[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ReportTab = 'overview' | 'work-orders' | 'clients' | 'subcontractors' | 'quotes' | 'invoices';

export default function ReportsPage() {
  // Raw data
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [showFilters, setShowFilters] = useState(true);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Filters
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: '',
    dateTo: '',
    clientId: '',
    subcontractorId: '',
    status: '',
    priority: '',
    category: '',
    woType: 'all',
  });

  // Load saved searches from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
      if (raw) setSavedSearches(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // ── Fetch all data ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [woSnap, invSnap, quoteSnap, clientSnap, subSnap] = await Promise.all([
        getDocs(query(collection(db, 'workOrders'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'invoices'))),
        getDocs(query(collection(db, 'quotes'))),
        getDocs(query(collection(db, 'clients'))),
        getDocs(query(collection(db, 'subcontractors'))),
      ]);

      setWorkOrders(woSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkOrder)));
      setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
      setQuotes(quoteSnap.docs.map(d => ({ id: d.id, ...d.data() } as Quote)));
      setClients(clientSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
      setSubcontractors(subSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subcontractor)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Filter helpers ──────────────────────────────────────────────────────────

  const inDateRange = (val: any) => {
    if (!filters.dateFrom && !filters.dateTo) return true;
    const d = toDate(val);
    if (!d) return true;
    if (filters.dateFrom && d < new Date(filters.dateFrom)) return false;
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  };

  const filteredWO = workOrders.filter(wo => {
    if (!inDateRange(wo.createdAt)) return false;
    if (filters.clientId && wo.clientId !== filters.clientId) return false;
    if (filters.status && wo.status !== filters.status) return false;
    if (filters.priority && wo.priority !== filters.priority) return false;
    if (filters.category && wo.category !== filters.category) return false;
    if (filters.woType === 'standard' && wo.isMaintenanceRequestOrder) return false;
    if (filters.woType === 'maintenance' && !wo.isMaintenanceRequestOrder) return false;
    return true;
  });

  const filteredInvoices = invoices.filter(inv => {
    if (!inDateRange(inv.createdAt)) return false;
    if (filters.clientId && inv.clientId !== filters.clientId) return false;
    if (filters.subcontractorId && inv.subcontractorId !== filters.subcontractorId) return false;
    if (filters.status && inv.status !== filters.status) return false;
    return true;
  });

  const filteredQuotes = quotes.filter(q => {
    if (!inDateRange(q.createdAt)) return false;
    if (filters.subcontractorId && q.subcontractorId !== filters.subcontractorId) return false;
    if (filters.status && q.status !== filters.status) return false;
    return true;
  });

  // ── Unique values for filter dropdowns ──────────────────────────────────────

  const categories = Array.from(new Set(workOrders.map(w => w.category).filter(Boolean)));
  const woStatuses = Array.from(new Set(workOrders.map(w => w.status).filter(Boolean)));
  const invStatuses = Array.from(new Set(invoices.map(i => i.status).filter(Boolean)));

  // ── Overview KPIs ───────────────────────────────────────────────────────────

  const pendingWO = filteredWO.filter(w => w.status === 'pending').length;
  const completedWO = filteredWO.filter(w => w.status === 'completed').length;
  const totalInvoiced = filteredInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const paidInvoices = filteredInvoices.filter(i => i.status === 'paid');
  const totalPaid = paidInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const overdueInvoices = filteredInvoices.filter(i => i.status === 'overdue');
  const totalOverdue = overdueInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const acceptedQuotes = filteredQuotes.filter(q => q.status === 'accepted');
  const acceptanceRate = filteredQuotes.length
    ? Math.round((acceptedQuotes.length / filteredQuotes.length) * 100)
    : 0;

  // ── Work Orders by Status ───────────────────────────────────────────────────

  const woByStatus = woStatuses.map(s => ({
    status: s,
    count: filteredWO.filter(w => w.status === s).length,
  })).sort((a, b) => b.count - a.count);

  const woByCategory = categories.map(c => ({
    category: c,
    count: filteredWO.filter(w => w.category === c).length,
    standard: filteredWO.filter(w => w.category === c && !w.isMaintenanceRequestOrder).length,
    maintenance: filteredWO.filter(w => w.category === c && w.isMaintenanceRequestOrder).length,
  })).sort((a, b) => b.count - a.count);

  // ── Client Report ───────────────────────────────────────────────────────────

  const clientReport = clients.map(c => {
    const cWO = filteredWO.filter(w => w.clientId === c.id);
    const cInv = filteredInvoices.filter(i => i.clientId === c.id);
    const totalBilled = cInv.reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalPaidC = cInv.filter(i => i.status === 'paid').reduce((s, i) => s + (i.totalAmount || 0), 0);
    const outstanding = totalBilled - totalPaidC;
    return {
      id: c.id,
      name: c.fullName,
      company: c.companyName || '',
      workOrders: cWO.length,
      pending: cWO.filter(w => w.status === 'pending').length,
      completed: cWO.filter(w => w.status === 'completed').length,
      invoices: cInv.length,
      totalBilled,
      totalPaid: totalPaidC,
      outstanding,
      overdue: cInv.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.totalAmount || 0), 0),
    };
  }).filter(c => c.workOrders > 0 || c.invoices > 0)
    .sort((a, b) => b.totalBilled - a.totalBilled);

  // ── Subcontractor Report ────────────────────────────────────────────────────

  const subReport = subcontractors.map(s => {
    const sQuotes = filteredQuotes.filter(q => q.subcontractorId === s.id);
    const sInv = filteredInvoices.filter(i => i.subcontractorId === s.id);
    const accepted = sQuotes.filter(q => q.status === 'accepted').length;
    const totalQuoteVal = sQuotes.reduce((sum, q) => sum + (q.amount || 0), 0);
    const totalPaidS = sInv.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.totalAmount || 0), 0);
    return {
      id: s.id,
      name: s.fullName,
      business: s.businessName || '',
      status: s.status,
      quotes: sQuotes.length,
      accepted,
      acceptanceRate: sQuotes.length ? Math.round((accepted / sQuotes.length) * 100) : 0,
      totalQuoteValue: totalQuoteVal,
      invoices: sInv.length,
      totalPaid: totalPaidS,
    };
  }).filter(s => s.quotes > 0 || s.invoices > 0)
    .sort((a, b) => b.quotes - a.quotes);

  // ── Invoice Report ──────────────────────────────────────────────────────────

  const invByStatus = invStatuses.map(s => ({
    status: s,
    count: filteredInvoices.filter(i => i.status === s).length,
    total: filteredInvoices.filter(i => i.status === s).reduce((sum, i) => sum + (i.totalAmount || 0), 0),
  })).sort((a, b) => b.total - a.total);

  // ── Quote Report ────────────────────────────────────────────────────────────

  const quoteStatuses = Array.from(new Set(quotes.map(q => q.status).filter(Boolean)));
  const quoteByStatus = quoteStatuses.map(s => ({
    status: s,
    count: filteredQuotes.filter(q => q.status === s).length,
    total: filteredQuotes.filter(q => q.status === s).reduce((sum, q) => sum + (q.amount || 0), 0),
  })).sort((a, b) => b.count - a.count);

  // ── Saved Searches ──────────────────────────────────────────────────────────

  const saveSearch = () => {
    if (!saveSearchName.trim()) { toast.error('Enter a name for this search'); return; }
    const newSearch: SavedSearch = {
      id: Date.now().toString(),
      name: saveSearchName.trim(),
      filters: { ...filters },
      reportType: activeTab,
      createdAt: new Date().toISOString(),
    };
    const updated = [...savedSearches, newSearch];
    setSavedSearches(updated);
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated));
    setSaveSearchName('');
    setShowSaveDialog(false);
    toast.success('Search saved');
  };

  const loadSearch = (s: SavedSearch) => {
    setFilters(s.filters);
    setActiveTab(s.reportType as ReportTab);
    toast.success(`Loaded: ${s.name}`);
  };

  const deleteSearch = (id: string) => {
    const updated = savedSearches.filter(s => s.id !== id);
    setSavedSearches(updated);
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated));
    toast.success('Search deleted');
  };

  const resetFilters = () => {
    setFilters({ dateFrom: '', dateTo: '', clientId: '', subcontractorId: '', status: '', priority: '', category: '', woType: 'all' });
  };

  // ── CSV Exports ─────────────────────────────────────────────────────────────

  const exportWO = () => exportCSV(filteredWO.map(w => ({
    'WO Number': w.workOrderNumber || w.id,
    'Title': w.title,
    'Client': w.clientName,
    'Company': w.companyName || '',
    'Category': w.category,
    'Priority': w.priority,
    'Status': w.status,
    'Type': w.isMaintenanceRequestOrder ? 'Maintenance' : 'Standard',
    'Assigned To': w.assignedToName || '',
    'Budget': w.estimateBudget || '',
    'Created': toDate(w.createdAt)?.toLocaleDateString() || '',
  })), `work-orders-${new Date().toISOString().slice(0,10)}.csv`);

  const exportClients = () => exportCSV(clientReport.map(c => ({
    'Client': c.name,
    'Company': c.company,
    'Work Orders': c.workOrders,
    'Pending WO': c.pending,
    'Completed WO': c.completed,
    'Invoices': c.invoices,
    'Total Billed': c.totalBilled.toFixed(2),
    'Total Paid': c.totalPaid.toFixed(2),
    'Outstanding': c.outstanding.toFixed(2),
    'Overdue': c.overdue.toFixed(2),
  })), `client-report-${new Date().toISOString().slice(0,10)}.csv`);

  const exportSub = () => exportCSV(subReport.map(s => ({
    'Name': s.name,
    'Business': s.business,
    'Status': s.status,
    'Quotes': s.quotes,
    'Accepted Quotes': s.accepted,
    'Acceptance Rate %': s.acceptanceRate,
    'Total Quote Value': s.totalQuoteValue.toFixed(2),
    'Invoices': s.invoices,
    'Total Paid': s.totalPaid.toFixed(2),
  })), `subcontractor-report-${new Date().toISOString().slice(0,10)}.csv`);

  const exportInv = () => exportCSV(filteredInvoices.map(i => ({
    'Invoice #': i.invoiceNumber || i.id,
    'Client': i.clientName,
    'Subcontractor': i.subcontractorName || '',
    'Status': i.status,
    'Amount': (i.totalAmount || 0).toFixed(2),
    'Due Date': toDate(i.dueDate)?.toLocaleDateString() || '',
    'Created': toDate(i.createdAt)?.toLocaleDateString() || '',
  })), `invoices-${new Date().toISOString().slice(0,10)}.csv`);

  const exportQuotes = () => exportCSV(filteredQuotes.map(q => ({
    'Quote ID': q.id,
    'Work Order ID': q.workOrderId,
    'Subcontractor': q.subcontractorName || q.subcontractorId,
    'Amount': (q.amount || 0).toFixed(2),
    'Status': q.status,
    'Created': toDate(q.createdAt)?.toLocaleDateString() || '',
  })), `quotes-${new Date().toISOString().slice(0,10)}.csv`);

  // ── Render ──────────────────────────────────────────────────────────────────

  const tabs: { id: ReportTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'work-orders', label: 'Work Orders', icon: ClipboardList },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'subcontractors', label: 'Subcontractors', icon: Building2 },
    { id: 'quotes', label: 'Quotes', icon: FileText },
    { id: 'invoices', label: 'Invoices', icon: Receipt },
  ];

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Reports & Analytics</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Detailed reporting across work orders, clients, subcontractors, quotes, and invoices.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)}>
              <Save className="h-4 w-4 mr-1" /> Save Search
            </Button>
          </div>
        </div>

        {/* Saved Searches */}
        {savedSearches.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Saved Searches
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {savedSearches.map(s => (
                  <div key={s.id} className="flex items-center gap-1 bg-muted rounded-full px-3 py-1 text-sm">
                    <button onClick={() => loadSearch(s)} className="hover:text-primary font-medium">
                      {s.name}
                    </button>
                    <span className="text-muted-foreground text-xs ml-1">({s.reportType})</span>
                    <button onClick={() => deleteSearch(s.id)} className="ml-1 text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Save Search Dialog */}
        {showSaveDialog && (
          <Card className="border-primary/30">
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-2">Name this search</p>
              <div className="flex gap-2">
                <Input
                  value={saveSearchName}
                  onChange={e => setSaveSearchName(e.target.value)}
                  placeholder="e.g. Pending WO – Q1 2026"
                  className="flex-1"
                  onKeyDown={e => e.key === 'Enter' && saveSearch()}
                />
                <Button size="sm" onClick={saveSearch}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowSaveDialog(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Filter className="h-4 w-4" /> Filters
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <X className="h-4 w-4 mr-1" /> Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowFilters(v => !v)}>
                  {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          {showFilters && (
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Date From</Label>
                  <Input type="date" value={filters.dateFrom}
                    onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Date To</Label>
                  <Input type="date" value={filters.dateTo}
                    onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Client</Label>
                  <select
                    className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                    value={filters.clientId}
                    onChange={e => setFilters(f => ({ ...f, clientId: e.target.value }))}
                  >
                    <option value="">All Clients</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.fullName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Subcontractor</Label>
                  <select
                    className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                    value={filters.subcontractorId}
                    onChange={e => setFilters(f => ({ ...f, subcontractorId: e.target.value }))}
                  >
                    <option value="">All Subcontractors</option>
                    {subcontractors.map(s => (
                      <option key={s.id} value={s.id}>{s.fullName}{s.businessName ? ` (${s.businessName})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">WO Type</Label>
                  <select
                    className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                    value={filters.woType}
                    onChange={e => setFilters(f => ({ ...f, woType: e.target.value }))}
                  >
                    <option value="all">All Types</option>
                    <option value="standard">Standard</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Status</Label>
                  <select
                    className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                    value={filters.status}
                    onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                  >
                    <option value="">All Statuses</option>
                    {[...new Set([...woStatuses, ...invStatuses])].map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Priority</Label>
                  <select
                    className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                    value={filters.priority}
                    onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="">All Priorities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Category</Label>
                  <select
                    className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                    value={filters.category}
                    onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
                  >
                    <option value="">All Categories</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-1 border-b pb-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading report data…</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* KPI Row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <KpiCard label="Total Work Orders" value={filteredWO.length}
                    sub={`${pendingWO} pending`} icon={ClipboardList} color="text-blue-600" />
                  <KpiCard label="Completed WOs" value={completedWO}
                    sub={filteredWO.length ? `${Math.round(completedWO / filteredWO.length * 100)}% rate` : '0%'}
                    icon={CheckCircle} color="text-green-600" />
                  <KpiCard label="Total Invoiced" value={`$${fmt(totalInvoiced)}`}
                    sub={`${filteredInvoices.length} invoices`} icon={Receipt} color="text-orange-600" />
                  <KpiCard label="Total Paid" value={`$${fmt(totalPaid)}`}
                    sub={`${paidInvoices.length} invoices`} icon={TrendingUp} color="text-emerald-600" />
                  <KpiCard label="Overdue Amount" value={`$${fmt(totalOverdue)}`}
                    sub={`${overdueInvoices.length} overdue`} icon={AlertCircle} color="text-red-600" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <KpiCard label="Total Quotes" value={filteredQuotes.length}
                    sub={`${acceptanceRate}% acceptance rate`} icon={FileText} color="text-purple-600" />
                  <KpiCard label="Active Clients" value={clientReport.length}
                    sub="with activity in period" icon={Users} color="text-indigo-600" />
                  <KpiCard label="Active Subcontractors" value={subReport.length}
                    sub="with quotes / invoices" icon={Building2} color="text-cyan-600" />
                </div>

                {/* WO Status Breakdown */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Work Order Status Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {woByStatus.map(row => (
                        <div key={row.status} className="flex items-center gap-3">
                          <div className="w-36 shrink-0">
                            <StatusBadge status={row.status} />
                          </div>
                          <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: filteredWO.length ? `${(row.count / filteredWO.length) * 100}%` : '0%' }}
                            />
                          </div>
                          <span className="text-sm font-medium w-10 text-right">{row.count}</span>
                        </div>
                      ))}
                      {woByStatus.length === 0 && (
                        <p className="text-sm text-muted-foreground">No work orders match the current filters.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Invoice Status Breakdown */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Invoice Status & Revenue</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {invByStatus.map(row => (
                        <div key={row.status} className="flex items-center gap-3">
                          <div className="w-24 shrink-0">
                            <StatusBadge status={row.status} />
                          </div>
                          <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full transition-all"
                              style={{ width: totalInvoiced ? `${(row.total / totalInvoiced) * 100}%` : '0%' }}
                            />
                          </div>
                          <span className="text-sm w-10 text-right text-muted-foreground">{row.count}</span>
                          <span className="text-sm font-medium w-28 text-right">${fmt(row.total)}</span>
                        </div>
                      ))}
                      {invByStatus.length === 0 && (
                        <p className="text-sm text-muted-foreground">No invoices match the current filters.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Category Breakdown */}
                {woByCategory.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Work Orders by Category</CardTitle></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-medium text-muted-foreground">Category</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Total</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Standard</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Maintenance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {woByCategory.map(row => (
                              <tr key={row.category} className="border-b last:border-0 hover:bg-muted/50">
                                <td className="py-2 font-medium">{row.category}</td>
                                <td className="py-2 text-right">{row.count}</td>
                                <td className="py-2 text-right text-blue-600">{row.standard}</td>
                                <td className="py-2 text-right text-orange-600">{row.maintenance}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── WORK ORDERS TAB ──────────────────────────────────────────── */}
            {activeTab === 'work-orders' && (
              <div className="space-y-4">
                <SectionHeader title="Work Orders" count={filteredWO.length} onExport={exportWO} />

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
                            <th className="text-left px-4 py-3 font-medium">Assigned To</th>
                            <th className="text-right px-4 py-3 font-medium">Budget</th>
                            <th className="text-left px-4 py-3 font-medium">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredWO.map(wo => (
                            <tr key={wo.id} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                {wo.workOrderNumber || wo.id.slice(0, 8)}
                              </td>
                              <td className="px-4 py-3 font-medium max-w-[180px] truncate">{wo.title}</td>
                              <td className="px-4 py-3 text-muted-foreground">{wo.clientName}</td>
                              <td className="px-4 py-3">{wo.category || '—'}</td>
                              <td className="px-4 py-3">
                                <span className={`capitalize text-xs font-medium ${
                                  wo.priority === 'high' ? 'text-red-600' :
                                  wo.priority === 'medium' ? 'text-yellow-600' : 'text-green-600'
                                }`}>{wo.priority}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs">{wo.isMaintenanceRequestOrder ? 'Maintenance' : 'Standard'}</span>
                              </td>
                              <td className="px-4 py-3"><StatusBadge status={wo.status} /></td>
                              <td className="px-4 py-3 text-muted-foreground">{wo.assignedToName || '—'}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {wo.estimateBudget ? `$${wo.estimateBudget.toLocaleString()}` : '—'}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">
                                {toDate(wo.createdAt)?.toLocaleDateString() || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredWO.length === 0 && (
                        <p className="text-center py-10 text-muted-foreground">No work orders match the current filters.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Status summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {woByStatus.map(row => (
                    <Card key={row.status}>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{row.count}</p>
                        <StatusBadge status={row.status} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* ── CLIENTS TAB ──────────────────────────────────────────────── */}
            {activeTab === 'clients' && (
              <div className="space-y-4">
                <SectionHeader title="Client Report" count={clientReport.length} onExport={exportClients} />

                {/* Summary KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <KpiCard label="Total Billed" value={`$${fmt(clientReport.reduce((s, c) => s + c.totalBilled, 0))}`}
                    icon={Receipt} color="text-orange-600" />
                  <KpiCard label="Total Collected" value={`$${fmt(clientReport.reduce((s, c) => s + c.totalPaid, 0))}`}
                    icon={CheckCircle} color="text-green-600" />
                  <KpiCard label="Outstanding" value={`$${fmt(clientReport.reduce((s, c) => s + c.outstanding, 0))}`}
                    icon={Clock} color="text-yellow-600" />
                  <KpiCard label="Overdue" value={`$${fmt(clientReport.reduce((s, c) => s + c.overdue, 0))}`}
                    icon={AlertCircle} color="text-red-600" />
                </div>

                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left px-4 py-3 font-medium">Client</th>
                            <th className="text-left px-4 py-3 font-medium">Company</th>
                            <th className="text-right px-4 py-3 font-medium">Work Orders</th>
                            <th className="text-right px-4 py-3 font-medium">Pending</th>
                            <th className="text-right px-4 py-3 font-medium">Completed</th>
                            <th className="text-right px-4 py-3 font-medium">Invoices</th>
                            <th className="text-right px-4 py-3 font-medium">Total Billed</th>
                            <th className="text-right px-4 py-3 font-medium">Collected</th>
                            <th className="text-right px-4 py-3 font-medium">Outstanding</th>
                            <th className="text-right px-4 py-3 font-medium">Overdue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientReport.map(c => (
                            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="px-4 py-3 font-medium">{c.name}</td>
                              <td className="px-4 py-3 text-muted-foreground">{c.company || '—'}</td>
                              <td className="px-4 py-3 text-right">{c.workOrders}</td>
                              <td className="px-4 py-3 text-right text-yellow-600">{c.pending}</td>
                              <td className="px-4 py-3 text-right text-green-600">{c.completed}</td>
                              <td className="px-4 py-3 text-right">{c.invoices}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs">${fmt(c.totalBilled)}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-green-600">${fmt(c.totalPaid)}</td>
                              <td className={`px-4 py-3 text-right font-mono text-xs ${c.outstanding > 0 ? 'text-yellow-600' : ''}`}>
                                ${fmt(c.outstanding)}
                              </td>
                              <td className={`px-4 py-3 text-right font-mono text-xs ${c.overdue > 0 ? 'text-red-600 font-semibold' : ''}`}>
                                ${fmt(c.overdue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {clientReport.length > 0 && (
                          <tfoot>
                            <tr className="border-t-2 bg-muted/30 font-semibold">
                              <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                              <td className="px-4 py-3 text-right">{clientReport.reduce((s, c) => s + c.workOrders, 0)}</td>
                              <td className="px-4 py-3 text-right text-yellow-600">{clientReport.reduce((s, c) => s + c.pending, 0)}</td>
                              <td className="px-4 py-3 text-right text-green-600">{clientReport.reduce((s, c) => s + c.completed, 0)}</td>
                              <td className="px-4 py-3 text-right">{clientReport.reduce((s, c) => s + c.invoices, 0)}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs">${fmt(clientReport.reduce((s, c) => s + c.totalBilled, 0))}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-green-600">${fmt(clientReport.reduce((s, c) => s + c.totalPaid, 0))}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-yellow-600">${fmt(clientReport.reduce((s, c) => s + c.outstanding, 0))}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-red-600">${fmt(clientReport.reduce((s, c) => s + c.overdue, 0))}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                      {clientReport.length === 0 && (
                        <p className="text-center py-10 text-muted-foreground">No client activity in this period.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── SUBCONTRACTORS TAB ───────────────────────────────────────── */}
            {activeTab === 'subcontractors' && (
              <div className="space-y-4">
                <SectionHeader title="Subcontractor Performance Report" count={subReport.length} onExport={exportSub} />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <KpiCard label="Total Quotes" value={subReport.reduce((s, r) => s + r.quotes, 0)}
                    icon={FileText} color="text-purple-600" />
                  <KpiCard label="Accepted Quotes" value={subReport.reduce((s, r) => s + r.accepted, 0)}
                    icon={CheckCircle} color="text-green-600" />
                  <KpiCard label="Total Quote Value" value={`$${fmt(subReport.reduce((s, r) => s + r.totalQuoteValue, 0))}`}
                    icon={TrendingUp} color="text-orange-600" />
                  <KpiCard label="Total Paid Out" value={`$${fmt(subReport.reduce((s, r) => s + r.totalPaid, 0))}`}
                    icon={Receipt} color="text-blue-600" />
                </div>

                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left px-4 py-3 font-medium">Subcontractor</th>
                            <th className="text-left px-4 py-3 font-medium">Business</th>
                            <th className="text-left px-4 py-3 font-medium">Status</th>
                            <th className="text-right px-4 py-3 font-medium">Quotes</th>
                            <th className="text-right px-4 py-3 font-medium">Accepted</th>
                            <th className="text-right px-4 py-3 font-medium">Accept Rate</th>
                            <th className="text-right px-4 py-3 font-medium">Quote Value</th>
                            <th className="text-right px-4 py-3 font-medium">Invoices</th>
                            <th className="text-right px-4 py-3 font-medium">Paid Out</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subReport.map(s => (
                            <tr key={s.id} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="px-4 py-3 font-medium">{s.name}</td>
                              <td className="px-4 py-3 text-muted-foreground">{s.business || '—'}</td>
                              <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                              <td className="px-4 py-3 text-right">{s.quotes}</td>
                              <td className="px-4 py-3 text-right text-green-600">{s.accepted}</td>
                              <td className="px-4 py-3 text-right">
                                <span className={s.acceptanceRate >= 50 ? 'text-green-600' : 'text-yellow-600'}>
                                  {s.acceptanceRate}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">${fmt(s.totalQuoteValue)}</td>
                              <td className="px-4 py-3 text-right">{s.invoices}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-green-600">${fmt(s.totalPaid)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {subReport.length === 0 && (
                        <p className="text-center py-10 text-muted-foreground">No subcontractor activity in this period.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── QUOTES TAB ───────────────────────────────────────────────── */}
            {activeTab === 'quotes' && (
              <div className="space-y-4">
                <SectionHeader title="Quotes Analysis" count={filteredQuotes.length} onExport={exportQuotes} />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <KpiCard label="Total Quotes" value={filteredQuotes.length} icon={FileText} color="text-purple-600" />
                  <KpiCard label="Accepted" value={acceptedQuotes.length}
                    sub={`${acceptanceRate}% acceptance rate`} icon={CheckCircle} color="text-green-600" />
                  <KpiCard label="Total Quote Value" value={`$${fmt(filteredQuotes.reduce((s, q) => s + (q.amount || 0), 0))}`}
                    icon={TrendingUp} color="text-blue-600" />
                  <KpiCard label="Avg Quote Value"
                    value={filteredQuotes.length ? `$${fmt(filteredQuotes.reduce((s, q) => s + (q.amount || 0), 0) / filteredQuotes.length)}` : '$0.00'}
                    icon={BarChart2} color="text-orange-600" />
                </div>

                {/* Status breakdown */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Quote Status Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {quoteByStatus.map(row => (
                        <div key={row.status} className="flex items-center gap-3">
                          <div className="w-28 shrink-0"><StatusBadge status={row.status} /></div>
                          <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all"
                              style={{ width: filteredQuotes.length ? `${(row.count / filteredQuotes.length) * 100}%` : '0%' }}
                            />
                          </div>
                          <span className="text-sm w-8 text-right">{row.count}</span>
                          <span className="text-sm font-mono text-xs w-24 text-right">${fmt(row.total)}</span>
                        </div>
                      ))}
                    </div>
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
                          {filteredQuotes.map(q => (
                            <tr key={q.id} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{q.id.slice(0, 10)}…</td>
                              <td className="px-4 py-3">{q.subcontractorName || q.subcontractorId.slice(0, 12)}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs">${fmt(q.amount || 0)}</td>
                              <td className="px-4 py-3"><StatusBadge status={q.status} /></td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">
                                {toDate(q.createdAt)?.toLocaleDateString() || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredQuotes.length === 0 && (
                        <p className="text-center py-10 text-muted-foreground">No quotes match the current filters.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── INVOICES TAB ─────────────────────────────────────────────── */}
            {activeTab === 'invoices' && (
              <div className="space-y-4">
                <SectionHeader title="Invoice Report" count={filteredInvoices.length} onExport={exportInv} />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <KpiCard label="Total Invoiced" value={`$${fmt(totalInvoiced)}`}
                    sub={`${filteredInvoices.length} invoices`} icon={Receipt} color="text-orange-600" />
                  <KpiCard label="Paid" value={`$${fmt(totalPaid)}`}
                    sub={`${paidInvoices.length} invoices`} icon={CheckCircle} color="text-green-600" />
                  <KpiCard label="Overdue" value={`$${fmt(totalOverdue)}`}
                    sub={`${overdueInvoices.length} invoices`} icon={AlertCircle} color="text-red-600" />
                  <KpiCard label="Collection Rate"
                    value={totalInvoiced ? `${Math.round(totalPaid / totalInvoiced * 100)}%` : '0%'}
                    icon={TrendingUp} color="text-blue-600" />
                </div>

                <Card>
                  <CardHeader><CardTitle className="text-base">Invoice Status Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {invByStatus.map(row => (
                        <div key={row.status} className="flex items-center gap-3">
                          <div className="w-24 shrink-0"><StatusBadge status={row.status} /></div>
                          <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full transition-all"
                              style={{ width: totalInvoiced ? `${(row.total / totalInvoiced) * 100}%` : '0%' }}
                            />
                          </div>
                          <span className="text-sm w-8 text-right">{row.count}</span>
                          <span className="text-sm font-mono text-xs w-28 text-right">${fmt(row.total)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

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
                          {filteredInvoices.map(inv => (
                            <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                {inv.invoiceNumber || inv.id.slice(0, 10)}
                              </td>
                              <td className="px-4 py-3 font-medium">{inv.clientName}</td>
                              <td className="px-4 py-3 text-muted-foreground">{inv.subcontractorName || '—'}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs">${fmt(inv.totalAmount || 0)}</td>
                              <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">
                                {toDate(inv.dueDate)?.toLocaleDateString() || '—'}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">
                                {toDate(inv.createdAt)?.toLocaleDateString() || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {filteredInvoices.length > 0 && (
                          <tfoot>
                            <tr className="border-t-2 bg-muted/30 font-semibold">
                              <td className="px-4 py-3" colSpan={3}>TOTAL</td>
                              <td className="px-4 py-3 text-right font-mono text-xs">${fmt(totalInvoiced)}</td>
                              <td colSpan={3} />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                      {filteredInvoices.length === 0 && (
                        <p className="text-center py-10 text-muted-foreground">No invoices match the current filters.</p>
                      )}
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
