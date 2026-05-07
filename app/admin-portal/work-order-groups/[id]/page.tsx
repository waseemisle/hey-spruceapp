'use client';

import { useEffect, useMemo, useState } from 'react';
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
import AdminLayout from '@/components/admin-layout';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Stethoscope,
  MapPin,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { auth, db } from '@/lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkOrderGroup = {
  id: string;
  createdAt?: any;
  createdBy?: { uid?: string; role?: string };
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
  locationAddress?: string;
  clientName?: string;
  assignedSubcontractorName?: string;
  estimateBudget?: number;
  createdAt?: any;
  completedAt?: any;
  images?: string[];
  completionImages?: string[];
  completionDetails?: string;
  completionNotes?: string;
  timeline?: any[];
  isCombinedPrimary?: boolean;
};

type WoNote = { id: string; content?: string; text?: string; createdAt?: any; userName?: string; createdBy?: string };
type WoQuote = { id: string; subcontractorName?: string; totalAmount?: number; clientAmount?: number; status?: string; createdAt?: any };
type WoInvoice = { id: string; invoiceNumber?: string; totalAmount?: number; status?: string; createdAt?: any };
type WoVendorPayment = { id: string; baseAmount?: number; finalAmount?: number; status?: string; subcontractorName?: string } | null;

type WoBundle = {
  wo: WorkOrderFull;
  notes: WoNote[];
  quotes: WoQuote[];
  invoices: WoInvoice[];
  vendorPayment: WoVendorPayment;
  idx: number; // 1-based position in group
};

type ActiveTab = 'overview' | 'notes' | 'history' | 'attachments' | 'diagnostic_requests' | 'quotes' | 'invoices' | 'vendor_payment';

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
  if (!status) return <Badge variant="outline">—</Badge>;
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
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {label}
    </span>
  );
}

function priorityBadge(priority?: string) {
  if (!priority) return null;
  const map: Record<string, string> = {
    low: 'bg-green-50 text-green-700',
    medium: 'bg-yellow-50 text-yellow-700',
    high: 'bg-red-50 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[priority] || 'bg-gray-50 text-gray-600'}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
    </span>
  );
}

