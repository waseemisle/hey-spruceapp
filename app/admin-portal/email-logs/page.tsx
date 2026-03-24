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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mail, ChevronLeft, ChevronRight, Search, X, RefreshCw, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
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
  assignment: 'WO Assignment',
  'bidding-opportunity': 'Bidding Opportunity',
  'client-approval': 'Client Approval',
  'subcontractor-approval': 'Subcontractor Approval',
  'maint-request-notification': 'Maintenance Request',
  'scheduled-service': 'Scheduled Service',
  'quote-notification': 'Quote Notification',
  'review-request': 'Review Request',
  'work-order-notification': 'Work Order Created',
  'work-order-completed-notification': 'Work Order Completed',
  'support-ticket-notification': 'Support Ticket (new)',
  'support-ticket-comment': 'Support Ticket (reply)',
  'support-ticket-status-change': 'Support Ticket (status)',
  'support-ticket-assigned': 'Support Ticket (assigned)',
  'auto-charge-receipt': 'Auto-Charge Receipt',
  'work-order-completion-client': 'WO Completed (Client)',
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
  'support-ticket-notification': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  'support-ticket-comment': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  'support-ticket-status-change': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  'support-ticket-assigned': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  'auto-charge-receipt': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  'work-order-completion-client': 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-300',
  test: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
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

function toArray(val: string | string[]): string[] {
  return Array.isArray(val) ? val : [val];
}

/** Returns the most useful 1-2 line summary for the table row */
function getQuickSummary(type: EmailType, ctx: Record<string, any>): { primary: string; secondary?: string } {
  const c = ctx || {};
  switch (type) {
    case 'invoice':
      return {
        primary: c.invoiceNumber ? `Invoice #${c.invoiceNumber}` : '—',
        secondary: c.workOrderTitle || c.toName,
      };
    case 'quote':
      return {
        primary: c.quoteNumber ? `Quote #${c.quoteNumber}` : '—',
        secondary: c.workOrderTitle,
      };
    case 'quote-notification':
      return {
        primary: c.workOrderNumber ? `WO #${c.workOrderNumber}` : '—',
        secondary: c.subcontractorName ? `From: ${c.subcontractorName}` : c.workOrderTitle,
      };
    case 'assignment':
      return {
        primary: c.workOrderNumber ? `WO #${c.workOrderNumber}` : '—',
        secondary: c.workOrderTitle || c.clientName,
      };
    case 'bidding-opportunity':
      return {
        primary: c.workOrderNumber ? `WO #${c.workOrderNumber}` : '—',
        secondary: c.workOrderTitle || c.category,
      };
    case 'work-order-notification':
    case 'work-order-completed-notification':
      return {
        primary: c.workOrderNumber ? `WO #${c.workOrderNumber}` : '—',
        secondary: c.title || c.clientName,
      };
    case 'scheduled-service':
      return {
        primary: c.workOrderNumber ? `WO #${c.workOrderNumber}` : '—',
        secondary: c.workOrderTitle || (c.scheduledDate ? `Date: ${c.scheduledDate}` : undefined),
      };
    case 'review-request':
      return {
        primary: c.workOrderNumber ? `WO #${c.workOrderNumber}` : '—',
        secondary: c.toName,
      };
    case 'maint-request-notification':
      return {
        primary: c.title || c.venue || '—',
        secondary: c.requestor ? `By: ${c.requestor}` : c.venue,
      };
    case 'client-approval':
      return {
        primary: c.toName || '—',
        secondary: c.approvedBy ? `Approved by: ${c.approvedBy}` : undefined,
      };
    case 'subcontractor-approval':
      return {
        primary: c.toName || '—',
        secondary: c.businessName || (c.approvedBy ? `Approved by: ${c.approvedBy}` : undefined),
      };
    case 'invitation':
      return {
        primary: c.fullName || '—',
        secondary: c.role ? `Role: ${c.role}` : undefined,
      };
    default:
      return { primary: '—' };
  }
}

