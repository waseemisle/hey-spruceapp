'use client';

import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';
import { Sparkles } from 'lucide-react';
/**
 * Admin → Scheduled Invoice detail
 *
 * Mirrors the RWO detail page shape: header with status pill + actions,
 * countdown to next cron fire, summary card, execution timeline (past +
 * upcoming), action buttons (Pause / Resume / Cancel / Execute Now,
 * Edit). Uses lib/recurrence.ts to render the upcoming dates so the
 * preview matches what the cron will fire on.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pause, Play, Edit2, X, Calendar, Receipt, Zap, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { generateAllScheduledDates, type RecurrencePatternLabel } from '@/lib/recurrence';
import { formatMoney } from '@/lib/money';
import type { ScheduledInvoice, ScheduledInvoiceExecution } from '@/types';

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—';

interface CountdownProps { target: Date | null }
function Countdown({ target }: CountdownProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return <span className="text-muted-foreground">—</span>;
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return <span className="text-amber-700">due now</span>;
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  if (d > 0) return <span>{d}d {h}h {m}m</span>;
  if (h > 0) return <span>{h}h {m}m {s}s</span>;
  return <span>{m}m {s}s</span>;
}

/**
 * Live HH:MM:SS-style countdown that returns a string instead of JSX
 * so callers can colour / style it inline. Mirrors the RWO detail
 * page's countdown so both surfaces feel identical.
 */
function useLiveCountdown(target: Date | null): string {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!target) { setText(''); return; }
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setText('Now'); return; }
      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1000);
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);
      setText(parts.join(' '));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target?.getTime()]);
  return text;
}

