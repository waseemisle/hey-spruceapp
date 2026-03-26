'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Headphones, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { toast } from 'sonner';
import type { SupportTicket, SupportTicketStatus, SupportTicketCategory, SupportTicketPriority, SupportTicketType } from '@/types';
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
} from '@/lib/support-ticket-helpers';
import { supportTicketPost } from '@/lib/support-ticket-api-client';

const OPEN_STATUSES: SupportTicketStatus[] = [
  'open',
  'in-progress',
  'waiting-on-client',
  'waiting-on-admin',
];

function toTime(v: unknown): number {
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  if (v instanceof Date) return v.getTime();
  return 0;
}

function statusBadgeClass(s: string) {
  const map: Record<string, string> = {
    open: 'bg-blue-50 text-blue-800 border-blue-200',
    'in-progress': 'bg-amber-50 text-amber-800 border-amber-200',
    'waiting-on-client': 'bg-orange-50 text-orange-800 border-orange-200',
    'waiting-on-admin': 'bg-purple-50 text-purple-800 border-purple-200',
    resolved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    closed: 'bg-muted text-foreground border-border',
  };
  return map[s] || 'bg-muted text-foreground border-border';
}

function priorityBadgeClass(p: string) {
  const map: Record<string, string> = {
    urgent: 'bg-red-50 text-red-800 border-red-200',
    high: 'bg-orange-50 text-orange-800 border-orange-200',
    medium: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    low: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return map[p] || 'bg-slate-50 text-slate-700 border-slate-200';
}

const ALL_STATUSES: SupportTicketStatus[] = [
  'open',
  'in-progress',
  'waiting-on-client',
  'waiting-on-admin',
  'resolved',
  'closed',
];

const CATEGORIES: SupportTicketCategory[] = [
  'billing',
  'technical',
  'work-order',
  'account',
  'general',
  'bug-report',
  'feature-request',
];

const PRIORITIES: SupportTicketPriority[] = ['low', 'medium', 'high', 'urgent'];
const TYPES: SupportTicketType[] = ['question', 'problem', 'task', 'incident'];

export default function AdminSupportTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [admins, setAdmins] = useState<{ id: string; fullName: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; fullName: string }[]>([]);
  const [subs, setSubs] = useState<{ id: string; fullName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 25;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'general' as SupportTicketCategory,
    priority: 'medium' as SupportTicketPriority,
    type: 'question' as SupportTicketType,
    onBehalfOfUid: '',
  });

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'supportTickets'),
      (snap) => {
        const list: SupportTicket[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportTicket));
        list.sort((a, b) => toTime(b.lastActivityAt) - toTime(a.lastActivityAt));
        setTickets(list);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error('Failed to load tickets');
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [a, c, s] = await Promise.all([
          getDocs(collection(db, 'adminUsers')),
          getDocs(collection(db, 'clients')),
          getDocs(collection(db, 'subcontractors')),
        ]);
        setAdmins(a.docs.map((d) => ({ id: d.id, fullName: (d.data().fullName as string) || d.id })));
        setClients(c.docs.map((d) => ({ id: d.id, fullName: (d.data().fullName as string) || d.id })));
        setSubs(s.docs.map((d) => ({ id: d.id, fullName: (d.data().fullName as string) || d.id })));
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
  const toTs = dateTo ? new Date(dateTo).getTime() + 86400000 - 1 : null;

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${t.ticketNumber} ${t.title} ${t.submittedByName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (roleFilter !== 'all' && t.submittedByRole !== roleFilter) return false;
      if (assignedFilter === 'unassigned' && t.assignedTo) return false;
      if (assignedFilter !== 'all' && assignedFilter !== 'unassigned' && t.assignedTo !== assignedFilter) return false;
      const la = toTime(t.lastActivityAt);
      if (fromTs !== null && la < fromTs) return false;
      if (toTs !== null && la > toTs) return false;
      return true;
    });
  }, [tickets, search, statusFilter, priorityFilter, categoryFilter, roleFilter, assignedFilter, fromTs, toTs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const pageSlice = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const stats = useMemo(() => {
    const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length;
    const urgentHigh = tickets.filter(
      (t) => OPEN_STATUSES.includes(t.status) && (t.priority === 'urgent' || t.priority === 'high'),
    ).length;
    const unassigned = tickets.filter((t) => OPEN_STATUSES.includes(t.status) && !t.assignedTo).length;
    const resolvedMonth = tickets.filter((t) => {
      if (t.status !== 'resolved' && t.status !== 'closed') return false;
      return toTime(t.resolvedAt) >= monthStart;
    }).length;
    return { open, urgentHigh, unassigned, resolvedMonth };
  }, [tickets, monthStart]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setAssignedFilter('all');
    setRoleFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Title and description are required');
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
        type: form.type,
      };
      if (form.onBehalfOfUid) body.onBehalfOfUid = form.onBehalfOfUid;
      const res = (await supportTicketPost('/api/support-tickets/create', body)) as { ticketId?: string };
      toast.success('Ticket created');
      setDialogOpen(false);
      setForm({
        title: '',
        description: '',
        category: 'general',
        priority: 'medium',
        type: 'question',
        onBehalfOfUid: '',
      });
      if (res.ticketId) window.location.href = `/admin-portal/support-tickets/${res.ticketId}`;
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const behalfOptions = useMemo(() => {
    return [
      { id: '', label: 'Self (logged-in admin)' },
      ...clients.map((c) => ({ id: c.id, label: `Client: ${c.fullName}` })),
      ...subs.map((s) => ({ id: s.id, label: `Sub: ${s.fullName}` })),
      ...admins.map((a) => ({ id: a.id, label: `Admin: ${a.fullName}` })),
    ];
  }, [clients, subs, admins]);

  if (loading && tickets.length === 0) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageContainer>
        <PageHeader
          title="Support Tickets"
          subtitle="Track and respond to customer support requests"
          icon={Headphones}
          action={
            <Button onClick={() => setDialogOpen(true)}>New Ticket</Button>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs text-blue-700 opacity-75">Open Tickets</p>
            <p className="text-xl font-bold text-blue-900">{stats.open}</p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
            <p className="text-xs text-orange-800 opacity-75">Urgent / High</p>
            <p className="text-xl font-bold text-orange-900">{stats.urgentHigh}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-xs text-amber-800 opacity-75">Unassigned</p>
            <p className="text-xl font-bold text-amber-900">{stats.unassigned}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-800 opacity-75">Resolved This Month</p>
            <p className="text-xl font-bold text-emerald-900">{stats.resolvedMonth}</p>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 space-y-3 shadow-sm">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                placeholder="Ticket #, title, submitter…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <SearchableSelect
                className="mt-1 w-full min-w-[140px]"
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
                options={[
                  { value: 'all', label: 'All' },
                  ...ALL_STATUSES.map((s) => ({ value: s, label: SUPPORT_STATUS_LABELS[s] })),
                ]}
                placeholder="Status"
                aria-label="Filter by status"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <SearchableSelect
                className="mt-1 w-full min-w-[100px]"
                value={priorityFilter}
                onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}
                options={[
                  { value: 'all', label: 'All' },
                  ...PRIORITIES.map((p) => ({ value: p, label: p })),
                ]}
                placeholder="Priority"
                aria-label="Filter by priority"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Category</Label>
              <SearchableSelect
                className="mt-1 w-full min-w-[140px]"
                value={categoryFilter}
                onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}
                options={[
                  { value: 'all', label: 'All' },
                  ...CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY_LABELS[c] })),
                ]}
                placeholder="Category"
                aria-label="Filter by category"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Assigned</Label>
              <SearchableSelect
                className="mt-1 w-full min-w-[140px]"
                value={assignedFilter}
                onValueChange={(v) => { setAssignedFilter(v); setPage(1); }}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'unassigned', label: 'Unassigned' },
                  ...admins.map((a) => ({ value: a.id, label: a.fullName })),
                ]}
                placeholder="Assigned"
                aria-label="Filter by assignee"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Submitter role</Label>
              <SearchableSelect
                className="mt-1 w-full min-w-[120px]"
                value={roleFilter}
                onValueChange={(v) => { setRoleFilter(v); setPage(1); }}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'client', label: 'Client' },
                  { value: 'subcontractor', label: 'Subcontractor' },
                  { value: 'admin', label: 'Admin' },
                ]}
                placeholder="Role"
                aria-label="Filter by submitter role"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" className="mt-1 w-[150px]" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" className="mt-1 w-[150px]" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            </div>
            <Button type="button" variant="outline" onClick={clearFilters}>Clear Filters</Button>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ticket #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Submitter</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assigned</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last activity</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Comments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageSlice.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">No tickets match filters.</td>
                </tr>
              ) : (
                pageSlice.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => { window.location.href = `/admin-portal/support-tickets/${t.id}`; }}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{t.ticketNumber}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate font-medium text-foreground">{t.title}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span>{t.submittedByName}</span>
                        <Badge variant="outline" className="w-fit text-[10px] capitalize">{t.submittedByRole}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">{SUPPORT_CATEGORY_LABELS[t.category] || t.category}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${priorityBadgeClass(t.priority)}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadgeClass(t.status)}`}>
                        {SUPPORT_STATUS_LABELS[t.status] || t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{t.assignedToName || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {t.lastActivityAt && typeof (t.lastActivityAt as { toDate?: () => Date }).toDate === 'function'
                        ? (t.lastActivityAt as { toDate: () => Date }).toDate().toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">{t.commentCount ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > rowsPerPage && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {(page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(1)} aria-label="First page">
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(totalPages)} aria-label="Last page">
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New support ticket</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>On behalf of</Label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={form.onBehalfOfUid}
                  onValueChange={(v) => setForm((f) => ({ ...f, onBehalfOfUid: v }))}
                  options={behalfOptions.map((o) => ({ value: o.id, label: o.label }))}
                  placeholder="On behalf of"
                  aria-label="On behalf of"
                />
              </div>
              <div>
                <Label>Title</Label>
                <Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={120} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea className="mt-1 min-h-[100px]" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Category</Label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={form.category}
                    onValueChange={(v) => setForm((f) => ({ ...f, category: v as SupportTicketCategory }))}
                    options={CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY_LABELS[c] }))}
                    placeholder="Category"
                    aria-label="Category"
                  />
                </div>
                <div>
                  <Label>Priority</Label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={form.priority}
                    onValueChange={(v) => setForm((f) => ({ ...f, priority: v as SupportTicketPriority }))}
                    options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                    placeholder="Priority"
                    aria-label="Priority"
                  />
                </div>
              </div>
              <div>
                <Label>Type</Label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as SupportTicketType }))}
                  options={TYPES.map((t) => ({ value: t, label: t }))}
                  placeholder="Type"
                  aria-label="Ticket type"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </AdminLayout>
  );
}
