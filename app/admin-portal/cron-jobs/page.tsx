'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Clock, CheckCircle, XCircle, AlertTriangle, Loader2, Play, ChevronDown, ChevronUp,
  Zap, Timer, Hash, Activity, Settings, RefreshCw, CalendarClock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';
import { Sparkles } from 'lucide-react';
interface CronRunResult {
  rwoId?: string;
  rwoTitle?: string;
  siId?: string;
  siNumber?: string;
  title?: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  executionId?: string;
  invoiceNumber?: string;
  nextExecution?: string;
}

interface CronRun {
  id: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalEligible: number;
  totalSucceeded: number;
  totalFailed: number;
  totalSkipped?: number;
  status: 'completed' | 'failed' | 'partial' | 'error' | 'idle';
  triggeredBy: 'vercel_cron' | 'manual_api';
  results: CronRunResult[];
  error?: string;
}

interface ScheduledInvoiceOverdue {
  id: string;
  scheduledInvoiceNumber: string;
  title: string;
  nextExecution: string;
  clientName: string;
  totalAmount: number;
}

export default function CronJobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cronRuns, setCronRuns] = useState<CronRun[]>([]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState(60);
  const [leadTimeDays, setLeadTimeDays] = useState(7);
  const [leadTimeInput, setLeadTimeInput] = useState('7');
  const [lastCronRunAt, setLastCronRunAt] = useState<Date | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingLeadTime, setSavingLeadTime] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [overdueRWOs, setOverdueRWOs] = useState<Array<{ id: string; title: string; nextExecution: string; clientName: string; locationName: string }>>([]);
  // Scheduled Invoices counterparts — same shape as RWO so the panel
  // below can render with identical styling. Lock + run history come
  // from the same /api/cron-monitor endpoint, just under a separate
  // top-level key so RWO + SI never collide.
  const [siRuns, setSiRuns] = useState<CronRun[]>([]);
  const [siOverdue, setSiOverdue] = useState<ScheduledInvoiceOverdue[]>([]);
  const [siLastRunAt, setSiLastRunAt] = useState<Date | null>(null);
  const [triggeringSi, setTriggeringSi] = useState(false);
  const [expandedSiRun, setExpandedSiRun] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  // Tick every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Auth check
  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push('/portal-login'); return; }
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  // Fetch data from API
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/cron-monitor');
      if (!res.ok) return;
      const data = await res.json();
      setCronRuns(data.runs || []);
      setOverdueRWOs(data.overdue || []);
      setScheduleInterval(data.schedule?.intervalMinutes || 60);
      const lt = typeof data.schedule?.leadTimeDays === 'number' ? data.schedule.leadTimeDays : 7;
      setLeadTimeDays(lt);
      setLeadTimeInput(String(lt));
      if (data.schedule?.lastRunAt) {
        setLastCronRunAt(new Date(data.schedule.lastRunAt));
      } else if (data.runs?.length > 0) {
        setLastCronRunAt(new Date(data.runs[0].completedAt || data.runs[0].startedAt));
      }
      if (data.scheduledInvoices) {
        setSiRuns(data.scheduledInvoices.runs || []);
        setSiOverdue(data.scheduledInvoices.overdue || []);
        if (data.scheduledInvoices.lastRunAt) {
          setSiLastRunAt(new Date(data.scheduledInvoices.lastRunAt));
        } else if (data.scheduledInvoices.runs?.length > 0) {
          setSiLastRunAt(new Date(data.scheduledInvoices.runs[0].completedAt || data.scheduledInvoices.runs[0].startedAt));
        }
      }
    } catch {}
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [loading, fetchData]);

  // Compute next run and time left for the RWO cron.
  const nextRunAt = lastCronRunAt
    ? new Date(lastCronRunAt.getTime() + scheduleInterval * 60000)
    : null;
  const timeLeftMs = nextRunAt ? Math.max(0, nextRunAt.getTime() - now.getTime()) : 0;
  const isOverdue = nextRunAt ? now > nextRunAt : false;

  // Same math for the Scheduled Invoices cron. Vercel fires both
  // crons on the same schedule (see vercel.json — both crons use
  // `0 9 * * *`), so the SI countdown ticks alongside the RWO one
  // and the operator sees a single shared timer for both feature
  // areas. Falls back to the RWO last-run timestamp if Stripe has
  // not yet ticked the SI lock — keeps the countdown live on first
  // deploy before the SI cron has fired.
  const siNextRunAt = (siLastRunAt || lastCronRunAt)
    ? new Date(((siLastRunAt || lastCronRunAt) as Date).getTime() + scheduleInterval * 60000)
    : null;
  const siTimeLeftMs = siNextRunAt ? Math.max(0, siNextRunAt.getTime() - now.getTime()) : 0;
  const siIsOverdue = siNextRunAt ? now > siNextRunAt : false;

  const fmtCountdown = (ms: number) => {
    if (ms <= 0) return 'Now';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // How long overdue (positive = past due)
  const overdueMs = nextRunAt ? Math.max(0, now.getTime() - nextRunAt.getTime()) : 0;
  const fmtOverdue = (ms: number) => {
    if (ms <= 0) return '';
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return 'just now';
    if (totalMin < 60) return `${totalMin}m overdue`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h < 24) return m > 0 ? `${h}h ${m}m overdue` : `${h}h overdue`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}d ${rh}h overdue` : `${d}d overdue`;
  };

  const EST_TZ = 'America/New_York';

  const fmtTime = (v: string | Date | null) => {
    if (!v) return 'N/A';
    const d = typeof v === 'string' ? new Date(v) : v;
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString('en-US', { timeZone: EST_TZ, month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' EST';
  };

  const fmtDuration = (ms: number) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const fmtAgo = (v: string | Date | null) => {
    if (!v) return 'Never';
    const d = typeof v === 'string' ? new Date(v) : v;
    if (isNaN(d.getTime())) return 'Never';
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'partial': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      default: return 'bg-red-50 text-red-700 border-red-200';
    }
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'partial': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const handleTriggerCron = async () => {
    setTriggering(true);
    try {
      const res = await fetch('/api/cron-monitor', { method: 'PUT' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Cron executed: ${data.totalSucceeded}/${data.totalEligible} succeeded`);
        await fetchData();
      } else {
        toast.error(data.error || 'Cron failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    } finally {
      setTriggering(false);
    }
  };

  const handleTriggerSiCron = async () => {
    setTriggeringSi(true);
    try {
      const res = await fetch('/api/cron-monitor?target=scheduled_invoices', { method: 'PUT' });
      const data = await res.json();
      if (res.ok) {
        const skipped = data.totalSkipped ? ` (${data.totalSkipped} skipped)` : '';
        toast.success(`SI cron executed: ${data.totalSucceeded}/${data.totalEligible} succeeded${skipped}`);
        await fetchData();
      } else {
        toast.error(data.error || 'SI cron failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    } finally {
      setTriggeringSi(false);
    }
  };

  const handleSaveLeadTime = async (newLeadTime: number) => {
    if (!Number.isFinite(newLeadTime) || newLeadTime < 0 || newLeadTime > 60) {
      toast.error('Lead time must be between 0 and 60 days');
      return;
    }
    const days = Math.floor(newLeadTime);
    setSavingLeadTime(true);
    try {
      const res = await fetch('/api/cron-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadTimeDays: days }),
      });
      if (res.ok) {
        setLeadTimeDays(days);
        setLeadTimeInput(String(days));
        toast.success(`Executions will now fire ${days} day${days === 1 ? '' : 's'} before the scheduled date`);
        await fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingLeadTime(false);
    }
  };

  const handleSaveSchedule = async (newInterval: number) => {
    setSavingSchedule(true);
    try {
      const res = await fetch('/api/cron-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: newInterval }),
      });
      if (res.ok) {
        setScheduleInterval(newInterval);
        toast.success(`Schedule: every ${newInterval < 60 ? newInterval + ' min' : (newInterval / 60) + ' hour(s)'}`);
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingSchedule(false);
    }
  };

  const lastRun = cronRuns[0] || null;

  if (loading) {
    return (
      <AdminLayout>
      <PageContainer>
        <PortalHero
          title="Cron Jobs"
          subtitle=""
          icon={Sparkles}
        />
        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>
            </PageContainer>
    </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Cron Job Monitor</h1>
            <p className="text-muted-foreground mt-1">
              One shared timer drives both Recurring Work Orders and Scheduled Invoices.
              Sections below show each feature&apos;s eligible items and run history.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={fetchData} disabled={dataLoading} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1 ${dataLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button onClick={handleTriggerCron} disabled={triggering} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {triggering ? 'Running...' : 'Run Cron Now'}
            </Button>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Health</p>
              <div className="flex items-center gap-2">
                <Activity className={`h-4 w-4 ${!lastRun ? 'text-gray-400' : lastRun.status === 'completed' ? 'text-emerald-600' : lastRun.status === 'partial' ? 'text-yellow-600' : 'text-red-600'}`} />
                <span className="font-bold text-sm">
                  {!lastRun ? 'No data' : lastRun.status === 'completed' ? 'Healthy' : lastRun.status === 'partial' ? 'Degraded' : 'Failing'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Last Run</p>
              <p className="font-bold text-sm">{lastRun ? fmtAgo(lastRun.startedAt) : 'Never'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Last Result</p>
              <p className="font-bold text-sm">{lastRun ? `${lastRun.totalSucceeded}/${lastRun.totalEligible} OK` : '—'}</p>
            </CardContent>
          </Card>

          <Card className={overdueRWOs.length > 0 ? 'border-orange-300' : ''}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Eligible Now</p>
              <p className={`font-bold text-sm ${overdueRWOs.length > 0 ? 'text-orange-600' : ''}`}>
                {dataLoading ? '...' : `${overdueRWOs.length} RWOs`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Schedule</p>
              <p className="font-bold text-sm">
                {scheduleInterval < 60 ? `Every ${scheduleInterval}m` : scheduleInterval === 60 ? 'Hourly' : `Every ${scheduleInterval / 60}h`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Next Run</p>
              <p className="font-bold text-sm">
                {!nextRunAt ? 'Pending' : isOverdue ? 'Overdue' : nextRunAt.toLocaleTimeString('en-US', { timeZone: EST_TZ, hour: '2-digit', minute: '2-digit' }) + ' EST'}
              </p>
            </CardContent>
          </Card>

          <Card className={isOverdue && nextRunAt ? 'border-red-300 bg-red-50/30' : ''}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Time Left</p>
              <p className={`font-bold tabular-nums ${isOverdue ? 'text-red-600 text-sm' : 'text-teal-700 text-lg'}`}>
                {!nextRunAt ? '—' : isOverdue ? fmtOverdue(overdueMs) : fmtCountdown(timeLeftMs)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Eligible / Overdue RWOs */}
        {overdueRWOs.length > 0 && (
          <Card className="border-orange-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-orange-700 text-base">
                <AlertTriangle className="h-5 w-5" />
                Eligible for Next Execution ({overdueRWOs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overdueRWOs.map(rwo => (
                  <div key={rwo.id} className="flex items-center justify-between p-2.5 rounded-lg bg-orange-50 border border-orange-100 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{rwo.title}</div>
                      <div className="text-xs text-muted-foreground">{rwo.clientName} — {rwo.locationName}</div>
                    </div>
                    <div className="text-xs text-orange-700 font-medium shrink-0 ml-2 tabular-nums">
                      {(() => {
                        const ms = Math.max(0, new Date(rwo.nextExecution).getTime() - now.getTime());
                        return ms <= 0 ? 'Now' : fmtCountdown(ms);
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/*
          Scheduled Invoices — paired with the RWO panel above so the
          operator sees both feature areas' status + eligible items
          adjacent. Run histories for both live in their own section
          further down the page.
        */}
        <div className="border-t border-border pt-6 mt-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">Scheduled Invoices</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Fires on the same schedule as Recurring Work Orders (see the timer above)
                and creates invoices from active schedules whose nextExecution falls
                within the lead-time window.
              </p>
            </div>
            <Button onClick={handleTriggerSiCron} disabled={triggeringSi} className="bg-blue-600 hover:bg-blue-700 gap-2">
              {triggeringSi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {triggeringSi ? 'Running…' : 'Run SI Cron Now'}
            </Button>
          </div>

          {/* SI status cards — same shape as the RWO grid above. */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Health</p>
                <div className="flex items-center gap-2">
                  {(() => {
                    const last = siRuns[0];
                    const cls = !last
                      ? 'text-gray-400'
                      : last.status === 'completed' || last.status === 'idle'
                        ? 'text-emerald-600'
                        : last.status === 'partial'
                          ? 'text-yellow-600'
                          : 'text-red-600';
                    const txt = !last ? 'No data' : last.status === 'completed' ? 'Healthy' : last.status === 'idle' ? 'Idle' : last.status === 'partial' ? 'Degraded' : 'Failing';
                    return <><Activity className={`h-4 w-4 ${cls}`} /><span className="font-bold text-sm">{txt}</span></>;
                  })()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Last Run</p>
                <p className="font-bold text-sm">{siRuns[0] ? fmtAgo(siRuns[0].startedAt) : 'Never'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Last Result</p>
                <p className="font-bold text-sm">{siRuns[0] ? `${siRuns[0].totalSucceeded}/${siRuns[0].totalEligible} OK` : '—'}</p>
              </CardContent>
            </Card>
            <Card className={siOverdue.length > 0 ? 'border-orange-300' : ''}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Eligible Now</p>
                <p className={`font-bold text-sm ${siOverdue.length > 0 ? 'text-orange-600' : ''}`}>
                  {dataLoading ? '...' : `${siOverdue.length} SIs`}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Schedule</p>
                <p className="font-bold text-sm">
                  {scheduleInterval < 60 ? `Every ${scheduleInterval}m` : scheduleInterval === 60 ? 'Hourly' : `Every ${scheduleInterval / 60}h`}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Next Run</p>
                <p className="font-bold text-sm">
                  {!siNextRunAt ? 'Pending' : siIsOverdue ? 'Overdue' : siNextRunAt.toLocaleTimeString('en-US', { timeZone: EST_TZ, hour: '2-digit', minute: '2-digit' }) + ' EST'}
                </p>
              </CardContent>
            </Card>
            <Card className={siIsOverdue && siNextRunAt ? 'border-red-300 bg-red-50/30' : ''}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Time Left</p>
                <p className={`font-bold tabular-nums ${siIsOverdue ? 'text-red-600 text-sm' : 'text-teal-700 text-lg'}`}>
                  {!siNextRunAt
                    ? '—'
                    : siIsOverdue
                      ? fmtOverdue(now.getTime() - siNextRunAt.getTime())
                      : fmtCountdown(siTimeLeftMs)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* SI Eligible — sits next to the RWO Eligible above. */}
          {siOverdue.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-orange-700 text-base">
                  <AlertTriangle className="h-5 w-5" />
                  Eligible for Next Execution ({siOverdue.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {siOverdue.map(si => (
                    <div key={si.id} className="flex items-center justify-between p-2.5 rounded-lg bg-orange-50 border border-orange-100 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{si.title}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{si.scheduledInvoiceNumber}</span> &mdash; {si.clientName}
                        </div>
                      </div>
                      <div className="text-xs text-orange-700 font-medium shrink-0 ml-2 tabular-nums">
                        {(() => {
                          const ms = Math.max(0, new Date(si.nextExecution).getTime() - now.getTime());
                          return ms <= 0 ? 'Now' : fmtCountdown(ms);
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Lead Time Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5" />
              Next Execution Before (x) Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Fire recurring work-order executions this many days before their scheduled iteration date.
              This gives admins time to assign the generated work order to a subcontractor before the
              service is due. Applies to every recurring work order.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground mr-1">Lead time:</span>
              {[0, 3, 5, 7, 10, 14].map(days => (
                <Button
                  key={days}
                  size="sm"
                  variant={leadTimeDays === days ? 'default' : 'outline'}
                  disabled={savingLeadTime}
                  onClick={() => handleSaveLeadTime(days)}
                  className={`h-8 text-xs ${leadTimeDays === days ? 'bg-teal-600 hover:bg-teal-700' : ''}`}
                >
                  {days}d
                </Button>
              ))}
              <div className="flex items-center gap-2 ml-2">
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={leadTimeInput}
                  onChange={(e) => setLeadTimeInput(e.target.value)}
                  className="h-8 w-20 text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingLeadTime || leadTimeInput === String(leadTimeDays)}
                  onClick={() => handleSaveLeadTime(Number(leadTimeInput))}
                  className="h-8 text-xs"
                >
                  {savingLeadTime ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Currently firing <span className="font-semibold text-foreground">{leadTimeDays} day{leadTimeDays === 1 ? '' : 's'}</span> before the scheduled iteration date.
              {leadTimeDays === 0 && ' Executions will run on the iteration date itself.'}
            </p>
          </CardContent>
        </Card>

        {/* Schedule Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5" />
              Cron Schedule
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              This single interval drives BOTH the Recurring Work Orders cron
              and the Scheduled Invoices cron — they fire together at each tick.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground mr-1">Run every:</span>
              {[
                { label: '5m', value: 5 },
                { label: '15m', value: 15 },
                { label: '30m', value: 30 },
                { label: '1h', value: 60 },
                { label: '2h', value: 120 },
                { label: '6h', value: 360 },
                { label: '12h', value: 720 },
                { label: '24h', value: 1440 },
              ].map(opt => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={scheduleInterval === opt.value ? 'default' : 'outline'}
                  disabled={savingSchedule}
                  onClick={() => handleSaveSchedule(opt.value)}
                  className={`h-8 text-xs ${scheduleInterval === opt.value ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            {lastCronRunAt && (
              <p className="text-xs text-muted-foreground mt-3">
                Last execution: {fmtTime(lastCronRunAt)} &bull; Next: {nextRunAt ? fmtTime(nextRunAt) : 'Pending'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Cron Run History — RWO */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Recurring Work Orders — Run History ({cronRuns.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dataLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : cronRuns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No cron runs recorded yet.</p>
                <p className="text-sm mt-1">Click &ldquo;Run Cron Now&rdquo; to trigger manually, or wait for the next scheduled run.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cronRuns.map((run) => {
                  const isExpanded = expandedRun === run.id;
                  return (
                    <div key={run.id} className="border border-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {statusIcon(run.status)}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{fmtTime(run.startedAt)}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${statusColor(run.status)}`}>
                                {run.status}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                run.triggeredBy === 'vercel_cron'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}>
                                {run.triggeredBy === 'vercel_cron' ? 'CRON' : 'MANUAL'}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {run.totalEligible} eligible &bull; {run.totalSucceeded} succeeded &bull; {run.totalFailed} failed &bull; {fmtDuration(run.durationMs)}
                            </div>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border bg-muted/30 p-3">
                          {run.error && (
                            <div className="mb-3 p-2 bg-red-50 rounded text-sm text-red-700">Error: {run.error}</div>
                          )}
                          {run.results.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{run.totalEligible === 0 ? 'No eligible RWOs' : 'No details'}</p>
                          ) : (
                            <div className="space-y-1.5">
                              {run.results.map((r, i) => (
                                <div key={i} className="flex items-center justify-between p-2 rounded bg-card border border-border text-sm">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {r.status === 'success'
                                      ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                      : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                    <span className="truncate">{r.rwoTitle}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                    {r.status === 'success' ? r.message : <span className="text-red-600">{r.message}</span>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/*
          Scheduled-Invoice run history — matches the layout of the
          RWO Run History card above. Sits at the bottom so the two
          feature areas' history surfaces are stacked: RWO history,
          then SI history.
        */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Scheduled Invoices — Run History ({siRuns.length})
            </CardTitle>
          </CardHeader>
            <CardContent>
              {dataLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : siRuns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No scheduled-invoice cron runs recorded yet.</p>
                  <p className="text-sm mt-1">Click &ldquo;Run SI Cron Now&rdquo; to trigger manually, or wait for the next scheduled run.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {siRuns.map((run) => {
                    const isExpanded = expandedSiRun === run.id;
                    return (
                      <div key={run.id} className="border border-border rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedSiRun(isExpanded ? null : run.id)}
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {statusIcon(run.status)}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{fmtTime(run.startedAt)}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${statusColor(run.status)}`}>
                                  {run.status}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                  run.triggeredBy === 'vercel_cron'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-purple-50 text-purple-700 border-purple-200'
                                }`}>
                                  {run.triggeredBy === 'vercel_cron' ? 'CRON' : 'MANUAL'}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {run.totalEligible} eligible &bull; {run.totalSucceeded} succeeded &bull; {run.totalFailed} failed
                                {typeof run.totalSkipped === 'number' && run.totalSkipped > 0 ? ` • ${run.totalSkipped} skipped` : ''}
                                {' • '}{fmtDuration(run.durationMs)}
                              </div>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border bg-muted/30 p-3">
                            {run.error && (
                              <div className="mb-3 p-2 bg-red-50 rounded text-sm text-red-700">Error: {run.error}</div>
                            )}
                            {run.results.length === 0 ? (
                              <p className="text-sm text-muted-foreground">{run.totalEligible === 0 ? 'No eligible scheduled invoices' : 'No details'}</p>
                            ) : (
                              <div className="space-y-1.5">
                                {run.results.map((r, i) => (
                                  <div key={i} className="flex items-center justify-between p-2 rounded bg-card border border-border text-sm">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {r.status === 'success'
                                        ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                        : r.status === 'skipped'
                                          ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                                          : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                      <span className="truncate">{r.title || r.siNumber || r.siId}</span>
                                      {r.invoiceNumber && (
                                        <span className="text-xs text-muted-foreground font-mono ml-1">→ {r.invoiceNumber}</span>
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                      {r.status === 'success' || r.status === 'skipped'
                                        ? r.message
                                        : <span className="text-red-600">{r.message}</span>}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
      </div>
    </AdminLayout>
  );
}