export default function ScheduledInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<(ScheduledInvoice & { id: string }) | null>(null);
  const [executions, setExecutions] = useState<ScheduledInvoiceExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  // Global cron lead-time — the cron actually fires this many days
  // BEFORE the schedule's nextExecution so the admin has time to
  // review/cancel before billing the client. Same source of truth
  // (cron-monitor) the RWO detail page reads from, so the countdown
  // here matches the cron-jobs admin view.
  const [leadTimeDays, setLeadTimeDays] = useState(7);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/cron-monitor')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        const lt = typeof data.schedule?.leadTimeDays === 'number' ? data.schedule.leadTimeDays : 7;
        setLeadTimeDays(lt);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Live subscription on the parent doc + executions audit collection.
  useEffect(() => {
    if (!id) return;
    const unsubInvoice = onSnapshot(doc(db, 'scheduledInvoices', id), (snap) => {
      if (snap.exists()) {
        setInvoice({ id: snap.id, ...(snap.data() as any) });
      } else {
        setInvoice(null);
      }
      setLoading(false);
    });
    const unsubExecs = onSnapshot(
      query(collection(db, 'scheduledInvoiceExecutions'), where('scheduledInvoiceId', '==', id)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ScheduledInvoiceExecution[];
        list.sort((a, b) => {
          const ad = toDate(a.scheduledDate)?.getTime() || 0;
          const bd = toDate(b.scheduledDate)?.getTime() || 0;
          return ad - bd;
        });
        setExecutions(list);
      },
    );
    return () => { unsubInvoice(); unsubExecs(); };
  }, [id]);

  // Build the merged timeline: pair past executions with their generated
  // scheduled dates and append the next 5 upcoming dates from the
  // recurrence pattern. Same shape RWO uses on its detail page.
  type TimelineItem = {
    key: string;
    date: Date;
    kind: 'past' | 'upcoming';
    execution?: ScheduledInvoiceExecution;
  };
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!invoice) return [];

    const past: TimelineItem[] = executions.map(e => ({
      key: `exec-${e.id}`,
      date: toDate(e.scheduledDate) || new Date(),
      kind: 'past',
      execution: e,
    }));

    const upcoming: TimelineItem[] = generateAllScheduledDates(
      {
        recurrencePattern: invoice.recurrencePattern,
        recurrencePatternLabel: invoice.recurrencePatternLabel as RecurrencePatternLabel | undefined,
        anchor: toDate(invoice.nextExecution) || new Date(),
      },
      5,
    )
      .filter(d => !past.some(p => Math.abs(p.date.getTime() - d.getTime()) < 86_400_000))
      .map(d => ({
        key: `upcoming-${d.getTime()}`,
        date: d,
        kind: 'upcoming',
      }));

    return [...past, ...upcoming].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [invoice, executions]);

  const handleStatusChange = async (newStatus: 'active' | 'paused' | 'cancelled') => {
    if (!invoice) return;
    if (newStatus === 'cancelled' && !confirm('Cancel this scheduled invoice? Future runs will stop. Past runs are preserved.')) return;
    setActioning(`status-${newStatus}`);
    try {
      const currentUser = auth.currentUser;
      const adminDoc = currentUser ? await getDoc(doc(db, 'adminUsers', currentUser.uid)) : null;
      const userName = adminDoc?.exists() ? (adminDoc.data() as any).fullName || 'Admin' : 'Admin';

      const event = {
        id: `${newStatus}_${Date.now()}`,
        timestamp: new Date(),
        type: newStatus,
        userId: currentUser?.uid || 'unknown',
        userName,
        userRole: 'admin' as const,
        details: `Schedule ${newStatus} by ${userName}`,
        metadata: {},
      };
      await updateDoc(doc(db, 'scheduledInvoices', invoice.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        timeline: [...((invoice as any).timeline || []), event],
      });
      toast.success(`Schedule ${newStatus}.`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || `Failed to ${newStatus} schedule.`);
    } finally {
      setActioning(null);
    }
  };

  const handleExecuteNow = async () => {
    if (!invoice) return;
    if (!confirm('Run this scheduled invoice now? A real invoice will be created and the client will be billed/notified.')) return;
    setActioning('execute');
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/scheduled-invoices/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ scheduledInvoiceId: invoice.id, triggeredBy: 'manual_admin' }),
      });
      let parsed: any = null;
      const raw = await res.text().catch(() => '');
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }
      if (!res.ok) {
        const msg = parsed?.error || (raw && raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 250)) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      toast.success(`Invoice ${parsed?.invoiceNumber || ''} created.`);
    } catch (e: any) {
      console.error('[scheduled-invoices/execute-now]', e);
      toast.error(e?.message || 'Execute failed.');
    } finally {
      setActioning(null);
    }
  };

  // Lead-time-aware fire date — when the cron will actually create
  // the invoice. Computed as nextExecution - leadTimeDays. The
  // countdown panel below targets this date (matching the RWO
  // page's "Time Left for Next Execution" semantics) so admins see
  // when the invoice will actually be billed, not the iteration date
  // displayed elsewhere on the page.
  // IMPORTANT — must be computed (and the hook called) BEFORE the
  // early-return branches below. React's rules-of-hooks require
  // every hook to be called in the same order on every render, so
  // useLiveCountdown can't sit after the `if (loading) return` /
  // `if (!invoice) return` guards.
  const next = toDate(invoice?.nextExecution);
  const last = toDate(invoice?.lastExecution);
  const nextLeadDate = (() => {
    if (!next) return null;
    const d = new Date(next);
    d.setDate(d.getDate() - leadTimeDays);
    return d;
  })();
  const countdown = useLiveCountdown(nextLeadDate);

  if (loading) {
    return (
      <>
      <PageContainer>
        <PortalHero
          title="Page"
          subtitle=""
          icon={Sparkles}
        />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
        </div>
            </PageContainer>
    </>
    );
  }

  if (!invoice) {
    return (
      <>
        <div className="max-w-3xl mx-auto pt-8">
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground mb-4">Scheduled invoice not found.</p>
              <Link href="/admin-portal/scheduled-invoices">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to list
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin-portal/scheduled-invoices">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${
              invoice.status === 'active'
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : invoice.status === 'paused'
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-red-100 text-red-700 border border-red-200'
            }`}>
              {invoice.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin-portal/scheduled-invoices/${invoice.id}/edit`}>
              <Button variant="outline" size="sm">
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </Link>
            {invoice.status === 'active' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('paused')}
                disabled={!!actioning}
              >
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            {invoice.status === 'paused' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('active')}
                disabled={!!actioning}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            )}
            {invoice.status !== 'cancelled' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('cancelled')}
                disabled={!!actioning}
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
            {invoice.status === 'active' && (
              <Button
                size="sm"
                onClick={handleExecuteNow}
                disabled={!!actioning}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {actioning === 'execute' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                Execute Now
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  {invoice.title}
                </CardTitle>
                <p className="text-xs font-mono text-muted-foreground mt-1">{invoice.scheduledInvoiceNumber}</p>
                <p className="text-sm text-muted-foreground mt-2">{invoice.clientName} · {invoice.clientEmail}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">{formatMoney(invoice.totalAmount || 0)}</p>
                <p className="text-xs text-muted-foreground">per iteration</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Frequency</p>
                <p className="font-semibold mt-1">{invoice.recurrencePatternLabel || invoice.recurrencePattern?.type}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Next run</p>
                <p className="font-semibold mt-1">{fmtDate(next)}</p>
                <p className="text-xs text-muted-foreground">in <Countdown target={next} /></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Last run</p>
                <p className="font-semibold mt-1">{fmtDate(last)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Runs</p>
                <p className="font-semibold mt-1">
                  {invoice.successfulExecutions || 0}
                  {(invoice.failedExecutions || 0) > 0 && (
                    <span className="text-red-600 text-sm ml-2">· {invoice.failedExecutions} failed</span>
                  )}
                </p>
              </div>
            </div>
            {invoice.autoCharge && (
              <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                <Zap className="h-3 w-3" />
                Auto-charge enabled
              </div>
            )}
            {invoice.description && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground uppercase mb-1">Description</p>
                <p className="text-sm">{invoice.description}</p>
              </div>
            )}

            {/*
              Execution info panel — mirrors the equivalent block on the
              RWO detail page so admins see the same three pieces of
              data on both surfaces:
                1. Next Execution — the iteration date displayed in
                   the recurrence.
                2. Next Execution Before (X Days) — the date the cron
                   will actually fire (iteration date minus the
                   lead-time configured on the cron-jobs page).
                3. Time Left for Next Execution — live countdown to
                   that fire date, prominent enough to read at a
                   glance.
              Only renders when the schedule is active and we have a
              next iteration; paused/cancelled schedules don't have a
              meaningful countdown.
            */}
            {invoice.status === 'active' && next && (
              <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                <div>
                  <span className="font-semibold">Next Execution:</span>
                  <span className="ml-2">
                    {next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">
                    Next Execution Before ({leadTimeDays} Day{leadTimeDays === 1 ? '' : 's'}):
                  </span>
                  <span className="ml-2">
                    {nextLeadDate ? nextLeadDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    (cron fires on this date)
                  </span>
                </div>
                {countdown && (
                  <div>
                    <span className="font-semibold">Time Left for Next Execution:</span>
                    <span className={`ml-2 font-mono text-sm px-2 py-0.5 rounded tabular-nums ${
                      countdown === 'Now'
                        ? 'bg-green-100 text-green-700 animate-pulse'
                        : 'bg-blue-50 text-blue-700'
                    }`}>
                      {countdown}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(invoice.lineItems || []).map((li: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{li.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {li.quantity} × {formatMoney(li.unitPrice)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{formatMoney(li.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No runs yet — first execution scheduled for {fmtDate(next)}.
              </p>
            ) : (
              <div className="space-y-2">
                {timeline.map(item => {
                  const e = item.execution;
                  const status = e?.status;
                  return (
                    <div
                      key={item.key}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        item.kind === 'upcoming'
                          ? 'border-dashed border-border bg-muted/20'
                          : status === 'failed'
                            ? 'border-red-200 bg-red-50/40'
                            : status === 'executed'
                              ? 'border-emerald-200 bg-emerald-50/40'
                              : 'border-border'
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {item.kind === 'upcoming'
                          ? <Calendar className="h-4 w-4 text-muted-foreground" />
                          : status === 'executed'
                            ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                            : status === 'failed'
                              ? <AlertCircle className="h-4 w-4 text-red-600" />
                              : <Calendar className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{fmtDate(item.date)}</p>
                          {item.kind === 'upcoming' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              Upcoming
                            </span>
                          )}
                          {status && (
                            <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                              status === 'executed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : status === 'failed'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-muted text-foreground'
                            }`}>
                              {status}
                            </span>
                          )}
                        </div>
                        {e?.invoiceNumber && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Created invoice{' '}
                            <Link href={`/admin-portal/invoices/${e.invoiceId}`} className="text-blue-600 underline font-mono">
                              {e.invoiceNumber}
                            </Link>
                            {e.totalAmount ? <> · {formatMoney(e.totalAmount)}</> : null}
                          </p>
                        )}
                        {e?.failureReason && (
                          <p className="text-xs text-red-600 mt-0.5">{e.failureReason}</p>
                        )}
                        {e?.autoChargeStatus && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Auto-charge: {e.autoChargeStatus}{e.autoChargeError ? ` — ${e.autoChargeError}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
