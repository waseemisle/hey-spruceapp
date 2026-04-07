'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Clock, CheckCircle, XCircle, AlertTriangle, Loader2, Play, ChevronDown, ChevronUp,
  Zap, Timer, Hash, Activity, Settings, Save,
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
  startedAt: any;
  completedAt: any;
  durationMs: number;
  totalEligible: number;
  totalSucceeded: number;
  totalFailed: number;
  status: 'completed' | 'failed' | 'partial' | 'error';
  triggeredBy: 'vercel_cron' | 'manual_api';
  results: CronRunResult[];
  error?: string;
  createdAt: any;
}

interface OverdueRWO {
  id: string;
  title: string;
  nextExecution: Date;
  clientName: string;
  locationName: string;
}

export default function CronJobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cronRuns, setCronRuns] = useState<CronRun[]>([]);
  const [overdueRWOs, setOverdueRWOs] = useState<OverdueRWO[]>([]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [overdueLoading, setOverdueLoading] = useState(true);
  const [scheduleInterval, setScheduleInterval] = useState(60); // minutes
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [lastCronRunAt, setLastCronRunAt] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());

  // Tick every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

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

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push('/portal-login'); return; }
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  // Load schedule settings
  useEffect(() => {
    if (!db || loading) return;
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, 'systemSettings', 'cronSchedule'));
        if (snap.exists()) {
          const data = snap.data();
          setScheduleInterval(data.intervalMinutes || 60);
          setLastCronRunAt(data.lastRunAt?.toDate?.() || null);
        }
      } catch (e) {
        console.error('Error loading schedule settings:', e);
      } finally {
        setScheduleLoading(false);
      }
    }
    loadSettings();
  }, [loading]);

  const handleSaveSchedule = async (newInterval: number) => {
    setSavingSchedule(true);
    try {
      await setDoc(doc(db, 'systemSettings', 'cronSchedule'), {
        intervalMinutes: newInterval,
        lastRunAt: lastCronRunAt || null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setScheduleInterval(newInterval);
      toast.success(`Schedule updated to every ${newInterval < 60 ? newInterval + ' minutes' : (newInterval / 60) + ' hour(s)'}`);
    } catch (e: any) {
      toast.error('Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  // Real-time listener for cron runs
  useEffect(() => {
    if (!db || loading) return;
    const q = query(
      collection(db, 'cronJobRuns'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsub = onSnapshot(q, (snap) => {
      const runs = snap.docs.map(d => ({ id: d.id, ...d.data() } as CronRun));
      setCronRuns(runs);
      // Keep lastCronRunAt in sync with the most recent actual run
      if (runs.length > 0) {
        const latest = runs[0].completedAt?.toDate?.() || runs[0].startedAt?.toDate?.();
        if (latest) setLastCronRunAt(latest);
      }
    }, (err) => {
      console.error('Cron runs listener error:', err);
    });
    return () => unsub();
  }, [loading]);

  // Fetch overdue RWOs
  useEffect(() => {
    if (!db || loading) return;
    async function fetchOverdue() {
      try {
        const now = new Date();
        const snap = await getDocs(query(
          collection(db, 'recurringWorkOrders'),
          where('status', '==', 'active'),
        ));
        const overdue: OverdueRWO[] = [];
        snap.docs.forEach(d => {
          const data = d.data();
          const next = data.nextExecution?.toDate?.();
          if (next && next <= now) {
            overdue.push({
              id: d.id,
              title: data.title || 'Untitled',
              nextExecution: next,
              clientName: data.clientName || '',
              locationName: data.locationName || '',
            });
          }
        });
        overdue.sort((a, b) => a.nextExecution.getTime() - b.nextExecution.getTime());
        setOverdueRWOs(overdue);
      } catch (err) {
        console.error('Error fetching overdue RWOs:', err);
      } finally {
        setOverdueLoading(false);
      }
    }
    fetchOverdue();
  }, [loading]);

  const handleTriggerCron = async () => {
    setTriggering(true);
    try {
      const res = await fetch('/api/recurring-work-orders/cron', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Cron executed: ${data.totalSucceeded}/${data.totalEligible} succeeded`);
        // Refresh overdue list
        setOverdueLoading(true);
        const snap = await getDocs(query(
          collection(db, 'recurringWorkOrders'),
          where('status', '==', 'active'),
        ));
        const now = new Date();
        const overdue: OverdueRWO[] = [];
        snap.docs.forEach(d => {
          const data = d.data();
          const next = data.nextExecution?.toDate?.();
          if (next && next <= now) {
            overdue.push({ id: d.id, title: data.title || '', nextExecution: next, clientName: data.clientName || '', locationName: data.locationName || '' });
          }
        });
        overdue.sort((a, b) => a.nextExecution.getTime() - b.nextExecution.getTime());
        setOverdueRWOs(overdue);
        setOverdueLoading(false);
      } else {
        toast.error(data.error || 'Cron execution failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger cron');
    } finally {
      setTriggering(false);
    }
  };

  const toDate = (v: any): Date | null => {
    if (!v) return null;
    if (v.toDate) return v.toDate();
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  const fmtTime = (v: any) => {
    const d = toDate(v);
    return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';
  };

  const fmtDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const fmtAgo = (v: any) => {
    const d = toDate(v);
    if (!d) return 'Never';
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
      case 'failed': case 'error': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'partial': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const lastRun = cronRuns[0] || null;
  const lastSuccess = cronRuns.find(r => r.status === 'completed');

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
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
          <Button
            onClick={handleTriggerCron}
            disabled={triggering}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {triggering ? 'Running...' : 'Run Cron Now'}
          </Button>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                  lastRun?.status === 'completed' ? 'bg-emerald-50' : lastRun?.status === 'partial' ? 'bg-yellow-50' : 'bg-red-50'
                }`}>
                  <Activity className={`h-5 w-5 ${
                    lastRun?.status === 'completed' ? 'text-emerald-600' : lastRun?.status === 'partial' ? 'text-yellow-600' : 'text-red-600'
                  }`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Health</p>
                  <p className="font-bold text-foreground">
                    {!lastRun ? 'No runs yet' : lastRun.status === 'completed' ? 'Healthy' : lastRun.status === 'partial' ? 'Degraded' : 'Failing'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Run</p>
                  <p className="font-bold text-foreground">{lastRun ? fmtAgo(lastRun.startedAt) : 'Never'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-orange-50 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Overdue RWOs</p>
                  <p className="font-bold text-foreground">{overdueLoading ? '...' : overdueRWOs.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center">
                  <Timer className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Schedule</p>
                  <p className="font-bold text-foreground">
                    {scheduleLoading ? '...' : scheduleInterval < 60 ? `Every ${scheduleInterval} min` : scheduleInterval === 60 ? 'Every hour' : `Every ${scheduleInterval / 60}h`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Next Run</p>
                  <p className="font-bold text-foreground text-sm">
                    {!nextRunAt ? 'Pending' : isOverdue ? 'Overdue' : nextRunAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={isOverdue && nextRunAt ? 'border-orange-300' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isOverdue ? 'bg-orange-50' : 'bg-teal-50'}`}>
                  <Clock className={`h-5 w-5 ${isOverdue ? 'text-orange-600' : 'text-teal-600'}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Time Left</p>
                  <p className={`font-bold text-lg tabular-nums ${isOverdue ? 'text-orange-600' : 'text-teal-700'}`}>
                    {!nextRunAt ? '—' : isOverdue ? 'Now' : fmtCountdown(timeLeftMs)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Schedule Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5" />
              Cron Schedule Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">Run cron every:</span>
              {[
                { label: '5 min', value: 5 },
                { label: '15 min', value: 15 },
                { label: '30 min', value: 30 },
                { label: '1 hour', value: 60 },
                { label: '2 hours', value: 120 },
                { label: '6 hours', value: 360 },
                { label: '12 hours', value: 720 },
                { label: '24 hours', value: 1440 },
              ].map(opt => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={scheduleInterval === opt.value ? 'default' : 'outline'}
                  disabled={savingSchedule}
                  onClick={() => handleSaveSchedule(opt.value)}
                  className={scheduleInterval === opt.value ? 'bg-purple-600 hover:bg-purple-700' : ''}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            {lastCronRunAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Last cron execution: {fmtTime(lastCronRunAt)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Overdue RWOs */}
        {overdueRWOs.length > 0 && (
          <Card className="border-orange-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-orange-700">
                <AlertTriangle className="h-5 w-5" />
                Currently Overdue ({overdueRWOs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {overdueRWOs.map(rwo => (
                  <div key={rwo.id} className="flex items-center justify-between p-2 rounded-lg bg-orange-50 border border-orange-100 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{rwo.title}</div>
                      <div className="text-xs text-muted-foreground">{rwo.clientName} — {rwo.locationName}</div>
                    </div>
                    <div className="text-xs text-orange-700 font-medium shrink-0 ml-2">
                      Due: {rwo.nextExecution.toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cron Run History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Cron Run History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cronRuns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No cron runs recorded yet.</p>
                <p className="text-sm mt-1">Click &ldquo;Run Cron Now&rdquo; to trigger a manual run.</p>
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
                              {run.totalEligible} eligible • {run.totalSucceeded} succeeded • {run.totalFailed} failed • {fmtDuration(run.durationMs)}
                            </div>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border bg-muted/30 p-3">
                          {run.error && (
                            <div className="mb-3 p-2 bg-red-50 rounded text-sm text-red-700">
                              Error: {run.error}
                            </div>
                          )}
                          {run.results.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No results — {run.totalEligible === 0 ? 'no eligible RWOs found' : 'execution error'}</p>
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
                                  <div className="text-xs text-muted-foreground shrink-0 ml-2">
                                    {r.status === 'success' ? r.message : <span className="text-red-600">{r.message}</span>}
                                  </div>
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
