'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  doc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Trash2,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';
import type { MessageChannel, MessageEventType, MessageStatus } from '@/lib/messaging/types';

interface MessageLog {
  id: string;
  channel: MessageChannel;
  provider: string;
  type: MessageEventType;
  to: string;
  toName?: string;
  recipientRole: string;
  body: string;
  status: MessageStatus;
  providerMessageId?: string;
  context: Record<string, any>;
  error?: string;
  idempotencyKey?: string;
  sentAt: Timestamp | null;
}

const EVENT_TYPE_LABELS: Record<MessageEventType, string> = {
  'subcontractor-approval': 'Subcontractor Approval',
  'bidding-opportunity': 'Bidding Opportunity',
  'quote-approved': 'Quote Approved',
  'client-approval': 'Client Approval',
  'work-order-assigned': 'WO Assigned',
  'work-order-completed': 'WO Completed',
  test: 'Test Message',
};

const EVENT_TYPE_COLORS: Record<MessageEventType, string> = {
  'subcontractor-approval': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
  'bidding-opportunity': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  'quote-approved': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  'client-approval': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  'work-order-assigned': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
  'work-order-completed': 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-300',
  test: 'bg-muted text-foreground',
};

const PAGE_SIZE = 25;

function formatDate(ts: Timestamp | null): string {
  if (!ts) return '—';
  try {
    return ts.toDate().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function StatusBadge({ status }: { status: MessageStatus }) {
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
        <CheckCircle2 className="h-3 w-3" /> Sent
      </span>
    );
  }
  if (status === 'queued') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
        <Clock className="h-3 w-3" /> Queued
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
        <XCircle className="h-3 w-3" /> Skipped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
      <XCircle className="h-3 w-3" /> Failed
    </span>
  );
}

interface MessageLogsPageProps {
  collection: 'smsLogs' | 'whatsappLogs';
}

