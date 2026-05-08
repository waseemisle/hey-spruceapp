'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import ClientLayout from '@/components/client-layout';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  ClipboardList,
  DollarSign,
  FileText,
  History,
  Layers,
  Paperclip,
  Receipt,
  StickyNote,
  MapPin,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkOrderGroup = {
  id: string;
  createdAt?: any;
  clientId: string;
  companyId?: string | null;
  workOrderIds: string[];
  primaryWorkOrderId: string;
};

type WorkOrderFull = {
  id: string;
  workOrderNumber?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  category?: string;
  locationName?: string;
  assignedSubcontractorName?: string;
  estimateBudget?: number;
  createdAt?: any;
  images?: string[];
  completionImages?: string[];
  timeline?: any[];
};

type WoNote = { id: string; content?: string; text?: string; createdAt?: any; userName?: string; createdBy?: string };
type WoQuote = { id: string; subcontractorName?: string; totalAmount?: number; clientAmount?: number; status?: string; createdAt?: any };
type WoInvoice = { id: string; invoiceNumber?: string; totalAmount?: number; status?: string; createdAt?: any };

type WoBundle = {
  wo: WorkOrderFull;
  notes: WoNote[];
  quotes: WoQuote[];
  invoices: WoInvoice[];
  idx: number;
};

type ActiveTab = 'overview' | 'notes' | 'history' | 'attachments' | 'quotes' | 'invoices';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: any, includeTime = false) {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const opts: Intl.DateTimeFormatOptions = includeTime
      ? { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleString('en-US', opts);
  } catch {
    return '—';
  }
}

function statusBadge(status?: string) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    approved: 'bg-blue-100 text-blue-800 border-blue-200',
    bidding: 'bg-purple-100 text-purple-800 border-purple-200',
    assigned: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    accepted_by_subcontractor: 'bg-teal-100 text-teal-800 border-teal-200',
    pending_invoice: 'bg-orange-100 text-orange-800 border-orange-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
    archived: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {label}
    </span>
  );
}

