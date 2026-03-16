'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mail, ChevronLeft, ChevronRight, Search, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { EmailType } from '@/lib/email-logger';

interface EmailLog {
  id: string;
  type: EmailType;
  to: string | string[];
  subject: string;
  status: 'sent' | 'failed';
  context: Record<string, any>;
  error?: string;
  sentAt: Timestamp | null;
}

const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  invoice: 'Invoice',
  quote: 'Quote',
  invitation: 'Invitation',
  assignment: 'Work Order Assignment',
  'bidding-opportunity': 'Bidding Opportunity',
  'client-approval': 'Client Approval',
  'subcontractor-approval': 'Subcontractor Approval',
  'maint-request-notification': 'Maintenance Request',
  'scheduled-service': 'Scheduled Service',
  'quote-notification': 'Quote Notification',
  'review-request': 'Review Request',
  'work-order-notification': 'Work Order Notification',
  'work-order-completed-notification': 'Work Order Completed',
  test: 'Test Email',
};

const EMAIL_TYPE_COLORS: Record<EmailType, string> = {
  invoice: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  quote: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  invitation: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  assignment: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
  'bidding-opportunity': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  'client-approval': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  'subcontractor-approval': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
  'maint-request-notification': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  'scheduled-service': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  'quote-notification': 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300',
  'review-request': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  'work-order-notification': 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300',
  'work-order-completed-notification': 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-300',
  test: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

const PAGE_SIZE = 25;

function formatDate(ts: Timestamp | null): string {
  if (!ts) return '—';
  try {
    return ts.toDate().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function toArray(val: string | string[]): string[] {
  return Array.isArray(val) ? val : [val];
}

function ContextRow({ label, value }: { label: string; value: any }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex gap-2 py-1.5 border-b border-border last:border-0">
      <span className="text-muted-foreground text-sm w-44 flex-shrink-0 font-medium capitalize">
        {label.replace(/([A-Z])/g, ' $1').trim()}
      </span>
      <span className="text-sm break-all">{String(value)}</span>
    </div>
  );
}

export default function EmailLogsPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false); // kept for refresh button
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<EmailLog | null>(null);
  const [allLogs, setAllLogs] = useState<EmailLog[]>([]);
  const [allLoaded, setAllLoaded] = useState(false);
  const [page, setPage] = useState(0);

  async function loadAll() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'emailLogs'), orderBy('sentAt', 'desc'), limit(500)),
      );
      setAllLogs(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EmailLog, 'id'>),
        })),
      );
      setAllLoaded(true);
    } catch (err) {
      console.error('Failed to load email logs:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function syncMailgunLogs() {
    setSyncing(true);
    try {
      await loadAll();
      toast.success('Email logs refreshed');
    } catch (err: any) {
      toast.error('Failed to refresh email logs');
    } finally {
      setSyncing(false);
    }
  }

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [searchQuery, typeFilter, statusFilter]);

  const filtered = allLogs.filter((log) => {
    const recipients = toArray(log.to).join(', ').toLowerCase();
    const matchesSearch =
      !searchQuery ||
      recipients.includes(searchQuery.toLowerCase()) ||
      (log.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(log.context || {}).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || log.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-bold">Email Logs</h1>
              <p className="text-sm text-muted-foreground">
                All emails sent from the system
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
              {allLoaded ? `${filtered.length} of ${allLogs.length} emails` : 'Loading...'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={syncMailgunLogs}
              disabled={syncing}
            >
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
              placeholder="Search by recipient, subject..."
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

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Types</option>
            {(Object.keys(EMAIL_TYPE_LABELS) as EmailType[]).map((t) => (
              <option key={t} value={t}>
                {EMAIL_TYPE_LABELS[t]}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Status</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">To</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Subject</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-muted-foreground">
                      Loading email logs...
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-muted-foreground">
                      {allLogs.length === 0
                        ? 'No emails have been sent yet. Logs will appear here once emails are sent.'
                        : 'No emails match your filters.'}
                    </td>
                  </tr>
                ) : (
                  paginated.map((log) => {
                    const recipients = toArray(log.to);
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelected(log)}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                          {formatDate(log.sentAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              EMAIL_TYPE_COLORS[log.type] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {EMAIL_TYPE_LABELS[log.type] || log.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {recipients.slice(0, 2).map((r, i) => (
                              <span key={i} className="text-xs font-mono">
                                {r}
                              </span>
                            ))}
                            {recipients.length > 2 && (
                              <span className="text-xs text-muted-foreground">
                                +{recipients.length - 2} more
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <span className="truncate block">{log.subject}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              log.status === 'sent'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                            }`}
                          >
                            {log.status === 'sent' ? 'Sent' : 'Failed'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages} ({filtered.length} results)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open: boolean) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Detail
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6 mt-2">
                {/* Status & Type */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                      selected.status === 'sent'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                    }`}
                  >
                    {selected.status === 'sent' ? 'Sent' : 'Failed'}
                  </span>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                      EMAIL_TYPE_COLORS[selected.type] || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {EMAIL_TYPE_LABELS[selected.type] || selected.type}
                  </span>
                </div>

                {/* Core info */}
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Message Info
                  </div>
                  <div className="p-4 space-y-1">
                    <ContextRow label="Date Sent" value={formatDate(selected.sentAt)} />
                    <ContextRow label="To" value={toArray(selected.to).join(', ')} />
                    <ContextRow label="Subject" value={selected.subject} />
                    {selected.error && (
                      <ContextRow label="Error" value={selected.error} />
                    )}
                  </div>
                </div>

                {/* Context */}
                {selected.context && Object.keys(selected.context).length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Email Context
                    </div>
                    <div className="p-4 space-y-1">
                      {Object.entries(selected.context).map(([key, val]) => (
                        <ContextRow key={key} label={key} value={val} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