function woBundleLabel(b: WoBundle) {
  return `Work Order ${b.idx}`;
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

export default function AdminWorkOrderGroupDetail() {
  const params = useParams();
  const groupId = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<WorkOrderGroup | null>(null);
  const [bundles, setBundles] = useState<WoBundle[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

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

        const loadedBundles: WoBundle[] = await Promise.all(
          ids.map(async (id, i) => {
            const [woSnap, notesSnap, quotesSnap, invoicesSnap, vpSnap] = await Promise.all([
              getDoc(doc(db, 'workOrders', id)),
              getDocs(query(collection(db, 'workOrderNotes'), where('workOrderId', '==', id))),
              getDocs(query(collection(db, 'quotes'), where('workOrderId', '==', id))),
              getDocs(query(collection(db, 'invoices'), where('workOrderId', '==', id))),
              getDocs(query(collection(db, 'vendorPayments'), where('workOrderId', '==', id))),
            ]);

            const wo: WorkOrderFull = woSnap.exists()
              ? { id: woSnap.id, ...(woSnap.data() as any) }
              : { id, workOrderNumber: id };

            return {
              wo,
              notes: notesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WoNote)),
              quotes: quotesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WoQuote)),
              invoices: invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WoInvoice)),
              vendorPayment: vpSnap.docs.length > 0
                ? ({ id: vpSnap.docs[0].id, ...vpSnap.docs[0].data() } as WoVendorPayment)
                : null,
              idx: i + 1,
            };
          }),
        );

        setBundles(loadedBundles);
      } catch (e: any) {
        console.error('Failed to load work order group:', e);
        toast.error(e?.message || 'Failed to load combined group');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [groupId]);

  // ── Aggregate counts for tab labels ──
  const totalNotes = useMemo(() => bundles.reduce((s, b) => s + b.notes.length, 0), [bundles]);
  const totalQuotes = useMemo(() => bundles.reduce((s, b) => s + b.quotes.length, 0), [bundles]);
  const totalInvoices = useMemo(() => bundles.reduce((s, b) => s + b.invoices.length, 0), [bundles]);
  const totalAttachments = useMemo(() => bundles.reduce((s, b) => s + (b.wo.images?.length || 0) + (b.wo.completionImages?.length || 0), 0), [bundles]);
  const totalVP = useMemo(() => bundles.filter((b) => b.vendorPayment).length, [bundles]);
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

  const TABS = [
    { key: 'overview' as const, label: 'Overview', icon: FileText },
    { key: 'notes' as const, label: totalNotes > 0 ? `Notes (${totalNotes})` : 'Notes', icon: StickyNote },
    { key: 'history' as const, label: 'History', icon: History },
    { key: 'attachments' as const, label: totalAttachments > 0 ? `Attachments (${totalAttachments})` : 'Attachments', icon: Paperclip },
    { key: 'diagnostic_requests' as const, label: 'Diagnostic Requests', icon: Stethoscope },
    { key: 'quotes' as const, label: totalQuotes > 0 ? `Quotes (${totalQuotes})` : 'Quotes', icon: FileText },
    { key: 'invoices' as const, label: totalInvoices > 0 ? `Invoices (${totalInvoices})` : 'Invoices', icon: Receipt },
    { key: 'vendor_payment' as const, label: totalVP > 0 ? `Vendor Payment (${totalVP})` : 'Vendor Payment', icon: DollarSign },
  ];

  return (
    <AdminLayout>
      <PageContainer>
        <PageHeader
          title="Combined Work Orders"
          subtitle={group ? `${group.workOrderIds.length} work orders · Bundle ${groupId?.slice(0, 8)}…` : 'Loading…'}
          icon={Layers}
          iconClassName="text-blue-600"
          action={(
            <Button variant="outline" asChild className="h-10 rounded-xl px-4 font-semibold">
              <Link href="/admin-portal/work-order-groups">
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

            {/* ── Overview ───────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bundles.map((b) => (
                  <Card key={b.wo.id} className="rounded-2xl border border-border shadow-sm">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-0.5">
                            {woBundleLabel(b)}
                          </p>
                          <Link
                            href={`/admin-portal/work-orders/${b.wo.id}`}
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
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {statusBadge(b.wo.status)}
                          {priorityBadge(b.wo.priority)}
                        </div>
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
                        <div className="flex items-start gap-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                          <span>{b.wo.locationName}</span>
                        </div>
                      )}
                      {b.wo.assignedSubcontractorName && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>{b.wo.assignedSubcontractorName}</span>
                        </div>
                      )}
                      {b.wo.estimateBudget != null && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <DollarSign className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>Budget: ${b.wo.estimateBudget.toLocaleString()}</span>
                        </div>
                      )}
                      {b.wo.description && (
                        <p className="text-muted-foreground text-xs mt-1 line-clamp-3 pt-1 border-t border-border">
                          {b.wo.description}
                        </p>
                      )}
                      <div className="pt-2">
                        <Button size="sm" variant="outline" asChild className="h-8 w-full">
                          <Link href={`/admin-portal/work-orders/${b.wo.id}`}>
                            Open Full Details →
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* ── Notes ──────────────────────────────────────────────── */}
            {activeTab === 'notes' && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardContent className="p-5 space-y-3">
                  {totalNotes === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No notes yet.</p>
                  ) : (
                    bundles.map((b) =>
                      b.notes.length > 0 ? (
                        <div key={b.wo.id}>
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                            {woBundleLabel(b)} · {b.wo.workOrderNumber || b.wo.id}
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

            {/* ── History ────────────────────────────────────────────── */}
            {activeTab === 'history' && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardContent className="p-5">
                  {allTimeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No history yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {allTimeline.map(({ event, bundle }, idx) => (
                        <div key={idx} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                          <div className="mt-0.5">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-xs font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 mr-2">
                                  {woBundleLabel(bundle)}
                                </span>
                                <span className="text-sm font-medium text-foreground">
                                  {event.type?.replace(/_/g, ' ')?.replace(/\b\w/g, (c: string) => c.toUpperCase()) || '—'}
                                </span>
                                {event.details && (
                                  <p className="text-sm text-muted-foreground mt-0.5">{event.details}</p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs text-muted-foreground">{formatDate(event.timestamp, true)}</p>
                                {event.userName && (
                                  <p className="text-xs text-muted-foreground">by {event.userName}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Attachments ────────────────────────────────────────── */}
            {activeTab === 'attachments' && (
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
                        <CardHeader className="pb-2 pt-4 px-5">
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                            {woBundleLabel(b)} · {b.wo.workOrderNumber || b.wo.id}
                          </p>
                        </CardHeader>
                        <CardContent className="px-5 pb-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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

            {/* ── Diagnostic Requests ────────────────────────────────── */}
            {activeTab === 'diagnostic_requests' && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardContent className="p-10 text-center">
                  <Stethoscope className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">
                    Diagnostic requests are managed on each individual work order.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {bundles.map((b) => (
                      <Button key={b.wo.id} size="sm" variant="outline" asChild className="h-8">
                        <Link href={`/admin-portal/work-orders/${b.wo.id}#diagnostic_requests`}>
                          {woBundleLabel(b)} · {b.wo.workOrderNumber || b.wo.id}
                        </Link>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Quotes ─────────────────────────────────────────────── */}
            {activeTab === 'quotes' && (
              <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  {totalQuotes === 0 ? (
                    <div className="p-10 text-center">
                      <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">No quotes yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[640px]">
                        <thead>
                          <tr className="border-b border-border bg-muted">
                            <th className="text-left px-5 py-3 font-medium text-muted-foreground">Work Order</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subcontractor</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Amount</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                            <th className="text-right px-5 py-3 font-medium text-muted-foreground">Open</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {bundles.flatMap((b) =>
                            b.quotes.map((q) => (
                              <tr key={q.id} className="hover:bg-muted/50 transition-colors">
                                <td className="px-5 py-3.5">
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                                    {woBundleLabel(b)}
                                  </span>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {b.wo.workOrderNumber || b.wo.id}
                                  </p>
                                </td>
                                <td className="px-4 py-3.5 text-foreground">{q.subcontractorName || '—'}</td>
                                <td className="px-4 py-3.5 text-foreground">
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
                                <td className="px-5 py-3.5 text-right">
                                  <Button size="sm" variant="outline" asChild className="h-8">
                                    <Link href={`/admin-portal/quotes/${q.id}`}>View</Link>
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

            {/* ── Invoices ───────────────────────────────────────────── */}
            {activeTab === 'invoices' && (
              <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  {totalInvoices === 0 ? (
                    <div className="p-10 text-center">
                      <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">No invoices yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[600px]">
                        <thead>
                          <tr className="border-b border-border bg-muted">
                            <th className="text-left px-5 py-3 font-medium text-muted-foreground">Work Order</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Amount</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                            <th className="text-right px-5 py-3 font-medium text-muted-foreground">Open</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {bundles.flatMap((b) =>
                            b.invoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-muted/50 transition-colors">
                                <td className="px-5 py-3.5">
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                                    {woBundleLabel(b)}
                                  </span>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {b.wo.workOrderNumber || b.wo.id}
                                  </p>
                                </td>
                                <td className="px-4 py-3.5 text-foreground font-medium">
                                  {inv.invoiceNumber || inv.id.slice(0, 8) + '…'}
                                </td>
                                <td className="px-4 py-3.5 text-foreground">
                                  ${(inv.totalAmount ?? 0).toLocaleString()}
                                </td>
                                <td className="px-4 py-3.5">{invoiceStatusBadge(inv.status)}</td>
                                <td className="px-4 py-3.5 text-muted-foreground">{formatDate(inv.createdAt)}</td>
                                <td className="px-5 py-3.5 text-right">
                                  <Button size="sm" variant="outline" asChild className="h-8">
                                    <Link href={`/admin-portal/invoices/${inv.id}`}>View</Link>
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

            {/* ── Vendor Payment ─────────────────────────────────────── */}
            {activeTab === 'vendor_payment' && (
              <div className="space-y-4">
                {bundles.every((b) => !b.vendorPayment) ? (
                  <Card className="rounded-2xl border border-border shadow-sm">
                    <CardContent className="p-10 text-center">
                      <DollarSign className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">No vendor payments yet.</p>
                    </CardContent>
                  </Card>
                ) : (
                  bundles.map((b) =>
                    b.vendorPayment ? (
                      <Card key={b.wo.id} className="rounded-2xl border border-border shadow-sm">
                        <CardContent className="p-5">
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">
                            {woBundleLabel(b)} · {b.wo.workOrderNumber || b.wo.id}
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Base Amount</p>
                              <p className="text-sm font-semibold text-foreground">
                                ${(b.vendorPayment.baseAmount || 0).toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Final Amount</p>
                              <p className="text-sm font-semibold text-foreground">
                                ${(b.vendorPayment.finalAmount || b.vendorPayment.baseAmount || 0).toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                (b.vendorPayment as any).status === 'paid'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {(b.vendorPayment as any).status || 'pending'}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-border">
                            <Button size="sm" variant="outline" asChild className="h-8">
                              <Link href={`/admin-portal/work-orders/${b.wo.id}`}>
                                Open Work Order →
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : null,
                  )
                )}
              </div>
            )}
          </div>
        )}
      </PageContainer>
    </AdminLayout>
  );
}