export function MessageLogsPage({ collection: colName }: MessageLogsPageProps) {
  const isWhatsApp = colName === 'whatsappLogs';
  const title = isWhatsApp ? 'WhatsApp Logs' : 'SMS Logs';
  const provider = isWhatsApp ? 'Meta WhatsApp' : 'Blooio';

  const [loading, setLoading] = useState(true);
  const [allLogs, setAllLogs] = useState<MessageLog[]>([]);
  const [allLoaded, setAllLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<MessageLog | null>(null);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, colName), orderBy('sentAt', 'desc'), limit(500)),
      );
      setAllLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MessageLog, 'id'>) })));
      setAllLoaded(true);
    } catch (err) {
      console.error('Failed to load message logs:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { setPage(0); setSelectedIds(new Set()); }, [searchQuery, typeFilter, statusFilter]);

  async function handleRefresh() {
    setSyncing(true);
    try {
      await loadAll();
      toast.success(`${title} refreshed`);
    } catch {
      toast.error('Failed to refresh logs');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete(ids: string[]) {
    if (!ids.length) return;
    setDeleting(true);
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, colName, id)));
        await batch.commit();
      }
      setAllLogs((prev) => prev.filter((l) => !ids.includes(l.id)));
      setSelectedIds(new Set());
      setSelected(null);
      toast.success(`Deleted ${ids.length} log${ids.length > 1 ? 's' : ''}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete logs');
    } finally {
      setDeleting(false);
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function togglePageAll(pageItems: MessageLog[]) {
    if (pageItems.every((l) => selectedIds.has(l.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pageItems.map((l) => l.id)));
    }
  }

  const filtered = allLogs.filter((log) => {
    const ctx = JSON.stringify(log.context || {}).toLowerCase();
    const matchesSearch =
      !searchQuery ||
      (log.to || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.toName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      ctx.includes(searchQuery.toLowerCase()) ||
      (log.body || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || log.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <AdminLayout>
      <PageContainer>
        <PortalHero
          title={title}
          subtitle={`All ${isWhatsApp ? 'WhatsApp' : 'SMS'} messages sent via ${provider}`}
          icon={MessageSquare}
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-6 w-6 text-muted-foreground" />
              <div>
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="text-sm text-muted-foreground">
                  All {isWhatsApp ? 'WhatsApp' : 'SMS'} messages sent from the system
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
                {allLoaded ? `${filtered.length} of ${allLogs.length} messages` : 'Loading...'}
              </span>
              {selectedIds.size > 0 && (
                <Button variant="destructive" size="sm" onClick={() => handleDelete([...selectedIds])} disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleting ? 'Deleting...' : `Delete ${selectedIds.size} selected`}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by phone, name, body..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <SearchableSelect
              className="min-w-[200px]"
              value={typeFilter}
              onValueChange={setTypeFilter}
              options={[
                { value: 'all', label: 'All Types' },
                ...(Object.keys(EVENT_TYPE_LABELS) as MessageEventType[]).map((t) => ({
                  value: t,
                  label: EVENT_TYPE_LABELS[t],
                })),
              ]}
              placeholder="Event type..."
            />

            <SearchableSelect
              className="min-w-[150px]"
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'sent', label: 'Sent' },
                { value: 'queued', label: 'Queued' },
                { value: 'skipped', label: 'Skipped' },
                { value: 'failed', label: 'Failed' },
              ]}
              placeholder="Status..."
            />
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={paginated.length > 0 && paginated.every((l) => selectedIds.has(l.id))}
                        onChange={() => togglePageAll(paginated)}
                        className="rounded border-gray-300 cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Details</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Recipient</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Body</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Provider</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-muted-foreground">Loading {title.toLowerCase()}...</td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-muted-foreground">
                        {allLogs.length === 0 ? 'No messages have been sent yet.' : 'No messages match your filters.'}
                      </td>
                    </tr>
                  ) : (
                    paginated.map((log) => (
                      <tr
                        key={log.id}
                        className={`border-t border-border hover:bg-muted/30 transition-colors ${selectedIds.has(log.id) ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                      >
                        <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(log.id)}
                            onChange={() => toggleRow(log.id)}
                            className="rounded border-gray-300 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs cursor-pointer" onClick={() => setSelected(log)}>
                          {formatDate(log.sentAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => setSelected(log)}>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${EVENT_TYPE_COLORS[log.type] || 'bg-muted text-foreground'}`}>
                            {EVENT_TYPE_LABELS[log.type] || log.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(log)}>
                          <div className="flex flex-col gap-0.5">
                            {log.context?.workOrderNumber && (
                              <span className="font-semibold text-xs">WO #{log.context.workOrderNumber}</span>
                            )}
                            {log.context?.workOrderTitle && (
                              <span className="text-xs text-muted-foreground truncate max-w-[150px]">{log.context.workOrderTitle}</span>
                            )}
                            {!log.context?.workOrderNumber && !log.context?.workOrderTitle && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(log)}>
                          <div className="flex flex-col gap-0.5">
                            {log.toName && <span className="text-xs font-medium">{log.toName}</span>}
                            <span className="text-xs font-mono text-muted-foreground">{log.to}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs cursor-pointer" onClick={() => setSelected(log)}>
                          <span className="truncate block text-xs text-muted-foreground">{log.body}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => setSelected(log)}>
                          <span className="text-xs text-muted-foreground">{log.provider || provider}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => setSelected(log)}>
                          <StatusBadge status={log.status} />
                        </td>
                        <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDelete([log.id])}
                            disabled={deleting}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                            title="Delete log"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({filtered.length} results)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Detail Dialog */}
        <Dialog open={!!selected} onOpenChange={(open: boolean) => !open && setSelected(null)}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            {selected && (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between gap-3">
                    <DialogTitle className="flex items-center gap-2 text-base">
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      Message Record
                    </DialogTitle>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete([selected.id])}
                        disabled={deleting}
                        className="gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deleting ? 'Deleting...' : 'Delete'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-5 mt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={selected.status} />
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${EVENT_TYPE_COLORS[selected.type] || 'bg-muted text-foreground'}`}>
                      {EVENT_TYPE_LABELS[selected.type] || selected.type}
                    </span>
                  </div>

                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Delivery Info
                    </div>
                    <div className="divide-y divide-border">
                      <DetailRow label="Date Sent" value={formatDate(selected.sentAt)} />
                      <DetailRow label="Channel" value={selected.channel?.toUpperCase() || '—'} />
                      <DetailRow label="Provider" value={selected.provider || '—'} />
                      <DetailRow label="To" value={selected.to} mono />
                      {selected.toName && <DetailRow label="Recipient Name" value={selected.toName} />}
                      {selected.providerMessageId && <DetailRow label="Provider Message ID" value={selected.providerMessageId} mono />}
                      {selected.idempotencyKey && <DetailRow label="Idempotency Key" value={selected.idempotencyKey} mono />}
                      {selected.error && <DetailRow label="Error" value={selected.error} error />}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Message Body
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-sm whitespace-pre-wrap break-words">{selected.body || '—'}</p>
                    </div>
                  </div>

                  {(() => {
                    const ctx = selected.context || {};
                    const entries = Object.entries(ctx).filter(([, v]) => v !== null && v !== undefined && v !== '');
                    if (!entries.length) return null;
                    return (
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Context
                        </div>
                        <div className="divide-y divide-border">
                          {entries.map(([k, v]) => (
                            <DetailRow key={k} label={k} value={typeof v === 'object' ? JSON.stringify(v) : String(v)} />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </PageContainer>
    </AdminLayout>
  );
}

function DetailRow({ label, value, mono, error }: { label: string; value: any; mono?: boolean; error?: boolean }) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <span className="text-muted-foreground text-sm w-40 flex-shrink-0 font-medium">{label}</span>
      <span className={`text-sm break-all ${mono ? 'font-mono' : ''} ${error ? 'text-red-600 dark:text-red-400' : ''}`}>
        {String(value ?? '')}
      </span>
    </div>
  );
}
