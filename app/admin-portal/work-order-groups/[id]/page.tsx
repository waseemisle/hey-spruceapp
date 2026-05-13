'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  addDoc,
  serverTimestamp,
  arrayUnion,
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
  Stethoscope,
  MapPin,
  Clock,
  User,
  Send,
  UserPlus,
  CheckCircle,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { auth, db } from '@/lib/firebase';
import { notifyBiddingOpportunity } from '@/lib/notifications';
import { createTimelineEvent } from '@/lib/timeline';
import { subcontractorAuthId } from '@/lib/subcontractor-ids';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkOrderGroup = {
  id: string;
  createdAt?: any;
  createdBy?: { uid?: string; role?: string };
  clientId: string;
  companyId?: string | null;
  workOrderIds: string[];
  primaryWorkOrderId: string;
  status?: string;
  biddingSubcontractors?: string[];
  assignedSubcontractor?: string;
  assignedSubcontractorName?: string;
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
  clientEmail?: string;
  assignedSubcontractorName?: string;
  estimateBudget?: number;
  createdAt?: any;
  completedAt?: any;
  images?: string[];
  completionImages?: string[];
  completionDetails?: string;
  completionNotes?: string;
  timeline?: any[];
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
  idx: number;
};

type Subcontractor = {
  id: string;
  uid?: string;
  fullName: string;
  email: string;
  businessName?: string;
  state?: string;
  city?: string;
  skills?: string[];
  matchesCategory?: boolean;
};

