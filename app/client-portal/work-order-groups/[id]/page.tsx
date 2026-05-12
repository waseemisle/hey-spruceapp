'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  Send,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { notifyBiddingOpportunity } from '@/lib/notifications';
import { subcontractorAuthId } from '@/lib/subcontractor-ids';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkOrderGroup = {
  id: string;
  createdAt?: any;
  clientId: string;
  companyId?: string | null;
  workOrderIds: string[];
  primaryWorkOrderId: string;
  status?: string;
  biddingSubcontractors?: string[];
  assignedSubcontractor?: string;
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
  clientId?: string;
  clientName?: string;
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

type Subcontractor = {
  id: string;
  uid?: string;
  fullName: string;
  email: string;
  businessName?: string;
  city?: string;
  state?: string;
  skills?: string[];
  matchesCategory?: boolean;
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

  // Permissions
  const [hasShareForBiddingPermission, setHasShareForBiddingPermission] = useState(false);
  const clientNameRef = useRef('');

  // Phase 2: tab sub-data loaded on demand
  const [tabLoading, setTabLoading] = useState(false);
  const loadedTabs = useRef(new Set<ActiveTab>());

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Bidding
  const [showBiddingModal, setShowBiddingModal] = useState(false);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedSubcontractors, setSelectedSubcontractors] = useState<string[]>([]);
  const [biddingSearch, setBiddingSearch] = useState('');
  const [biddingSubmitting, setBiddingSubmitting] = useState(false);

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

  const groupStatus = useMemo(() => {
    if (group?.status) return group.status;
    return bundles.find((b) => b.wo.id === group?.primaryWorkOrderId)?.wo.status || bundles[0]?.wo.status || 'pending';
  }, [group, bundles]);

  const canSendToBidding = hasShareForBiddingPermission
    && ['approved', 'bidding', 'quotes_received'].includes(groupStatus)
    && !group?.assignedSubcontractor;

  // ── Phase 1: load group + WO docs only ───────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u || !groupId) return;
      setLoading(true);
      try {
        const [groupSnap, clientSnap] = await Promise.all([
          getDoc(doc(db, 'workOrderGroups', groupId)),
          getDoc(doc(db, 'clients', u.uid)),
        ]);

        if (!groupSnap.exists()) {
          toast.error('Combined group not found');
          setGroup(null);
          setBundles([]);
          return;
        }

        const clientData = clientSnap.exists() ? (clientSnap.data() as any) : {};
        setHasShareForBiddingPermission(clientData?.permissions?.shareForBidding === true);
        clientNameRef.current = clientData.fullName || u.email || 'Client';

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

  // ── Share for Bidding ─────────────────────────────────────────────────────
  const handleShareForBidding = async () => {
    if (!group) return;
    try {
      const subsSnapshot = await getDocs(query(collection(db, 'subcontractors'), where('status', '==', 'approved')));
      if (subsSnapshot.empty) { toast.error('No approved subcontractors found'); return; }

      let allowedStates: string[] = [];
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const clientSnap = await getDoc(doc(db, 'clients', currentUser.uid));
          const companyId = clientSnap.data()?.companyId;
          if (companyId) {
            const compSnap = await getDoc(doc(db, 'companies', companyId));
            const list = compSnap.data()?.allowedSubcontractorStates;
            if (Array.isArray(list)) allowedStates = list;
          }
        }
      } catch {
        // non-fatal
      }
      const { isSubcontractorAllowedByStates } = await import('@/lib/us-states');

      const alreadyInvited = new Set<string>(Array.isArray(group.biddingSubcontractors) ? group.biddingSubcontractors : []);
      const primaryWo = bundles.find((b) => b.wo.id === group.primaryWorkOrderId)?.wo || bundles[0]?.wo;

      const subsData: Subcontractor[] = subsSnapshot.docs
        .map((d) => ({
          id: d.id,
          uid: d.data().uid,
          fullName: d.data().fullName,
          email: d.data().email,
          businessName: d.data().businessName,
          skills: d.data().skills || [],
          state: d.data().state || '',
          city: d.data().city || '',
        }))
        .filter((s) => isSubcontractorAllowedByStates(s.state, allowedStates))
        .filter((s) => !alreadyInvited.has(subcontractorAuthId(s)))
        .map((sub) => {
          let matchesCategory = false;
          if (primaryWo?.category && sub.skills!.length > 0) {
            const cat = primaryWo.category.toLowerCase();
            matchesCategory = sub.skills!.some((sk: string) => sk.toLowerCase().includes(cat) || cat.includes(sk.toLowerCase()));
          }
          return { ...sub, matchesCategory };
        });

      if (subsData.length === 0) {
        toast.info(alreadyInvited.size > 0 ? 'All approved subcontractors have already been invited.' : 'No approved subcontractors available.');
        return;
      }

      subsData.sort((a, b) => (b.matchesCategory ? 1 : 0) - (a.matchesCategory ? 1 : 0));
      setSubcontractors(subsData);
      setSelectedSubcontractors([]);
      setShowBiddingModal(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load subcontractors');
    }
  };

  const handleSubmitBidding = async () => {
    if (!group || selectedSubcontractors.length === 0) {
      toast.error('Please select at least one subcontractor');
      return;
    }
    setBiddingSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { toast.error('You must be logged in'); return; }

      const res = await fetch('/api/work-order-groups/share-bidding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.id,
          selectedSubcontractorIds: selectedSubcontractors,
          clientUid: currentUser.uid,
          clientName: clientNameRef.current,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to share for bidding');
      }

      const { subAuthIds, isFirstShare, subcontractors: sharedSubs } = data;

      setGroup((prev) => prev ? {
        ...prev,
        status: 'bidding',
        biddingSubcontractors: [...(prev.biddingSubcontractors || []), ...subAuthIds],
      } : prev);
      setBundles((prev) => prev.map((b) => ({ ...b, wo: { ...b.wo, status: 'bidding' } })));
      setShowBiddingModal(false);
      setSelectedSubcontractors([]);
      toast.success(
        isFirstShare
          ? `Shared with ${selectedSubcontractors.length} subcontractor(s) — ${bundles.length} work orders updated`
          : `Added ${selectedSubcontractors.length} more bidder(s) to this group`,
      );

      // Fire-and-forget: notifications + emails
      notifyBiddingOpportunity(subAuthIds, group.id, `GROUP-${group.id.slice(0, 8)}`, 'Combined Work Orders').catch(console.error);

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const primaryWo = bundles.find((b) => b.wo.id === group.primaryWorkOrderId)?.wo || bundles[0]?.wo;
      (sharedSubs as Array<{ id: string; email: string; fullName: string }>).forEach((sub) => {
        if (!sub.email) return;
        fetch('/api/email/send-bidding-opportunity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            toEmail: sub.email,
            toName: sub.fullName,
            workOrderNumber: `GROUP-${group.id.slice(0, 8)}`,
            workOrderTitle: `Combined Work Orders (${bundles.length} orders)`,
            workOrderDescription: primaryWo?.description || '',
            locationName: primaryWo?.locationName || '',
            category: primaryWo?.category || '',
            priority: primaryWo?.priority || '',
            portalLink: `${origin}/subcontractor-portal/bidding`,
          }),
        }).catch(console.error);
        if (sub.id) {
          fetch('/api/messaging/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
              type: 'bidding-opportunity',
              subcontractorId: sub.id,
              context: { workOrderId: group.id, workOrderNumber: `GROUP-${group.id.slice(0, 8)}`, workOrderTitle: `Combined Work Orders (${bundles.length} orders)`, locationName: primaryWo?.locationName || '', category: primaryWo?.category || '', priority: primaryWo?.priority || '' },
            }),
          }).catch(console.error);
        }
      });
    } catch (err: any) {
      console.error('Error submitting bidding:', err);
      toast.error(err?.message || 'Failed to share for bidding');
    } finally {
      setBiddingSubmitting(false);
    }
  };

  const TABS = [
    { key: 'overview' as const, label: 'Overview', icon: FileText },
    { key: 'notes' as const, label: totalNotes > 0 ? `Notes (${totalNotes})` : 'Notes', icon: StickyNote },
    { key: 'history' as const, label: 'History', icon: History },
    { key: 'attachments' as const, label: totalAttachments > 0 ? `Attachments (${totalAttachments})` : 'Attachments', icon: Paperclip },
    { key: 'quotes' as const, label: totalQuotes > 0 ? `Quotes (${totalQuotes})` : 'Quotes', icon: FileText },
    { key: 'invoices' as const, label: totalInvoices > 0 ? `Invoices (${totalInvoices})` : 'Invoices', icon: Receipt },
  ];

  return (
    <>
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

            {/* ── Status + Actions bar ───────────────────────────────── */}
            {canSendToBidding && (
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">Status:</span>
                    {statusBadge(groupStatus)}
                  </div>
                  <Button
                    size="sm"
                    className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    onClick={handleShareForBidding}
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    {group.biddingSubcontractors?.length ? 'Add Bidders' : 'Send to Bidding'}
                  </Button>
                </CardContent>
              </Card>
            )}

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

        {/* ── Bidding Modal ─────────────────────────────────────────── */}
        {showBiddingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 overflow-y-auto">
            <Card className="my-auto flex w-full max-w-lg max-h-[min(90dvh,90vh)] flex-col overflow-hidden rounded-2xl border border-border shadow-xl">
              <CardHeader className="shrink-0 border-b border-border px-6 pt-5 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground">Share for Bidding</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Selected subcontractors will be invited to quote on all {bundles.length} work orders.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setShowBiddingModal(false); setBiddingSearch(''); }} className="h-8 w-8 shrink-0 p-0">
                    ×
                  </Button>
                </div>
              </CardHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search subcontractors..."
                    value={biddingSearch}
                    onChange={e => setBiddingSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-2">
                {subcontractors.filter(s => !biddingSearch.trim() || s.fullName.toLowerCase().includes(biddingSearch.toLowerCase()) || (s.businessName || '').toLowerCase().includes(biddingSearch.toLowerCase())).length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">{biddingSearch.trim() ? 'No subcontractors match your search' : 'No approved subcontractors found'}</p>
                ) : null}
                {subcontractors.filter(s => !biddingSearch.trim() || s.fullName.toLowerCase().includes(biddingSearch.toLowerCase()) || (s.businessName || '').toLowerCase().includes(biddingSearch.toLowerCase())).map((sub) => (
                  <label key={sub.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedSubcontractors.includes(sub.id) ? 'border-blue-400 bg-blue-50' : 'border-border hover:bg-muted/50'
                  }`}>
                    <Checkbox
                      checked={selectedSubcontractors.includes(sub.id)}
                      onCheckedChange={(checked) =>
                        setSelectedSubcontractors((prev) =>
                          checked ? [...prev, sub.id] : prev.filter((id) => id !== sub.id),
                        )
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground">{sub.fullName}</p>
                        {sub.matchesCategory && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Match</span>
                        )}
                      </div>
                      {sub.businessName && (
                        <p className="text-xs text-muted-foreground">{sub.businessName}</p>
                      )}
                      {(sub.city || sub.state) && (
                        <p className="text-xs text-muted-foreground">{[sub.city, sub.state].filter(Boolean).join(', ')}</p>
                      )}
                    </div>
                  </label>
                ))}
                </div>
              </div>
              <div className="shrink-0 border-t border-border px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedSubcontractors.length} selected
                </span>
                <div className="flex gap-2 sm:justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setShowBiddingModal(false); setBiddingSearch(''); }} className="h-9 rounded-xl flex-1 sm:flex-none">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmitBidding}
                    disabled={biddingSubmitting || selectedSubcontractors.length === 0}
                    className="h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex-1 sm:flex-none"
                  >
                    {biddingSubmitting ? 'Sharing…' : `Share with ${selectedSubcontractors.length || '—'}`}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </PageContainer>
    </>
  );
}
