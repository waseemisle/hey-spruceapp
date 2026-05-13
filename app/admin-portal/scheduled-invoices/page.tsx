'use client';

import { PortalListPage } from '@/components/ui/portal-list-page';
/**
 * Admin → Scheduled Invoices (list)
 *
 * Lean replacement for the previous inline-form list page. Now mirrors
 * the Recurring Work Orders list shape: status filter + search + create
 * button + cards linking to a detail page. The actual create flow lives
 * at /admin-portal/scheduled-invoices/create, the detail flow at
 * /admin-portal/scheduled-invoices/[id]. Cron execution is wired up in
 * /api/scheduled-invoices/cron and surfaced on /admin-portal/cron-jobs.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Calendar, Receipt, Zap, Pause, X, CheckCircle } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import type { ScheduledInvoice } from '@/types';

type FilterKey = 'all' | 'active' | 'paused' | 'cancelled';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'Active' },
  { key: 'paused',    label: 'Paused' },
  { key: 'cancelled', label: 'Cancelled' },
];

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export default function ScheduledInvoicesListPage() {
  const [invoices, setInvoices] = useState<(ScheduledInvoice & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Live subscription so status flips (pause / cancel / new run) appear
    // without requiring a refresh — same pattern the RWO list uses.
    const unsub = onSnapshot(
      query(collection(db, 'scheduledInvoices')),
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as (ScheduledInvoice & { id: string })[];
        setInvoices(all);
        setLoading(false);
      },
      (err) => {
        console.error('[scheduled-invoices/list] snapshot error:', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const counts = useMemo(() => ({
    all: invoices.length,
    active: invoices.filter(i => i.status === 'active').length,
    paused: invoices.filter(i => i.status === 'paused').length,
    cancelled: invoices.filter(i => i.status === 'cancelled').length,
  }), [invoices]);

  const filtered = useMemo(() => {
    const ql = searchQuery.trim().toLowerCase();
    return invoices
      .filter(inv => filter === 'all' ? true : inv.status === filter)
      .filter(inv => {
        if (!ql) return true;
        return [
          inv.scheduledInvoiceNumber,
          inv.title,
          inv.clientName,
          inv.clientEmail,
        ].some(v => (v || '').toString().toLowerCase().includes(ql));
      })
      .sort((a, b) => {
        const an = toDate(a.nextExecution)?.getTime() || 0;
        const bn = toDate(b.nextExecution)?.getTime() || 0;
        // Active soonest-first; paused/cancelled sink to the bottom.
        const aw = a.status === 'active' ? 0 : a.status === 'paused' ? 1 : 2;
        const bw = b.status === 'active' ? 0 : b.status === 'paused' ? 1 : 2;
        if (aw !== bw) return aw - bw;
        return an - bn;
      });
  }, [invoices, filter, searchQuery]);

  return (
    <PortalListPage
      title="Scheduled Invoices"
      subtitle="Recurring billing schedules. The cron creates a real invoice + Stripe pay link on each iteration date."
      icon={Receipt}
      heroAction={
        <Link href="/admin-portal/scheduled-invoices/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Scheduled Invoice
          </Button>
        </Link>
      }
    >
      <div className="space-y-6">

        <div className="flex flex-wrap items-center gap-2 border-b border-border">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                filter === f.key
                  ? 'border-primary text-primary'
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

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by SI number, title, client…"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 flex flex-col items-center gap-2 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {invoices.length === 0
                  ? 'No scheduled invoices yet — create your first one to start recurring billing.'
                  : 'No scheduled invoices match the current filter.'}
              </p>
              {invoices.length === 0 && (
                <Link href="/admin-portal/scheduled-invoices/create">
                  <Button className="mt-2">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Scheduled Invoice
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map(inv => {
              const next = toDate(inv.nextExecution);
              const last = toDate(inv.lastExecution);
              return (
                <Link
                  key={inv.id}
                  href={`/admin-portal/scheduled-invoices/${inv.id}`}
                  className="block"
                >
                  <Card className="hover:border-primary/25 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Receipt className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-mono text-xs text-muted-foreground">
                              {inv.scheduledInvoiceNumber}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border inline-flex items-center gap-1 ${
                              inv.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : inv.status === 'paused'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {inv.status === 'active' && <CheckCircle className="h-3 w-3" />}
                              {inv.status === 'paused' && <Pause className="h-3 w-3" />}
                              {inv.status === 'cancelled' && <X className="h-3 w-3" />}
                              {inv.status}
                            </span>
                            {inv.recurrencePatternLabel && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                                {inv.recurrencePatternLabel}
                              </span>
                            )}
                            {inv.autoCharge && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 inline-flex items-center gap-1">
                                <Zap className="h-3 w-3" />
                                Auto-charge
                              </span>
                            )}
                          </div>
                          <p className="font-semibold mt-1.5 truncate">{inv.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {inv.clientName} · {inv.clientEmail}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xl font-bold">{formatMoney(inv.totalAmount || 0)}</p>
                          <p className="text-xs text-muted-foreground">per iteration</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Next run:{' '}
                          <strong className="text-foreground">
                            {next ? next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </strong>
                        </span>
                        {last && (
                          <span>
                            Last run: <strong className="text-foreground">{last.toLocaleDateString()}</strong>
                          </span>
                        )}
                        <span>
                          Total runs: <strong className="text-foreground">{inv.totalExecutions || 0}</strong>
                        </span>
                        {(inv.failedExecutions || 0) > 0 && (
                          <span className="text-red-600">
                            Failed: <strong>{inv.failedExecutions}</strong>
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PortalListPage>
  );
}