type ActiveTab = 'overview' | 'notes' | 'history' | 'attachments' | 'diagnostic_requests' | 'quotes' | 'invoices' | 'vendor_payment';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_PIPELINE = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'bidding', label: 'Bidding' },
  { key: 'quotes_received', label: 'Quotes Received' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'accepted_by_subcontractor', label: 'In Progress' },
  { key: 'pending_invoice', label: 'Pending Invoice' },
  { key: 'completed', label: 'Completed' },
];

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
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    approved: 'bg-blue-100 text-blue-800 border-blue-200',
    bidding: 'bg-purple-100 text-purple-800 border-purple-200',
    quotes_received: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    assigned: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    accepted_by_subcontractor: 'bg-teal-100 text-teal-800 border-teal-200',
    pending_invoice: 'bg-orange-100 text-orange-800 border-orange-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
    archived: 'bg-muted text-muted-foreground border-border',
  };
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] || 'bg-muted text-foreground border-border'}`}>
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[priority] || 'bg-muted/60 text-muted-foreground'}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
    </span>
  );
}

function invoiceStatusBadge(status?: string) {
  const map: Record<string, string> = {
    draft: 'bg-muted text-foreground',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status || ''] || 'bg-muted text-foreground'}`}>
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

  // Approve
  const [approving, setApproving] = useState(false);

  // Bidding
  const [showBiddingModal, setShowBiddingModal] = useState(false);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedSubcontractors, setSelectedSubcontractors] = useState<string[]>([]);
  const [biddingSearch, setBiddingSearch] = useState('');
  const [biddingSubmitting, setBiddingSubmitting] = useState(false);

  // Assign
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignSubcontractors, setAssignSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedAssignSubId, setSelectedAssignSubId] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);

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

  // Derive effective group status from the group doc or primary WO
  const groupStatus = useMemo(() => {
    if (group?.status) return group.status;
    const primaryBundle = bundles.find((b) => b.wo.id === group?.primaryWorkOrderId);
    return primaryBundle?.wo.status || bundles[0]?.wo.status || 'pending';
  }, [group, bundles]);

  const currentStepIdx = useMemo(
    () => STATUS_PIPELINE.findIndex((s) => s.key === groupStatus),
    [groupStatus],
  );

  const canApprove = groupStatus === 'pending';
  const canSendToBidding = ['approved', 'bidding', 'quotes_received'].includes(groupStatus) && !group?.assignedSubcontractor;
  const canAssign = ['approved', 'bidding', 'quotes_received'].includes(groupStatus);

  // ── Aggregate counts ──────────────────────────────────────────────────────
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

  // ── Approve ───────────────────────────────────────────────────────────────
  const handleApproveGroup = async () => {
    if (!group) return;
    setApproving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { toast.error('You must be logged in'); return; }

      const adminSnap = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminSnap.exists() ? (adminSnap.data().fullName || currentUser.email || 'Admin') : (currentUser.email || 'Admin');

      // Batch-approve every member WO
      await Promise.all(bundles.map(async (b) => {
        const woRef = doc(db, 'workOrders', b.wo.id);
        const snap = await getDoc(woRef);
        const existing = snap.data();
        await updateDoc(woRef, {
          status: 'approved',
          approvedBy: currentUser.uid,
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          timeline: [...(existing?.timeline || []), createTimelineEvent({
            type: 'approved',
            userId: currentUser.uid,
            userName: adminName,
            userRole: 'admin',
            details: `Work order approved by ${adminName} (via combined group)`,
            metadata: { groupId: group.id },
          })],
        });
      }));

      // Update group status
      await updateDoc(doc(db, 'workOrderGroups', group.id), {
        status: 'approved',
        updatedAt: serverTimestamp(),
      });

      setGroup((prev) => prev ? { ...prev, status: 'approved' } : prev);
      setBundles((prev) => prev.map((b) => ({ ...b, wo: { ...b.wo, status: 'approved' } })));
      toast.success(`Combined group approved — ${bundles.length} work orders updated`);
    } catch (err: any) {
      console.error('Error approving group:', err);
      toast.error('Failed to approve group');
    } finally {
      setApproving(false);
    }
  };

  // ── Share for Bidding ─────────────────────────────────────────────────────
  const handleShareForBidding = async () => {
    if (!group) return;
    try {
      const subsSnapshot = await getDocs(query(collection(db, 'subcontractors'), where('status', '==', 'approved')));
      if (subsSnapshot.empty) { toast.error('No approved subcontractors found'); return; }

      // Company-level state filter (same as standard WO)
      let allowedStates: string[] = [];
      try {
        let companyId: string | undefined = group.companyId ?? undefined;
        if (!companyId && group.clientId) {
          const cSnap = await getDoc(doc(db, 'clients', group.clientId));
          companyId = cSnap.data()?.companyId;
        }
        if (companyId) {
          const compSnap = await getDoc(doc(db, 'companies', companyId));
          const list = compSnap.data()?.allowedSubcontractorStates;
          if (Array.isArray(list)) allowedStates = list;
        }
      } catch {
        // state filter lookup failure is non-fatal
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
        if (alreadyInvited.size > 0) {
          toast.info('All approved subcontractors have already been invited to this group.');
        } else {
          toast.error('No approved subcontractors available.');
        }
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
      const adminSnap = currentUser ? await getDoc(doc(db, 'adminUsers', currentUser.uid)) : null;
      const adminName = adminSnap?.exists() ? adminSnap.data().fullName : 'Admin';

      const subAuthIds = selectedSubcontractors.map((subId) => {
        const sub = subcontractors.find((s) => s.id === subId);
        return sub ? subcontractorAuthId(sub) : subId;
      });

      const isFirstShare = !group.biddingSubcontractors?.length;

      // Update every member WO
      await Promise.all(bundles.map(async (b) => {
        const woRef = doc(db, 'workOrders', b.wo.id);
        const snap = await getDoc(woRef);
        const existing = snap.data();
        await updateDoc(woRef, {
          status: 'bidding',
          biddingSubcontractors: arrayUnion(...subAuthIds),
          ...(isFirstShare ? { sharedForBiddingAt: serverTimestamp() } : { biddersLastAddedAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
          timeline: [...(existing?.timeline || []), createTimelineEvent({
            type: 'shared_for_bidding',
            userId: currentUser?.uid || 'unknown',
            userName: adminName,
            userRole: 'admin',
            details: isFirstShare
              ? `Shared with ${selectedSubcontractors.length} subcontractor(s) for bidding (via combined group)`
              : `Added ${selectedSubcontractors.length} more bidder(s) (via combined group)`,
            metadata: { groupId: group.id, subcontractorIds: subAuthIds },
          })],
        });

        // Create biddingWorkOrders entry for each sub × each WO
        await Promise.all(selectedSubcontractors.map(async (subId) => {
          const sub = subcontractors.find((s) => s.id === subId);
          if (!sub) return;
          const authId = subcontractorAuthId(sub);
          await addDoc(collection(db, 'biddingWorkOrders'), {
            workOrderId: b.wo.id,
            workOrderNumber: b.wo.workOrderNumber || b.wo.id,
            subcontractorId: authId,
            subcontractorName: sub.fullName,
            subcontractorEmail: sub.email,
            workOrderTitle: b.wo.title || '',
            workOrderDescription: b.wo.description || '',
            clientId: b.wo.clientId || group.clientId,
            clientName: b.wo.clientName || '',
            priority: b.wo.priority || '',
            category: b.wo.category || '',
            locationName: b.wo.locationName || '',
            locationAddress: b.wo.locationAddress || '',
            images: b.wo.images || [],
            estimateBudget: b.wo.estimateBudget ?? null,
            groupId: group.id,
            status: 'pending',
            sharedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          });
        }));
      }));

      // Update the group doc
      await updateDoc(doc(db, 'workOrderGroups', group.id), {
        status: 'bidding',
        biddingSubcontractors: arrayUnion(...subAuthIds),
        updatedAt: serverTimestamp(),
      });

      // Close modal and update local state
      setGroup((prev) => prev ? {
        ...prev,
        status: 'bidding',
        biddingSubcontractors: [...(prev.biddingSubcontractors || []), ...subAuthIds],
      } : prev);
      setBundles((prev) => prev.map((b) => ({ ...b, wo: { ...b.wo, status: 'bidding' } })));
      toast.success(
        isFirstShare
          ? `Shared with ${selectedSubcontractors.length} subcontractor(s) — ${bundles.length} work orders updated`
          : `Added ${selectedSubcontractors.length} more bidder(s) to this group`,
      );
      setShowBiddingModal(false);
      setSelectedSubcontractors([]);

      // Fire-and-forget: notifications + emails
      notifyBiddingOpportunity(subAuthIds, group.id, `GROUP-${group.id.slice(0, 8)}`, 'Combined Work Orders').catch(console.error);

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      selectedSubcontractors.forEach((subId) => {
        const sub = subcontractors.find((s) => s.id === subId);
        if (!sub?.email) return;
        const primaryWo = bundles.find((b) => b.wo.id === group.primaryWorkOrderId)?.wo || bundles[0]?.wo;
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
        fetch('/api/messaging/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            type: 'bidding-opportunity',
            subcontractorId: subId,
            context: { workOrderId: group.id, workOrderNumber: `GROUP-${group.id.slice(0, 8)}`, workOrderTitle: `Combined Work Orders (${bundles.length} orders)`, locationName: primaryWo?.locationName || '', category: primaryWo?.category || '', priority: primaryWo?.priority || '' },
          }),
        }).catch(console.error);
      });
    } catch (err: any) {
      console.error('Error submitting bidding:', err);
      toast.error(err?.message || 'Failed to share for bidding');
    } finally {
      setBiddingSubmitting(false);
    }
  };

  // ── Assign ────────────────────────────────────────────────────────────────
  const openAssignModal = async () => {
    try {
      const subsSnap = await getDocs(query(collection(db, 'subcontractors'), where('status', '==', 'approved')));
      const subs = subsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Subcontractor));
      setAssignSubcontractors(subs);
      setSelectedAssignSubId('');
      setShowAssignModal(true);
    } catch {
      toast.error('Failed to load subcontractors');
    }
  };

  const handleSubmitAssign = async () => {
    if (!group || !selectedAssignSubId) {
      toast.error('Please select a subcontractor');
      return;
    }
    setAssignSubmitting(true);
    try {
      const sub = assignSubcontractors.find((s) => s.id === selectedAssignSubId);
      if (!sub) { toast.error('Subcontractor not found'); return; }

      const currentUser = auth.currentUser;
      const adminDoc = currentUser ? await getDoc(doc(db, 'adminUsers', currentUser.uid)) : null;
      const adminName = adminDoc?.exists() ? adminDoc.data().fullName : 'Admin';
      const subAuthId = subcontractorAuthId(sub);

      // Assign every member WO
      await Promise.all(bundles.map(async (b) => {
        const woRef = doc(db, 'workOrders', b.wo.id);
        const snap = await getDoc(woRef);
        const existing = snap.data();
        await updateDoc(woRef, {
          status: 'assigned',
          assignedSubcontractor: subAuthId,
          assignedSubcontractorName: sub.fullName,
          assignedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          timeline: [...(existing?.timeline || []), createTimelineEvent({
            type: 'assigned',
            userId: currentUser?.uid || 'unknown',
            userName: adminName,
            userRole: 'admin',
            details: `Assigned to ${sub.fullName} by ${adminName} (via combined group)`,
            metadata: { subcontractorId: subAuthId, subcontractorName: sub.fullName, groupId: group.id, source: 'admin_manual_assign' },
          })],
        });

        await addDoc(collection(db, 'assignedJobs'), {
          workOrderId: b.wo.id,
          subcontractorId: subAuthId,
          groupId: group.id,
          assignedAt: serverTimestamp(),
          status: 'pending_acceptance',
        });
      }));

      // Update group doc
      await updateDoc(doc(db, 'workOrderGroups', group.id), {
        status: 'assigned',
        assignedSubcontractor: subAuthId,
        assignedSubcontractorName: sub.fullName,
        updatedAt: serverTimestamp(),
      });

      // Fire-and-forget: assignment email (one email for the combined group)
      if (sub.email) {
        const primaryWo = bundles.find((b) => b.wo.id === group.primaryWorkOrderId)?.wo || bundles[0]?.wo;
        fetch('/api/email/send-assignment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            toEmail: sub.email,
            toName: sub.fullName,
            workOrderNumber: `GROUP-${group.id.slice(0, 8)}`,
            workOrderTitle: `Combined Work Orders (${bundles.length} orders)`,
            clientName: primaryWo?.clientName || '',
            locationName: primaryWo?.locationName || '',
            locationAddress: primaryWo?.locationAddress || '',
          }),
        }).catch(console.error);
      }

      setGroup((prev) => prev ? { ...prev, status: 'assigned', assignedSubcontractor: subAuthId, assignedSubcontractorName: sub.fullName } : prev);
      setBundles((prev) => prev.map((b) => ({ ...b, wo: { ...b.wo, status: 'assigned', assignedSubcontractorName: sub.fullName } })));
      setShowAssignModal(false);
      toast.success(`Combined group assigned to ${sub.fullName} — ${bundles.length} work orders updated`);
    } catch (err: any) {
      console.error('Error assigning group:', err);
      toast.error(err?.message || 'Failed to assign group');
    } finally {
      setAssignSubmitting(false);
    }
  };

  // ── Tab config ────────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
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
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
          </div>
        ) : !group ? (
          <Card className="rounded-2xl border border-border shadow-sm">
            <CardContent className="p-10 text-center text-muted-foreground">Group not found.</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">

            {/* ── Status Pipeline + Actions ──────────────────────────── */}
            <Card className="rounded-2xl border border-border shadow-sm">
              <CardContent className="p-5">
                {/* Pipeline progress bar */}
                <div className="overflow-x-auto pb-2">
                  <div className="flex items-center gap-0 min-w-max">
                    {STATUS_PIPELINE.map((step, i) => {
                      const isDone = currentStepIdx > i;
                      const isCurrent = currentStepIdx === i;
                      return (
                        <div key={step.key} className="flex items-center">
                          <div className={`flex flex-col items-center gap-1 px-2 ${isCurrent ? 'opacity-100' : isDone ? 'opacity-80' : 'opacity-40'}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                              isDone ? 'bg-blue-600 border-blue-600 text-white' :
                              isCurrent ? 'bg-white border-blue-600 text-blue-600' :
                              'bg-white border-border text-muted-foreground'
                            }`}>
                              {isDone ? <CheckCircle className="h-4 w-4" /> : <span>{i + 1}</span>}
                            </div>
                            <span className={`text-xs whitespace-nowrap font-medium ${isCurrent ? 'text-blue-700' : isDone ? 'text-blue-500' : 'text-muted-foreground'}`}>
                              {step.label}
                            </span>
                          </div>
                          {i < STATUS_PIPELINE.length - 1 && (
                            <div className={`h-0.5 w-6 mx-0 flex-shrink-0 ${isDone ? 'bg-blue-400' : 'bg-muted'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mr-2">
                    <span className="text-xs text-muted-foreground font-medium">Current status:</span>
                    {statusBadge(groupStatus)}
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {canApprove && (
                      <Button
                        size="sm"
                        className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold"
                        onClick={handleApproveGroup}
                        disabled={approving}
                      >
                        <CheckCircle className="h-4 w-4 mr-1.5" />
                        {approving ? 'Approving…' : 'Approve All'}
                      </Button>
                    )}
                    {canSendToBidding && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-4 rounded-xl font-semibold"
                        onClick={handleShareForBidding}
                      >
                        <Send className="h-4 w-4 mr-1.5" />
                        {group.biddingSubcontractors?.length ? 'Add Bidders' : 'Send to Bidding'}
                      </Button>
                    )}
                    {canAssign && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-4 rounded-xl font-semibold"
                        onClick={openAssignModal}
                      >
                        <UserPlus className="h-4 w-4 mr-1.5" />
                        Assign
                      </Button>
                    )}
                    {group.assignedSubcontractorName && (
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        Assigned to <span className="font-medium text-foreground">{group.assignedSubcontractorName}</span>
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Tab nav ────────────────────────────────────────────── */}
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
                            Work Order {b.idx}
                          </p>
                          <Link
                            href={`/admin-portal/work-orders/${b.wo.id}`}
                            className="flex items-center gap-1.5 text-foreground hover:text-blue-700 hover:underline"
                          >
                            <ClipboardList className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-bold text-base">{b.wo.workOrderNumber || b.wo.id}</span>
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
                            Work Order {b.idx} · {b.wo.workOrderNumber || b.wo.id}
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
                        <Link href={`/admin-portal/work-orders/${b.wo.id}`}>
                          WO {b.idx} · {b.wo.workOrderNumber || b.wo.id}
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
                                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                                    WO {b.idx}
                                  </span>
                                  <p className="text-xs text-muted-foreground mt-0.5">{b.wo.workOrderNumber || b.wo.id}</p>
                                </td>
                                <td className="px-4 py-3.5 text-foreground">{q.subcontractorName || '—'}</td>
                                <td className="px-4 py-3.5 text-foreground">${(q.clientAmount ?? q.totalAmount ?? 0).toLocaleString()}</td>
                                <td className="px-4 py-3.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    q.status === 'accepted' ? 'bg-green-100 text-green-800' :
                                    q.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                    q.status === 'sent_to_client' ? 'bg-blue-100 text-blue-800' :
                                    'bg-muted text-foreground'
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
                                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                                    WO {b.idx}
                                  </span>
                                  <p className="text-xs text-muted-foreground mt-0.5">{b.wo.workOrderNumber || b.wo.id}</p>
                                </td>
                                <td className="px-4 py-3.5 font-medium text-foreground">{inv.invoiceNumber || inv.id.slice(0, 8) + '…'}</td>
                                <td className="px-4 py-3.5 text-foreground">${(inv.totalAmount ?? 0).toLocaleString()}</td>
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
                            Work Order {b.idx} · {b.wo.workOrderNumber || b.wo.id}
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Base Amount</p>
                              <p className="text-sm font-semibold">${(b.vendorPayment.baseAmount || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Final Amount</p>
                              <p className="text-sm font-semibold">${(b.vendorPayment.finalAmount || b.vendorPayment.baseAmount || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                b.vendorPayment.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {b.vendorPayment.status || 'pending'}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-border">
                            <Button size="sm" variant="outline" asChild className="h-8">
                              <Link href={`/admin-portal/work-orders/${b.wo.id}`}>Open Work Order →</Link>
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

        {/* ── Assign Modal ──────────────────────────────────────────── */}
        {showAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md rounded-2xl border border-border shadow-xl">
              <CardHeader className="px-6 pt-5 pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Assign Subcontractor</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Will be assigned to all {bundles.length} work orders in this group.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowAssignModal(false)} className="h-8 w-8 p-0">
                    ×
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-6 py-4">
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {assignSubcontractors.map((sub) => (
                    <label key={sub.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      selectedAssignSubId === sub.id ? 'border-blue-400 bg-blue-50' : 'border-border hover:bg-muted/50'
                    }`}>
                      <input
                        type="radio"
                        name="assignSub"
                        value={sub.id}
                        checked={selectedAssignSubId === sub.id}
                        onChange={() => setSelectedAssignSubId(sub.id)}
                        className="accent-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{sub.fullName}</p>
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
                <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                  <Button variant="outline" className="flex-1 h-9 rounded-xl" onClick={() => setShowAssignModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleSubmitAssign}
                    disabled={assignSubmitting || !selectedAssignSubId}
                  >
                    {assignSubmitting ? 'Assigning…' : 'Assign'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </PageContainer>
    </>
  );
}
