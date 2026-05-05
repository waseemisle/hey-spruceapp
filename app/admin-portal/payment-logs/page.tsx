'use client';

/**
 * Admin → Payment Logs
 *
 * Authoritative audit-of-record for every Stripe payment event +
 * server-initiated charge. Sourced from the `paymentLogs` Firestore
 * collection populated by the webhook + the auto-charge / hosted-link
 * routes (see /lib/payment-logs.ts and the phases 2-3 commits).
 *
 * Filters, search, live snapshot. Each row links to a detail view at
 * /admin-portal/payment-logs/[id] showing full payload, linked
 * Firestore records, mutation cascade, and failure analysis.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, CheckCircle, AlertCircle, Clock, RotateCcw, X, RefreshCw, CreditCard, Building2, Loader2, AlertTriangle,
} from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { toast } from 'sonner';
import type { PaymentLog } from '@/types';

type StatusKey = 'all' | 'succeeded' | 'failed' | 'requires_action' | 'processing' | 'refunded' | 'disputed' | 'canceled' | 'pending';
type SourceKey = 'all' | 'webhook' | 'auto_charge_route' | 'hosted_link_finalize' | 'manual_admin' | 'backfill';

const STATUS_FILTERS: Array<{ key: StatusKey; label: string }> = [
  { key: 'all',             label: 'All' },
  { key: 'succeeded',       label: 'Succeeded' },
  { key: 'failed',          label: 'Failed' },
  { key: 'requires_action', label: 'Requires action' },
  { key: 'processing',      label: 'Processing' },
  { key: 'refunded',        label: 'Refunded' },
  { key: 'disputed',        label: 'Disputed' },
  { key: 'canceled',        label: 'Canceled' },
  { key: 'pending',         label: 'Pending' },
];

const SOURCE_LABELS: Record<SourceKey, string> = {
  all: 'All sources',
  webhook: 'Stripe webhook',
  auto_charge_route: 'Auto-charge route',
  hosted_link_finalize: 'Hosted-link finalize',
  manual_admin: 'Manual admin',
  backfill: 'Backfill',
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const fmtAgo = (d: Date | null) => {
  if (!d) return '—';
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};

const StatusPill = ({ status }: { status: PaymentLog['status'] }) => {
  const cls = (() => {
    switch (status) {
      case 'succeeded': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'failed':    return 'bg-red-50 text-red-700 border-red-200';
      case 'requires_action': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'processing': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'refunded':  return 'bg-violet-50 text-violet-700 border-violet-200';
      case 'disputed':  return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'canceled':  return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-foreground border-border';
    }
  })();
  const Icon = (() => {
    switch (status) {
      case 'succeeded': return CheckCircle;
      case 'failed':    return AlertCircle;
      case 'requires_action': return AlertTriangle;
      case 'processing': return Clock;
      case 'refunded':  return RotateCcw;
      case 'disputed':  return AlertTriangle;
      case 'canceled':  return X;
      default: return Clock;
    }
  })();
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <Icon className="h-3 w-3" />
      {status.replace(/_/g, ' ')}
    </span>
  );
};

const PaymentMethodBadge = ({ log }: { log: PaymentLog }) => {
  if (log.paymentMethodType === 'us_bank_account') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Building2 className="h-3 w-3" />
        {log.bankName || 'Bank'} ••{log.bankLast4 || '----'}
      </span>
    );
  }
  if (log.cardBrand) {
    const brand = log.cardBrand.charAt(0).toUpperCase() + log.cardBrand.slice(1);
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CreditCard className="h-3 w-3" />
        {brand} ••{log.cardLast4 || '----'}
      </span>
    );
  }
  return null;
};

export default function PaymentLogsListPage() {
  const [logs, setLogs] = useState<(PaymentLog & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'paymentLogs')),
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as (PaymentLog & { id: string })[];
        all.sort((a, b) => {
          const at = toDate(a.stripeCreatedAt)?.getTime() || toDate(a.createdAt)?.getTime() || 0;
          const bt = toDate(b.stripeCreatedAt)?.getTime() || toDate(b.createdAt)?.getTime() || 0;
          return bt - at;
        });
        setLogs(all);
        setLoading(false);
      },
      (err) => {
        console.error('[payment-logs/list] snapshot error:', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const counts = useMemo(() => {
    const out: Record<StatusKey, number> = {
      all: logs.length,
      succeeded: 0, failed: 0, requires_action: 0, processing: 0,
      refunded: 0, disputed: 0, canceled: 0, pending: 0,
    };
    for (const l of logs) {
      if (l.status && out[l.status as StatusKey] !== undefined) out[l.status as StatusKey]++;
    }
    return out;
  }, [logs]);

  const filtered = useMemo(() => {
    const ql = searchQuery.trim().toLowerCase();
    return logs
      .filter(l => statusFilter === 'all' ? true : l.status === statusFilter)
      .filter(l => sourceFilter === 'all' ? true : l.source === sourceFilter)
      .filter(l => {
        if (!ql) return true;
        return [
          l.stripeObjectId,
          l.stripeEventId,
          l.linkedInvoiceNumber,
          l.linkedClientName,
          l.customerEmail,
          l.cardLast4,
          l.bankLast4,
          l.failureMessage,
          l.failureCode,
        ].some(v => (v || '').toString().toLowerCase().includes(ql));
      });
  }, [logs, statusFilter, sourceFilter, searchQuery]);

  const handleBackfill = async () => {
    if (!confirm('Pull the last 90 days of Stripe charges + invoices into paymentLogs? Idempotent — safe to re-run.')) return;
    setBackfilling(true);
    try {
      // Send the admin's Firebase ID token so the route can verify
      // they're authorised. The backfill endpoint accepts either
      // CRON_SECRET or an authenticated admin Bearer.
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/payment-logs/backfill?days=90', {
        method: 'POST',
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Backfill failed');
      toast.success(`Backfilled ${data.chargesProcessed} charges + ${data.invoicesProcessed} invoices.`);
    } catch (err: any) {
      toast.error(err?.message || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Payment Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every Stripe payment event + server-initiated charge. Click a row for full payload,
              record-mutation cascade, and failure analysis.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleBackfill}
            disabled={backfilling}
          >
            {backfilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {backfilling ? 'Backfilling…' : 'Backfill 90 days'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                statusFilter === f.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
              <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-muted text-xs">
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Stripe id, invoice#, client, email, last4, decline code…"
              className="pl-9"
            />
          </div>
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value as SourceKey)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 flex flex-col items-center gap-2 text-center">
              <Clock className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {logs.length === 0
                  ? 'No payment logs yet. Run "Backfill 90 days" to import recent Stripe activity, or wait for the next webhook event.'
                  : 'No payment logs match the current filters.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {filtered.map(log => {
              const ts = toDate(log.stripeCreatedAt) || toDate(log.createdAt);
              return (
                <Link key={log.id} href={`/admin-portal/payment-logs/${log.id}`} className="block">
                  <Card className="hover:border-blue-300 transition-colors">
                    <CardContent className="p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill status={log.status as PaymentLog['status']} />
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {log.stripeObjectType.replace('_', ' ')}
                            </span>
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              {SOURCE_LABELS[log.source as SourceKey] || log.source}
                            </span>
                            {log.rawEventType && (
                              <span className="text-xs font-mono text-muted-foreground">
                                {log.rawEventType}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-muted-foreground">{log.stripeObjectId}</span>
                            {log.linkedInvoiceNumber && (
                              <span className="text-xs">
                                · invoice <span className="font-mono">{log.linkedInvoiceNumber}</span>
                              </span>
                            )}
                            {log.linkedClientName && (
                              <span className="text-xs text-muted-foreground">· {log.linkedClientName}</span>
                            )}
                          </div>
                          {log.failureMessage && (
                            <p className="text-xs text-red-600 mt-1 line-clamp-1">
                              {log.failureCode ? `[${log.failureCode}] ` : ''}{log.failureMessage}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                            {ts && <span>{ts.toLocaleString()}</span>}
                            {ts && <span>· {fmtAgo(ts)}</span>}
                            <PaymentMethodBadge log={log} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {typeof log.amount === 'number' && (
                            <p className="text-lg font-bold">{formatMoney(log.amount)}</p>
                          )}
                          {typeof log.feeAmount === 'number' && log.feeAmount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              fee {formatMoney((log.feeAmount || 0) / 100)}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