/** Structured detail rows for the dialog, per email type */
function getDetailFields(type: EmailType, ctx: Record<string, any>): { label: string; value: any }[] {
  const c = ctx || {};
  const fmt = (v: any) => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object' && !Array.isArray(v)) {
      // Format address objects like {street, city, state, zip}
      const parts = [v.street, v.city, v.state, v.zip].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : JSON.stringify(v);
    }
    return v;
  };

  switch (type) {
    case 'invoice':
      return [
        { label: 'Invoice #', value: fmt(c.invoiceNumber) },
        { label: 'Work Order', value: fmt(c.workOrderTitle) },
        { label: 'Customer', value: fmt(c.toName) },
        { label: 'Total Amount', value: c.totalAmount != null ? `$${Number(c.totalAmount).toFixed(2)}` : null },
        { label: 'Due Date', value: fmt(c.dueDate) },
        { label: 'Notes', value: fmt(c.notes) },
        { label: 'PDF Attached', value: c.hasAttachment ? 'Yes' : null },
        { label: 'Work Order PDF', value: c.hasWorkOrderAttachment ? 'Yes' : null },
      ];
    case 'quote':
      return [
        { label: 'Quote #', value: fmt(c.quoteNumber) },
        { label: 'Work Order', value: fmt(c.workOrderTitle) },
        { label: 'Recipient', value: fmt(c.toName) },
        { label: 'Quote Amount', value: c.totalAmount != null ? `$${Number(c.totalAmount).toFixed(2)}` : null },
        { label: 'Client Amount', value: c.clientAmount != null ? `$${Number(c.clientAmount).toFixed(2)}` : null },
        { label: 'Markup', value: c.markupPercentage != null ? `${c.markupPercentage}%` : null },
        { label: 'Notes', value: fmt(c.notes) },
      ];
    case 'quote-notification':
      return [
        { label: 'Work Order #', value: fmt(c.workOrderNumber) },
        { label: 'Work Order Title', value: fmt(c.workOrderTitle) },
        { label: 'Subcontractor', value: fmt(c.subcontractorName) },
        { label: 'Quote Amount', value: c.quoteAmount != null ? `$${Number(c.quoteAmount).toFixed(2)}` : null },
        { label: 'Proposed Date', value: fmt(c.proposedServiceDate) },
        { label: 'Proposed Time', value: fmt(c.proposedServiceTime) },
        { label: 'Sent To', value: fmt(c.toName) },
      ];
    case 'assignment':
      return [
        { label: 'Work Order #', value: fmt(c.workOrderNumber) },
        { label: 'Work Order Title', value: fmt(c.workOrderTitle) },
        { label: 'Assigned To', value: fmt(c.toName) },
        { label: 'Client', value: fmt(c.clientName) },
        { label: 'Location', value: fmt(c.locationName) },
        { label: 'Address', value: fmt(c.locationAddress) },
      ];
    case 'bidding-opportunity':
      return [
        { label: 'Work Order #', value: fmt(c.workOrderNumber) },
        { label: 'Work Order Title', value: fmt(c.workOrderTitle) },
        { label: 'Sent To', value: fmt(c.toName) },
        { label: 'Category', value: fmt(c.category) },
        { label: 'Location', value: fmt(c.locationName) },
        { label: 'Priority', value: fmt(c.priority) },
        { label: 'Description', value: fmt(c.workOrderDescription) },
      ];
    case 'work-order-notification':
      return [
        { label: 'Work Order #', value: fmt(c.workOrderNumber) },
        { label: 'Title', value: fmt(c.title) },
        { label: 'Client', value: fmt(c.clientName) },
        { label: 'Location', value: fmt(c.locationName) },
        { label: 'Priority', value: fmt(c.priority) },
        { label: 'Type', value: fmt(c.workOrderType) },
        { label: 'Description', value: fmt(c.description) },
      ];
    case 'work-order-completed-notification':
      return [
        { label: 'Work Order #', value: fmt(c.workOrderNumber) },
        { label: 'Title', value: fmt(c.title) },
        { label: 'Client', value: fmt(c.clientName) },
        { label: 'Location', value: fmt(c.locationName) },
        { label: 'Priority', value: fmt(c.priority) },
        { label: 'Completed By', value: fmt(c.completedBy) },
        { label: 'Completion Notes', value: fmt(c.completionDetails) },
      ];
    case 'scheduled-service':
      return [
        { label: 'Work Order #', value: fmt(c.workOrderNumber) },
        { label: 'Work Order Title', value: fmt(c.workOrderTitle) },
        { label: 'Sent To', value: fmt(c.toName) },
        { label: 'Scheduled Date', value: fmt(c.scheduledDate) },
        { label: 'Time', value: c.scheduledTimeStart ? `${c.scheduledTimeStart}${c.scheduledTimeEnd ? ` – ${c.scheduledTimeEnd}` : ''}` : null },
        { label: 'Location', value: fmt(c.locationName) },
      ];
    case 'review-request':
      return [
        { label: 'Work Order #', value: fmt(c.workOrderNumber) },
        { label: 'Sent To', value: fmt(c.toName) },
      ];
    case 'maint-request-notification':
      return [
        { label: 'Request Title', value: fmt(c.title) },
        { label: 'Venue', value: fmt(c.venue) },
        { label: 'Requested By', value: fmt(c.requestor) },
        { label: 'Priority', value: fmt(c.priority) },
        { label: 'Date', value: fmt(c.date) },
        { label: 'Description', value: fmt(c.description) },
        { label: 'Sent To', value: fmt(c.toName) },
      ];
    case 'client-approval':
      return [
        { label: 'Client Name', value: fmt(c.toName) },
        { label: 'Approved By', value: fmt(c.approvedBy) },
      ];
    case 'subcontractor-approval':
      return [
        { label: 'Subcontractor', value: fmt(c.toName) },
        { label: 'Business Name', value: fmt(c.businessName) },
        { label: 'Approved By', value: fmt(c.approvedBy) },
      ];
    case 'invitation':
      return [
        { label: 'Full Name', value: fmt(c.fullName) },
        { label: 'Role', value: fmt(c.role) },
      ];
    default:
      return Object.entries(c).map(([k, v]) => ({ label: k, value: fmt(v) }));
  }
}

