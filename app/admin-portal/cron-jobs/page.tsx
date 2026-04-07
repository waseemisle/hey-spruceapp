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
  Zap, Timer, Hash, Activity, Settings, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface CronRunResult {
  rwoId: string;
  rwoTitle: string;
  status: 'success' | 'error';
  message: string;
  executionId?: string;
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
  status: 'completed' | 'failed' | 'partial' | 'error';
  triggeredBy: 'vercel_cron' | 'manual_api';
  results: CronRunResult[];
  error?: string;
}

export default function CronJobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cronRuns, setCronRuns] = useState<CronRun[]>([]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState(60);
  const [lastCronRunAt, setLastCronRunAt] = useState<Date | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [overdueRWOs, setOverdueRWOs] = useState<Array<{ id: string; title: string; nextExecution: string; clientName: string; locationName: string }>>([]);
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
      if (data.schedule?.lastRunAt) {
        setLastCronRunAt(new Date(data.schedule.lastRunAt));
      } else if (data.runs?.length > 0) {
        setLastCronRunAt(new Date(data.runs[0].completedAt || data.runs[0].startedAt));
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

  // Compute next run and time left
  const nextRunAt = lastCronRunAt
    ? new Date(lastCronRunAt.getTime() + scheduleInterval * 60000)
    : null;
  const timeLeftMs = nextRunAt ? Math.max(0, nextRunAt.getTime() - now.getTime()) : 0;
  const isOverdue = nextRunAt ? now > nextRunAt : false;

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

  const fmtTime = (v: string | Date | null) => {
    if (!v) return 'N/A';
    const d = typeof v === 'string' ? new Date(v) : v;
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Cron Job Monitor</h1>
            <p className="text-muted-foreground mt-1">Track recurring work order auto-execution</p>
          </div>
          <div className="flex gap-2">
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
                {!nextRunAt ? 'Pending' : isOverdue ? 'Overdue' : nextRunAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </CardContent>
          </Card>

          <Card className={isOverdue && nextRunAt ? 'border-orange-300 bg-orange-50/30' : ''}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Time Left</p>
              <p className={`font-bold text-lg tabular-nums ${isOverdue ? 'text-orange-600' : 'text-teal-700'}`}>
                {!nextRunAt ? '—' : isOverdue ? 'Now' : fmtCountdown(timeLeftMs)}
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
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {overdueRWOs.map(rwo => (
                  <div key={rwo.id} className="flex items-center justify-between p-2.5 rounded-lg bg-orange-50 border border-orange-100 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{rwo.title}</div>
                      <div className="text-xs text-muted-foreground">{rwo.clientName} — {rwo.locationName}</div>
                    </div>
                    <div className="text-xs text-orange-700 font-medium shrink-0 ml-2">
                      Due: {new Date(rwo.nextExecution).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Schedule Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5" />
              Cron Schedule
            </CardTitle>
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

        {/* Cron Run History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Run History ({cronRuns.length})
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
                            <div className="space-y-1.5 max-h-80 overflow-y-auto">
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
      </div>
    </AdminLayout>
  );
}