function invoiceStatusBadge(status?: string) {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status || ''] || 'bg-gray-100 text-gray-700'}`}>
      {(status || 'unknown').charAt(0).toUpperCase() + (status || 'unknown').slice(1)}
    </span>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ClientWorkOrderGroupDetail() {
  const { auth, db } = useFirebaseInstance();
  const params = useParams();
  const groupId = params?.id as string | undefined;

  // Phase 1: group + WO docs (shown immediately)
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<WorkOrderGroup | null>(null);
  const [bundles, setBundles] = useState<WoBundle[]>([]);

  // Phase 2: tab sub-data loaded on demand
  const [tabLoading, setTabLoading] = useState(false);
  const loadedTabs = useRef(new Set<ActiveTab>());

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Aggregate counts (derived from bundle sub-data, 0 until loaded)
  const totalNotes = useMemo(() => bundles.reduce((s, b) => s + b.notes.length, 0), [bundles]);
  const totalQuotes = useMemo(() => bundles.reduce((s, b) => s + b.quotes.length, 0), [bundles]);
  const totalInvoices = useMemo(() => bundles.reduce((s, b) => s + b.invoices.length, 0), [bundles]);
  const totalAttachments = useMemo(() => bundles.reduce((s, b) => s + (b.wo.images?.length || 0) + (b.wo.completionImages?.length || 0), 0), [bundles]);

  const allTimeline = useMemo(() => {
    const events: Array<{ event: any; bundle: WoBundle }> = [];
    for (const b of bundles) {
      for (const ev of b.wo.timeline || []) {
        events.push({ event: ev, bundle: b });
      }
    }
    events.sort((a, b) => {
      try {
        const ta = a.event.timestamp?.toDate?.() || new Date(a.event.timestamp || 0);
        const tb = b.event.timestamp?.toDate?.() || new Date(b.event.timestamp || 0);
        return tb.getTime() - ta.getTime();
      } catch {
        return 0;
      }
    });
    return events;
  }, [bundles]);

  // ── Phase 1: load group + WO docs only ───────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u || !groupId) return;
      setLoading(true);
      try {
        const groupSnap = await getDoc(doc(db, 'workOrderGroups', groupId));
        if (!groupSnap.exists()) {
          toast.error('Combined group not found');
          setGroup(null);
          setBundles([]);
          return;
        }
        const g = { id: groupSnap.id, ...groupSnap.data() } as WorkOrderGroup;
        setGroup(g);

        const ids = Array.isArray(g.workOrderIds) ? g.workOrderIds.map(String) : [];

        // Load only WO docs upfront (fast — no sub-collections yet)
        const woSnaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'workOrders', id))));

        const initialBundles: WoBundle[] = woSnaps.map((snap, i) => ({
          wo: snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as WorkOrderFull) : { id: ids[i], workOrderNumber: ids[i] },
          notes: [],
          quotes: [],
          invoices: [],
          idx: i + 1,
        }));

        setBundles(initialBundles);
        loadedTabs.current = new Set(['overview', 'history', 'attachments']);
      } catch (e: any) {
        console.error('Failed to load work order group:', e);
        toast.error(e?.message || 'Failed to load combined group');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [auth, db, groupId]);

  // ── Phase 2: lazy-load sub-data for tabs ─────────────────────────────────
  const loadTabData = useCallback(async (tab: ActiveTab, uid: string) => {
    if (loadedTabs.current.has(tab) || bundles.length === 0) return;
    loadedTabs.current.add(tab);
    setTabLoading(true);

    try {
      const ids = bundles.map((b) => b.wo.id);

      if (tab === 'notes') {
        const snaps = await Promise.all(
          ids.map((id) =>
            getDocs(query(
              collection(db, 'workOrderNotes'),
              where('workOrderId', '==', id),
              where('clientId', '==', uid),
            )),
          ),
        );
        setBundles((prev) => prev.map((b, i) => ({
          ...b,
          notes: snaps[i].docs.map((d) => ({ id: d.id, ...d.data() } as WoNote)),
        })));
      }

      if (tab === 'quotes') {
        const snaps = await Promise.all(
          ids.map((id) =>
            getDocs(query(
              collection(db, 'quotes'),
              where('workOrderId', '==', id),
              where('clientId', '==', uid),
            )),
          ),
        );
        setBundles((prev) => prev.map((b, i) => ({
          ...b,
          quotes: snaps[i].docs.map((d) => ({ id: d.id, ...d.data() } as WoQuote)),
        })));
      }

      if (tab === 'invoices') {
        const snaps = await Promise.all(
          ids.map((id) =>
            getDocs(query(
              collection(db, 'invoices'),
              where('workOrderId', '==', id),
              where('clientId', '==', uid),
            )),
          ),
        );
        setBundles((prev) => prev.map((b, i) => ({
          ...b,
          invoices: snaps[i].docs.map((d) => ({ id: d.id, ...d.data() } as WoInvoice)),
        })));
      }
    } catch (e: any) {
      console.error(`Failed to load ${tab} data:`, e);
      toast.error(`Failed to load ${tab}`);
      loadedTabs.current.delete(tab);
    } finally {
      setTabLoading(false);
    }
  }, [db, bundles]);

  // Trigger lazy load whenever active tab changes (once auth is resolved)
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser || loading) return;
    loadTabData(activeTab, currentUser.uid);
  }, [activeTab, loading, loadTabData, auth]);

  const TABS = [
    { key: 'overview' as const, label: 'Overview', icon: FileText },
    { key: 'notes' as const, label: totalNotes > 0 ? `Notes (${totalNotes})` : 'Notes', icon: StickyNote },
    { key: 'history' as const, label: 'History', icon: History },
    { key: 'attachments' as const, label: totalAttachments > 0 ? `Attachments (${totalAttachments})` : 'Attachments', icon: Paperclip },
    { key: 'quotes' as const, label: totalQuotes > 0 ? `Quotes (${totalQuotes})` : 'Quotes', icon: FileText },
    { key: 'invoices' as const, label: totalInvoices > 0 ? `Invoices (${totalInvoices})` : 'Invoices', icon: Receipt },
  ];

  return (
    <ClientLayout>
      <PageContainer>
        <PageHeader
          title="Combined Work Orders"
          subtitle={group ? `${group.workOrderIds.length} work orders in this bundle` : 'Loading…'}
          icon={Layers}
          iconClassName="text-blue-600"
          action={(
            <Button variant="outline" asChild className="h-10 rounded-xl px-4 font-semibold">
              <Link href="/client-portal/work-order-groups">
                <ArrowLeft className="h-4 w-4 mr-2" />
                All Combined
              </Link>
            </Button>
          )}
        />

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : !group ? (
          <Card className="rounded-2xl border border-border shadow-sm">
            <CardContent className="p-10 text-center text-muted-foreground">
              Group not found.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Tab nav */}
            <div className="flex gap-1 overflow-x-auto pb-1 border-b border-border">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t whitespace-nowrap transition-colors ${
                    activeTab === tab.key
                      ? 'text-blue-700 border-b-2 border-blue-600 -mb-px'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab loading indicator */}
            {tabLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            )}

            {/* ── Overview ── */}
            {activeTab === 'overview' && !tabLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bundles.map((b) => (
                  <Card key={b.wo.id} className="rounded-2xl border border-border shadow-sm">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-0.5">
                            Work Order {b.idx}
                          </p>
                          <Link
                            href={`/client-portal/work-orders/${b.wo.id}`}
                            className="flex items-center gap-1.5 text-foreground hover:text-blue-700 hover:underline"
                          >
                            <ClipboardList className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-bold text-base">
                              {b.wo.workOrderNumber || b.wo.id}
                            </span>
                          </Link>
                          {b.wo.title && (
                            <p className="text-sm text-muted-foreground mt-0.5">{b.wo.title}</p>
                          )}
                        </div>
                        <div className="flex-shrink-0">{statusBadge(b.wo.status)}</div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-5 pb-4 space-y-2 text-sm">
                      {b.wo.category && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="font-medium text-foreground w-24 flex-shrink-0">Category</span>
                          <span>{b.wo.category}</span>
                        </div>
                      )}
                      {b.wo.locationName && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>{b.wo.locationName}</span>
                        </div>
                      )}
                      {b.wo.description && (
                        <p className="text-muted-foreground text-xs mt-1 line-clamp-3 pt-1 border-t border-border">
                          {b.wo.description}
                        </p>
                      )}
                      <div className="pt-2">
                        <Button size="sm" variant="outline" asChild className="h-8 w-full">
                          <Link href={`/client-portal/work-orders/${b.wo.id}`}>
                            Open Full Details →
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* ── Notes ── */}
            {activeTab === 'notes' && !tabLoading && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardContent className="p-5 space-y-4">
                  {totalNotes === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No notes yet.</p>
                  ) : (
                    bundles.map((b) =>
                      b.notes.length > 0 ? (
                        <div key={b.wo.id}>
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                            Work Order {b.idx} · {b.wo.workOrderNumber || b.wo.id}
                          </p>
                          <div className="space-y-2">
                            {b.notes.map((n) => (
                              <div key={n.id} className="bg-muted rounded-lg p-3">
                                <p className="text-sm text-foreground">{n.content || n.text || '—'}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {n.userName || n.createdBy || 'Unknown'} · {formatDate(n.createdAt, true)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null,
                    )
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── History ── */}
            {activeTab === 'history' && !tabLoading && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardContent className="p-5">
                  {allTimeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No history yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {allTimeline.map(({ event, bundle }, idx) => (
                        <div key={idx} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-xs font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 mr-2">
                                  WO {bundle.idx}
                                </span>
                                <span className="text-sm font-medium text-foreground">
                                  {event.type?.replace(/_/g, ' ')?.replace(/\b\w/g, (c: string) => c.toUpperCase()) || '—'}
                                </span>
                                {event.details && (
                                  <p className="text-sm text-muted-foreground mt-0.5">{event.details}</p>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground flex-shrink-0">{formatDate(event.timestamp, true)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Attachments ── */}
            {activeTab === 'attachments' && !tabLoading && (
              <div className="space-y-4">
                {totalAttachments === 0 ? (
                  <Card className="rounded-2xl border border-border shadow-sm">
                    <CardContent className="p-10 text-center">
                      <Paperclip className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">No attachments yet.</p>
                    </CardContent>
                  </Card>
                ) : (
                  bundles.map((b) => {
                    const all = [...(b.wo.images || []), ...(b.wo.completionImages || [])];
                    if (all.length === 0) return null;
                    return (
                      <Card key={b.wo.id} className="rounded-2xl border border-border shadow-sm">
                        <CardContent className="p-5">
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">
                            Work Order {b.idx} · {b.wo.workOrderNumber || b.wo.id}
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {all.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                className="block rounded-lg overflow-hidden border border-border aspect-square bg-muted hover:opacity-80 transition-opacity">
                                <Image src={url} alt={`Attachment ${i + 1}`} width={200} height={200} className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Quotes ── */}
            {activeTab === 'quotes' && !tabLoading && (
              <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  {totalQuotes === 0 ? (
                    <div className="p-10 text-center">
                      <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">No quotes yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[540px]">
                        <thead>
                          <tr className="border-b border-border bg-muted">
                            <th className="text-left px-5 py-3 font-medium text-muted-foreground">Work Order</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Amount</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {bundles.flatMap((b) =>
                            b.quotes.map((q) => (
                              <tr key={q.id} className="hover:bg-muted/50">
                                <td className="px-5 py-3.5">
                                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                                    WO {b.idx}
                                  </span>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {b.wo.workOrderNumber || b.wo.id}
                                  </p>
                                </td>
                                <td className="px-4 py-3.5 font-medium text-foreground">
                                  ${(q.clientAmount ?? q.totalAmount ?? 0).toLocaleString()}
                                </td>
                                <td className="px-4 py-3.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    q.status === 'accepted' ? 'bg-green-100 text-green-800' :
                                    q.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                    q.status === 'sent_to_client' ? 'bg-blue-100 text-blue-800' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {(q.status || 'pending').replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-muted-foreground">{formatDate(q.createdAt)}</td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Invoices ── */}
            {activeTab === 'invoices' && !tabLoading && (
              <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  {totalInvoices === 0 ? (
                    <div className="p-10 text-center">
                      <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">No invoices yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[500px]">
                        <thead>
                          <tr className="border-b border-border bg-muted">
                            <th className="text-left px-5 py-3 font-medium text-muted-foreground">Work Order</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Amount</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                            <th className="text-right px-5 py-3 font-medium text-muted-foreground">Open</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {bundles.flatMap((b) =>
                            b.invoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-muted/50">
                                <td className="px-5 py-3.5">
                                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                                    WO {b.idx}
                                  </span>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {b.wo.workOrderNumber || b.wo.id}
                                  </p>
                                </td>
                                <td className="px-4 py-3.5 font-medium text-foreground">
                                  {inv.invoiceNumber || inv.id.slice(0, 8) + '…'}
                                </td>
                                <td className="px-4 py-3.5 font-medium text-foreground">
                                  ${(inv.totalAmount ?? 0).toLocaleString()}
                                </td>
                                <td className="px-4 py-3.5">{invoiceStatusBadge(inv.status)}</td>
                                <td className="px-5 py-3.5 text-right">
                                  <Button size="sm" variant="outline" asChild className="h-8">
                                    <Link href={`/client-portal/invoices/${inv.id}`}>View</Link>
                                  </Button>
                                </td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </PageContainer>
    </ClientLayout>
  );
}