export default function EmailLogsPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<EmailLog | null>(null);
  const [allLogs, setAllLogs] = useState<EmailLog[]>([]);
  const [allLoaded, setAllLoaded] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'emailLogs'), orderBy('sentAt', 'desc'), limit(500)),
      );
      setAllLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmailLog, 'id'>) })));
      setAllLoaded(true);
    } catch (err) {
      console.error('Failed to load email logs:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleRefresh() {
    setSyncing(true);
    try {
      await loadAll();
      toast.success('Email logs refreshed');
    } catch {
      toast.error('Failed to refresh email logs');
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => { setPage(0); setSelectedIds(new Set()); }, [searchQuery, typeFilter, statusFilter]);

  async function handleDelete(ids: string[]) {
    if (!ids.length) return;
    setDeleting(true);
    try {
      // Firestore batch allows up to 500 ops per batch
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, 'emailLogs', id)));
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

  function togglePageAll(pageItems: EmailLog[]) {
    if (pageItems.every((l) => selectedIds.has(l.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pageItems.map((l) => l.id)));
    }
  }

  const filtered = allLogs.filter((log) => {
    const recipients = toArray(log.to).join(', ').toLowerCase();
    const ctx = JSON.stringify(log.context || {}).toLowerCase();
    const matchesSearch =
      !searchQuery ||
      recipients.includes(searchQuery.toLowerCase()) ||
      (log.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      ctx.includes(searchQuery.toLowerCase());
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
              <p className="text-sm text-muted-foreground">All emails sent from the system</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
              {allLoaded ? `${filtered.length} of ${allLogs.length} emails` : 'Loading...'}
            </span>
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete([...selectedIds])}
                disabled={deleting}
              >
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
              placeholder="Search by recipient, subject, WO#..."
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
              <option key={t} value={t}>{EMAIL_TYPE_LABELS[t]}</option>
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
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Subject</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-muted-foreground">
                      Loading email logs...
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-muted-foreground">
                      {allLogs.length === 0
                        ? 'No emails have been sent yet.'
                        : 'No emails match your filters.'}
                    </td>
                  </tr>
                ) : (
                  paginated.map((log) => {
                    const recipients = toArray(log.to);
                    const summary = getQuickSummary(log.type, log.context);
                    return (
                      <tr
                        key={log.id}
                        className={`border-t border-border hover:bg-muted/30 transition-colors ${selectedIds.has(log.id) ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(log.id)}
                            onChange={() => toggleRow(log.id)}
                            className="rounded border-gray-300 cursor-pointer"
                          />
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs cursor-pointer" onClick={() => setSelected(log)}>
                          {formatDate(log.sentAt)}
                        </td>

                        {/* Type badge */}
                        <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => setSelected(log)}>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${EMAIL_TYPE_COLORS[log.type] || 'bg-gray-100 text-gray-800'}`}>
                            {EMAIL_TYPE_LABELS[log.type] || log.type}
                          </span>
                        </td>

                        {/* Details summary */}
                        <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(log)}>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-xs">{summary.primary}</span>
                            {summary.secondary && (
                              <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                                {summary.secondary}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Recipient */}
                        <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(log)}>
                          <div className="flex flex-col gap-0.5">
                            {recipients.slice(0, 2).map((r, i) => (
                              <span key={i} className="text-xs font-mono">{r}</span>
                            ))}
                            {recipients.length > 2 && (
                              <span className="text-xs text-muted-foreground">+{recipients.length - 2} more</span>
                            )}
                          </div>
                        </td>

                        {/* Subject */}
                        <td className="px-4 py-3 max-w-xs cursor-pointer" onClick={() => setSelected(log)}>
                          <span className="truncate block text-xs">{log.subject}</span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => setSelected(log)}>
                          {log.status === 'sent' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                              <CheckCircle2 className="h-3 w-3" /> Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                              <XCircle className="h-3 w-3" /> Failed
                            </span>
                          )}
                        </td>

                        {/* Delete */}
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
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    Email Record
                  </DialogTitle>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete([selected.id])}
                    disabled={deleting}
                    className="gap-1.5 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleting ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </DialogHeader>

              <div className="space-y-5 mt-1">

                {/* Status + Type */}
                <div className="flex items-center gap-2 flex-wrap">
                  {selected.status === 'sent' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Sent Successfully
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                      <XCircle className="h-3.5 w-3.5" /> Failed
                    </span>
                  )}
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${EMAIL_TYPE_COLORS[selected.type] || 'bg-gray-100 text-gray-800'}`}>
                    {EMAIL_TYPE_LABELS[selected.type] || selected.type}
                  </span>
                </div>

                {/* Core delivery info */}
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Delivery Info
                  </div>
                  <div className="divide-y divide-border">
                    <DetailRow label="Date Sent" value={formatDate(selected.sentAt)} />
                    <DetailRow label="To" value={toArray(selected.to).join(', ')} mono />
                    <DetailRow label="Subject" value={selected.subject} />
                    {selected.error && <DetailRow label="Error" value={selected.error} error />}
                  </div>
                </div>

                {/* Type-specific details */}
                {(() => {
                  const fields = getDetailFields(selected.type, selected.context).filter(f => f.value !== null && f.value !== undefined && f.value !== '');
                  if (fields.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {EMAIL_TYPE_LABELS[selected.type]} Details
                      </div>
                      <div className="divide-y divide-border">
                        {fields.map((f, i) => (
                          <DetailRow key={i} label={f.label} value={String(f.value)} />
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
    </AdminLayout>
  );
}

function DetailRow({ label, value, mono, error }: { label: string; value: any; mono?: boolean; error?: boolean }) {
  const display = typeof value === 'object' && value !== null
    ? (Array.isArray(value) ? value.join(', ') : (() => {
        const parts = [value.street, value.city, value.state, value.zip].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : JSON.stringify(value);
      })())
    : String(value ?? '');

  return (
    <div className="flex gap-3 px-4 py-2.5">
      <span className="text-muted-foreground text-sm w-36 flex-shrink-0 font-medium">{label}</span>
      <span className={`text-sm break-all ${mono ? 'font-mono' : ''} ${error ? 'text-red-600 dark:text-red-400' : ''}`}>
        {display}
      </span>
    </div>
  );
}
