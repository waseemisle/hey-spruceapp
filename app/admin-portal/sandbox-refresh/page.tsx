'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged, getIdToken } from 'firebase/auth';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Database,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Info,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { SYNC_COLLECTIONS } from '@/lib/sandbox-config';

interface CollectionStat {
  copied: number;
  deleted: number;
  error?: string;
}

interface RefreshJob {
  id: string;
  triggeredBy: { uid: string; email: string; displayName: string };
  startedAt: string | null;
  completedAt: string | null;
  status: 'running' | 'completed' | 'failed';
  currentCollection: string;
  stats: Record<string, CollectionStat>;
  totalDocumentsCopied: number;
  completedCollections: number;
  totalCollections: number;
  duration?: number;
  error?: string;
}

const isStaging = process.env.NEXT_PUBLIC_APP_ENV === 'staging';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <Badge className="bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
        Completed
      </Badge>
    );
  }
  if (status === 'running') {
    return (
      <Badge className="bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Running
      </Badge>
    );
  }
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function HistoryRow({
  job,
  isExpanded,
  onToggle,
}: {
  job: RefreshJob;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b border-border hover:bg-accent/30 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-sm whitespace-nowrap">{formatDate(job.startedAt)}</td>
        <td className="px-4 py-3 text-sm">
          <div className="font-medium">{job.triggeredBy?.displayName || job.triggeredBy?.email}</div>
          <div className="text-xs text-muted-foreground">{job.triggeredBy?.email}</div>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={job.status} />
        </td>
        <td className="px-4 py-3 text-sm font-mono">
          {job.totalDocumentsCopied != null ? job.totalDocumentsCopied.toLocaleString() : '—'}
        </td>
        <td className="px-4 py-3 text-sm">
          {job.duration != null ? `${job.duration}s` : '—'}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={6} className="px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Per-collection breakdown
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {Object.entries(job.stats || {}).map(([col, stat]) => (
                <div
                  key={col}
                  className="text-xs bg-background border border-border rounded px-2 py-1.5"
                >
                  <div className="font-medium text-foreground truncate mb-0.5">{col}</div>
                  {stat.copied === -1 ? (
                    <div className="text-red-500 text-[11px]">
                      Error: {stat.error || 'failed'}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">{stat.copied.toLocaleString()} copied</div>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SandboxRefreshPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentJob, setCurrentJob] = useState<RefreshJob | null>(null);
  const [history, setHistory] = useState<RefreshJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const jobUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/portal-login'); return; }
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  // Real-time history listener (production only)
  useEffect(() => {
    if (!db || !user || isStaging) { setHistoryLoading(false); return; }

    const q = query(
      collection(db, 'sandboxRefreshHistory'),
      orderBy('startedAt', 'desc'),
      limit(20),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const jobs = snap.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            startedAt:
              data.startedAt instanceof Timestamp
                ? data.startedAt.toDate().toISOString()
                : (data.startedAt ?? null),
            completedAt:
              data.completedAt instanceof Timestamp
                ? data.completedAt.toDate().toISOString()
                : (data.completedAt ?? null),
          } as RefreshJob;
        });
        setHistory(jobs);
        setHistoryLoading(false);
      },
      (err) => {
        console.error('History listener error:', err);
        setHistoryLoading(false);
      },
    );
    return () => unsub();
  }, [user]);

  const handleRefresh = async () => {
    if (!db || !auth?.currentUser) return;
    setConfirmOpen(false);
    setIsRefreshing(true);

    // Generate jobId client-side so we can start listening before the API creates the doc
    const jobRef = doc(collection(db, 'sandboxRefreshHistory'));
    const jobId = jobRef.id;

    // Start real-time listener on this specific job
    const unsubJob = onSnapshot(
      doc(db, 'sandboxRefreshHistory', jobId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setCurrentJob({
          ...data,
          id: snap.id,
          startedAt:
            data.startedAt instanceof Timestamp
              ? data.startedAt.toDate().toISOString()
              : (data.startedAt ?? null),
          completedAt:
            data.completedAt instanceof Timestamp
              ? data.completedAt.toDate().toISOString()
              : (data.completedAt ?? null),
        } as RefreshJob);
      },
    );
    jobUnsubRef.current = unsubJob;

    try {
      const freshToken = await getIdToken(auth.currentUser, /* forceRefresh */ true);
      const res = await fetch('/api/sandbox-refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`,
        },
        body: JSON.stringify({ jobId }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Sandbox refresh failed');

      toast.success(
        `Sandbox refresh complete — ${data.totalDocumentsCopied?.toLocaleString()} documents synced in ${data.duration}s`,
      );
    } catch (err: any) {
      toast.error(err.message || 'Sandbox refresh failed');
    } finally {
      jobUnsubRef.current?.();
      jobUnsubRef.current = null;
      setIsRefreshing(false);
      setCurrentJob(null);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const progressPct = currentJob
    ? Math.round(
        ((currentJob.completedCollections ?? 0) /
          (currentJob.totalCollections || SYNC_COLLECTIONS.length)) *
          100,
      )
    : 0;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Sandbox Refresh</h1>
              <Badge
                className={
                  isStaging
                    ? 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
                    : 'bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                }
              >
                {isStaging ? 'Sandbox' : 'Production'}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              Copy all production data to the sandbox — one-way, on demand. Like NetSuite&apos;s sandbox refresh.
            </p>
          </div>
        </div>

        {/* Staging notice */}
        {isStaging ? (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="pt-5">
              <div className="flex gap-3">
                <FlaskConical className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900 dark:text-amber-200">
                    You are in the Sandbox environment
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
                    Sandbox refresh must be triggered from the{' '}
                    <strong>Production</strong> admin portal (
                    <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">
                      groundopscos.vercel.app
                    </code>
                    ). Any data you add or change here does not affect production.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Configuration status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>Firebase project: shared (same project for production &amp; sandbox)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>
                    Production database: <code className="bg-muted px-1 rounded text-xs">(default)</code>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>
                    Sandbox database: <code className="bg-muted px-1 rounded text-xs">sandbox</code>
                  </span>
                </div>
                <div className="mt-3 p-3 bg-muted rounded-lg text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">One-time setup (if not done yet):</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>
                      Firebase Console → your project → Firestore Database → <strong>Add Database</strong>
                      → name it exactly <code>sandbox</code>
                    </li>
                    <li>
                      On the staging Vercel deployment set{' '}
                      <code>NEXT_PUBLIC_APP_ENV=staging</code> — this makes the staging app read/write
                      to the <code>sandbox</code> database automatically
                    </li>
                    <li>
                      Copy your Firestore security rules to the <code>sandbox</code> database so
                      client-side reads work in staging
                    </li>
                  </ol>
                </div>
              </CardContent>
            </Card>

            {/* Refresh action */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Refresh Sandbox
                </CardTitle>
                <CardDescription>
                  Overwrites all staging Firestore data with a fresh copy of production. Sandbox-only
                  changes are permanently removed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4 text-sm">
                  <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <ul className="text-amber-800 dark:text-amber-300 space-y-0.5 list-disc list-inside text-xs">
                    <li>
                      Copies all <strong>{SYNC_COLLECTIONS.length} Firestore collections</strong> from
                      production → staging
                    </li>
                    <li>All existing sandbox data is deleted before writing</li>
                    <li>Sandbox changes are <strong>never</strong> synced back to production</li>
                    <li>Typically completes in 1–3 minutes</li>
                  </ul>
                </div>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={isRefreshing}
                  className="gap-2"
                >
                  {isRefreshing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Refreshing…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Refresh Sandbox
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Real-time progress card */}
            {isRefreshing && currentJob && (
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    Refresh in progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>
                      {currentJob.completedCollections ?? 0} /{' '}
                      {currentJob.totalCollections ?? SYNC_COLLECTIONS.length} collections
                    </span>
                    <span className="font-medium">{progressPct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {currentJob.currentCollection && (
                    <p className="text-sm text-muted-foreground">
                      Syncing:{' '}
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                        {currentJob.currentCollection}
                      </code>
                    </p>
                  )}
                  <p className="text-sm">
                    <span className="font-semibold text-foreground">
                      {(currentJob.totalDocumentsCopied ?? 0).toLocaleString()}
                    </span>{' '}
                    <span className="text-muted-foreground">documents copied so far</span>
                  </p>
                </CardContent>
              </Card>
            )}

            {/* History table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Refresh History
                </CardTitle>
                <CardDescription>
                  Last 20 sandbox refreshes. Click any row to expand per-collection stats.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {historyLoading ? (
                  <div className="flex items-center justify-center h-24">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 text-muted-foreground gap-1">
                    <Info className="h-5 w-5" />
                    <p className="text-sm">No refreshes performed yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">
                            Date / Time
                          </th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                            Triggered By
                          </th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                            Status
                          </th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                            Docs Copied
                          </th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                            Duration
                          </th>
                          <th className="px-4 py-2.5 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(job => (
                          <HistoryRow
                            key={job.id}
                            job={job}
                            isExpanded={expandedRows.has(job.id)}
                            onToggle={() => toggleRow(job.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Refresh Sandbox?
            </DialogTitle>
            <DialogDescription>
              <div className="space-y-3 pt-1 text-sm text-muted-foreground">
                <p>
                  This will <strong className="text-foreground">permanently overwrite</strong> all
                  data in the staging environment with the current production data. This cannot be
                  undone.
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>All sandbox-only data will be deleted</li>
                  <li>
                    All <strong className="text-foreground">{SYNC_COLLECTIONS.length}</strong>{' '}
                    Firestore collections will be replaced
                  </li>
                  <li>Staging may be briefly unavailable during the refresh</li>
                  <li>Typically takes 1–3 minutes to complete</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Yes, Refresh Sandbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
