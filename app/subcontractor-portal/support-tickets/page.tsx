'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { subscribeSubcontractorSupportTickets } from '@/lib/support-ticket-snapshots';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Headphones, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { toast } from 'sonner';
import type { SupportTicket, SupportTicketCategory, SupportTicketPriority, SupportTicketType } from '@/types';
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS } from '@/lib/support-ticket-helpers';
import { supportTicketPost } from '@/lib/support-ticket-api-client';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';

const OPEN_STATUSES = ['open', 'in-progress', 'waiting-on-client', 'waiting-on-admin'];
const TERMINAL = ['resolved', 'closed'];

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

function statusClass(s: string) {
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

function priorityClass(p: string) {
  const map: Record<string, string> = {
    urgent: 'bg-red-50 text-red-800 border-red-200',
    high: 'bg-orange-50 text-orange-800 border-orange-200',
    medium: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    low: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return map[p] || 'bg-slate-50 text-slate-700 border-slate-200';
}

export default function SubcontractorSupportTicketsPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [workOrders, setWorkOrders] = useState<{ id: string; label: string }[]>([]);
  const [quotes, setQuotes] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
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
    relatedWorkOrderId: '',
    relatedQuoteId: '',
    tags: [] as string[],
    tagInput: '',
  });
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setAuthChecked(true);
      if (!user) setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authChecked || !uid) return;
    const unsub = subscribeSubcontractorSupportTickets(
      db,
      uid,
      (mine) => {
        setTickets(mine);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [authChecked, uid]);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const [jobsSnap, qSnap] = await Promise.all([
          getDocs(query(collection(db, 'assignedJobs'), where('subcontractorId', '==', uid))),
          getDocs(query(collection(db, 'quotes'), where('subcontractorId', '==', uid))),
        ]);
        const woIds = new Set<string>();
        jobsSnap.docs.forEach((d) => {
          const data = d.data();
          woIds.add(data.workOrderId as string);
        });
        const woOptions: { id: string; label: string }[] = [];
        for (const wid of woIds) {
          const w = await getDoc(doc(db, 'workOrders', wid));
          if (w.exists()) {
            const wd = w.data();
            woOptions.push({
              id: wid,
              label: `${wd.workOrderNumber || wid} — ${wd.title || ''}`,
            });
          }
        }
        setWorkOrders(woOptions);
        setQuotes(
          qSnap.docs.map((d) => ({
            id: d.id,
            label: `${d.data().workOrderNumber || ''} — quote`,
          })),
        );
      } catch (e) {
        console.error(e);
      }
    })();
  }, [uid]);

  const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
  const toTs = dateTo ? new Date(dateTo).getTime() + 86400000 - 1 : null;

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      const q = search.trim().toLowerCase();
      if (q && !`${t.ticketNumber} ${t.title}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      const la = t.lastActivityAt && typeof (t.lastActivityAt as { toMillis?: () => number }).toMillis === 'function'
        ? (t.lastActivityAt as { toMillis: () => number }).toMillis()
        : 0;
      if (fromTs !== null && la < fromTs) return false;
      if (toTs !== null && la > toTs) return false;
      return true;
    });
  }, [tickets, search, statusFilter, fromTs, toTs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const pageSlice = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const stats = useMemo(() => {
    const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length;
    const resolved = tickets.filter((t) => TERMINAL.includes(t.status)).length;
    return { open, resolved };
  }, [tickets]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Title and description are required');
      return;
    }
    setCreating(true);
    try {
      const attachments: { fileName: string; fileUrl: string; fileType: string; fileSize: number }[] = [];
      for (const f of files) {
        const url = await uploadToCloudinary(f);
        attachments.push({
          fileName: f.name,
          fileUrl: url,
          fileType: f.type || 'application/octet-stream',
          fileSize: f.size,
        });
      }
      await supportTicketPost('/api/support-tickets/create', {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
        type: form.type,
        ...(form.relatedWorkOrderId ? { relatedWorkOrderId: form.relatedWorkOrderId } : {}),
        ...(form.relatedQuoteId ? { relatedQuoteId: form.relatedQuoteId } : {}),
        tags: form.tags,
        attachments,
      });
      toast.success('Ticket created');
      setDialogOpen(false);
      setForm({
        title: '',
        description: '',
        category: 'general',
        priority: 'medium',
        type: 'question',
        relatedWorkOrderId: '',
        relatedQuoteId: '',
        tags: [],
        tagInput: '',
      });
      setFiles([]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setCreating(false);
    }
  };

  if (loading && tickets.length === 0) {
    return (
      <SubcontractorLayout>
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <PageContainer>
        <PageHeader
          title="Support Tickets"
          subtitle="Contact the GroundOps team"
          icon={Headphones}
          action={<Button onClick={() => setDialogOpen(true)}>Create New Ticket</Button>}
        />

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs text-blue-700 opacity-75">Open</p>
            <p className="text-xl font-bold text-blue-900">{stats.open}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-800 opacity-75">Resolved</p>
            <p className="text-xl font-bold text-emerald-900">{stats.resolved}</p>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 flex flex-wrap gap-3 items-end shadow-sm">
          <div className="relative flex-1 min-w-[180px]">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <Input className="mt-1" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Ticket # or title" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <SearchableSelect
              className="mt-1 w-full min-w-[160px]"
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'open', label: 'Open' },
                { value: 'in-progress', label: 'In progress' },
                { value: 'waiting-on-client', label: 'Waiting on client' },
                { value: 'waiting-on-admin', label: 'Waiting on admin' },
                { value: 'resolved', label: 'Resolved' },
                { value: 'closed', label: 'Closed' },
              ]}
              placeholder="Status"
              aria-label="Filter by status"
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
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ticket #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last update</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Comments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageSlice.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No tickets yet.</td></tr>
              ) : (
                pageSlice.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-muted cursor-pointer"
                    onClick={() => { window.location.href = `/subcontractor-portal/support-tickets/${t.id}`; }}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{t.ticketNumber}</td>
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate">{t.title}</td>
                    <td className="px-4 py-3">{SUPPORT_CATEGORY_LABELS[t.category]}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityClass(t.priority)}`}>{t.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusClass(t.status)}`}>
                        {SUPPORT_STATUS_LABELS[t.status]}
                      </span>
                    </td>
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
            <span>{(page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)} of {filtered.length}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(1)}><ChevronsLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create support ticket</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Title *</Label>
                <Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={120} />
              </div>
              <div>
                <Label>Description *</Label>
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
              <div>
                <Label>Related assigned work order</Label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={form.relatedWorkOrderId}
                  onValueChange={(v) => setForm((f) => ({ ...f, relatedWorkOrderId: v }))}
                  options={[{ value: '', label: 'None' }, ...workOrders.map((w) => ({ value: w.id, label: w.label }))]}
                  placeholder="None"
                  aria-label="Related work order"
                />
              </div>
              <div>
                <Label>Related quote</Label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={form.relatedQuoteId}
                  onValueChange={(v) => setForm((f) => ({ ...f, relatedQuoteId: v }))}
                  options={[{ value: '', label: 'None' }, ...quotes.map((q) => ({ value: q.id, label: q.label }))]}
                  placeholder="None"
                  aria-label="Related quote"
                />
              </div>
              <div>
                <Label>Tags</Label>
                <Input
                  className="mt-1"
                  value={form.tagInput}
                  onChange={(e) => setForm((f) => ({ ...f, tagInput: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = form.tagInput.trim();
                      if (v && !form.tags.includes(v)) setForm((f) => ({ ...f, tags: [...f.tags, v], tagInput: '' }));
                    }
                  }}
                  placeholder="Type and press Enter"
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.tags.map((t) => (
                    <button key={t} type="button" className="text-xs px-2 py-0.5 rounded-full bg-muted border" onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))}>
                      {t} ×
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Attachments</Label>
                <Input type="file" multiple className="mt-1" onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>{creating ? 'Submitting…' : 'Submit'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </SubcontractorLayout>
  );
}
