'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, Timestamp, addDoc, arrayUnion } from 'firebase/firestore';
import { createTimelineEvent } from '@/lib/timeline';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, MapPin, Calendar, FileText, Image as ImageIcon, AlertCircle, MessageSquare, CheckCircle, DollarSign, XCircle, GitCompare, Clock, History, Paperclip, Receipt, Share2, X, Archive } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatAddress } from '@/lib/utils';
import { toast } from 'sonner';
import { notifyBiddingOpportunity } from '@/lib/notifications';
import { subcontractorAuthId } from '@/lib/subcontractor-ids';
import CompareQuotesDialog from '@/components/compare-quotes-dialog';
import WorkOrderSystemInfo from '@/components/work-order-system-info';
import { ImageLightbox } from '@/components/ui/image-lightbox';

interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
  locationAddress?: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  images?: string[];
  createdAt: any;
  approvedAt?: any;
  completedAt?: any;
  rejectionReason?: string;
  estimateBudget?: number;
  completionDetails?: string;
  completionNotes?: string;
  completionImages?: string[];
  assignedSubcontractor?: string;
  assignedSubcontractorName?: string;
  scheduledServiceDate?: any;
  scheduledServiceTime?: string;
  approvedQuoteId?: string;
  approvedQuoteAmount?: number;
  approvedQuoteLaborCost?: number;
  approvedQuoteMaterialCost?: number;
  approvedQuoteTaxAmount?: number;
  approvedQuoteLineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  timeline?: any[];
  systemInformation?: any;
  // Source tracking fields
  isMaintenanceRequestOrder?: boolean;
  isFromRecurringWorkOrder?: boolean;
  importedFromCSV?: boolean;
  createdViaAPI?: boolean;
  createdBy?: string;
  approvedBy?: string;
  recurringWorkOrderNumber?: string;
  maintRequestNumber?: string;
  appyRequestor?: string;
  importFileName?: string;
  assignedToName?: string;
  assignedAt?: any;
  rejectedAt?: any;
  companyId?: string;
}

interface Subcontractor {
  id: string;
  fullName: string;
  email: string;
  businessName?: string;
  city?: string;
  state?: string;
  status: 'pending' | 'approved' | 'rejected';
  matchesCategory?: boolean;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Quote {
  id: string;
  workOrderId: string;
  workOrderNumber: string;
  workOrderTitle: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail: string;
  laborCost: number;
  materialCost: number;
  additionalCosts: number;
  discountAmount: number;
  totalAmount: number;
  originalAmount: number;
  clientAmount?: number;
  markupPercentage?: number;
  lineItems: LineItem[];
  notes?: string;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
  estimatedDuration?: string;
  createdAt: any;
  sentToClientAt?: any;
}

const STATUS_PIPELINE = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'bidding', label: 'Bidding' },
  { key: 'quotes_received', label: 'Quotes Received' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'accepted_by_subcontractor', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

export default function ViewClientWorkOrder() {
  const { auth, db } = useFirebaseInstance();
  const params = useParams();
  const id = params?.id as string;

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasApproveRejectPermission, setHasApproveRejectPermission] = useState(false);
  const [hasCompareQuotesPermission, setHasCompareQuotesPermission] = useState(false);
  const [hasViewTimelinePermission, setHasViewTimelinePermission] = useState(false);
  const [hasShareForBiddingPermission, setHasShareForBiddingPermission] = useState(false);
  const [hasArchivePermission, setHasArchivePermission] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showBiddingModal, setShowBiddingModal] = useState(false);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedSubcontractors, setSelectedSubcontractors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [relatedInvoices, setRelatedInvoices] = useState<
    Array<{ id: string; invoiceNumber?: string; totalAmount?: number; status?: string; createdAt?: { toDate?: () => Date } }>
  >([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'attachments' | 'quotes' | 'invoices' | 'history'>('overview');

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const clientDoc = await getDoc(doc(db, 'clients', user.uid));
          const clientData = clientDoc.data();
          setHasApproveRejectPermission(clientData?.permissions?.approveRejectOrder === true);
          setHasCompareQuotesPermission(clientData?.permissions?.compareQuotes === true);
          setHasViewTimelinePermission(clientData?.permissions?.viewTimeline === true);
          setHasShareForBiddingPermission(clientData?.permissions?.shareForBidding === true);
          setHasArchivePermission(clientData?.permissions?.archiveWorkOrders === true);
        } catch (error) {
          console.error('Error fetching client permissions:', error);
        }
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db]);

  useEffect(() => {
    const fetchWorkOrder = async () => {
      if (!id) return;

      try {
        const woDoc = await getDoc(doc(db, 'workOrders', id));
        if (woDoc.exists()) {
          setWorkOrder({ id: woDoc.id, ...woDoc.data() } as WorkOrder);

          const currentUser = auth.currentUser;
          if (currentUser) {
            const quotesQuery = query(
              collection(db, 'quotes'),
              where('clientId', '==', currentUser.uid)
            );
            const quotesSnapshot = await getDocs(quotesQuery);
            const allClientQuotes = quotesSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
            })) as Quote[];
            setQuotes(
              allClientQuotes.filter(
                q => q.workOrderId === id && ['sent_to_client', 'accepted', 'rejected'].includes(q.status)
              )
            );

            const invQuery = query(
              collection(db, 'invoices'),
              where('clientId', '==', currentUser.uid),
              where('workOrderId', '==', id)
            );
            const invSnap = await getDocs(invQuery);
            setRelatedInvoices(
              invSnap.docs.map((d) => ({
                id: d.id,
                invoiceNumber: d.data().invoiceNumber,
                totalAmount: d.data().totalAmount,
                status: d.data().status,
                createdAt: d.data().createdAt,
              }))
            );
          }
        }
      } catch (error) {
        console.error('Error fetching work order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkOrder();
  }, [id, db, hasCompareQuotesPermission]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'approved': return 'text-green-600 bg-green-50';
      case 'rejected': return 'text-red-600 bg-red-50';
      case 'bidding': return 'text-blue-600 bg-blue-50';
      case 'quotes_received': return 'text-blue-600 bg-blue-50';
      case 'assigned': return 'text-indigo-600 bg-indigo-50';
      case 'accepted_by_subcontractor': return 'text-purple-600 bg-purple-50';
      case 'pending_invoice': return 'text-orange-600 bg-orange-50';
      case 'completed': return 'text-emerald-600 bg-emerald-50';
      case 'archived': return 'text-gray-600 bg-gray-100';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getCreatedDetails = (wo: WorkOrder, existingCreatedEvent?: { details?: string; metadata?: Record<string, unknown> }) => {
    let createdDetails = 'Work order created';
    const creatorName = wo.systemInformation?.createdBy?.name;

    if (wo.createdViaAPI || wo.isMaintenanceRequestOrder) {
      const parts = ['Work order created from Maintenance Request'];
      if (wo.maintRequestNumber) parts.push(` (${wo.maintRequestNumber})`);
      if (wo.appyRequestor) parts.push(` — Requestor: ${wo.appyRequestor}`);
      createdDetails = parts.join('');
    } else if (wo.isFromRecurringWorkOrder) {
      createdDetails = `Work order created from Recurring Work Order${wo.recurringWorkOrderNumber ? ` (${wo.recurringWorkOrderNumber})` : ''}`;
    } else if (wo.importedFromCSV) {
      createdDetails = wo.importFileName ? `Work order created via CSV import (${wo.importFileName})` : 'Work order created via CSV import';
    } else if (wo.systemInformation?.createdBy?.role === 'client') {
      createdDetails = creatorName
        ? `Work order created by ${creatorName} via Client Portal`
        : 'Work order created via Client Portal';
    } else if (wo.systemInformation?.createdBy?.role === 'admin') {
      createdDetails = creatorName
        ? `Work order created by ${creatorName} via Admin Portal`
        : 'Work order created via Admin Portal';
    } else if (wo.systemInformation?.createdBy?.role === 'system') {
      createdDetails = creatorName
        ? `Work order created by ${creatorName} (system)`
        : 'Work order created by system';
    } else if (existingCreatedEvent?.metadata?.source === 'client_portal_ui') {
      createdDetails = existingCreatedEvent.details?.trim() || 'Work order created via Client Portal';
    } else if (existingCreatedEvent?.metadata?.source === 'admin_portal_ui') {
      createdDetails = existingCreatedEvent.details?.trim() || 'Work order created via Admin Portal';
    } else if (existingCreatedEvent?.details?.trim()) {
      createdDetails = existingCreatedEvent.details;
    } else {
      createdDetails = 'Work order created via portal';
    }
    return createdDetails;
  };

  const buildTimeline = (wo: WorkOrder) => {
    const existingCreated = wo.timeline?.find((e: any) => e?.type === 'created');
    const createdDetails = getCreatedDetails(wo, existingCreated);
    const createdEvent = {
      id: 'created',
      timestamp: wo.createdAt ?? null,
      type: 'created',
      userId: 'unknown',
      userName: wo.systemInformation?.createdBy?.name || 'System',
      userRole: 'system' as const,
      details: createdDetails,
    };

    if (wo.timeline && wo.timeline.length > 0) {
      let hasCreated = false;
      const enriched = wo.timeline.map((event: any) => {
        if (event?.type === 'created') {
          hasCreated = true;
          return { ...event, details: createdDetails };
        }
        return event;
      });
      if (!hasCreated) return [createdEvent, ...enriched];
      return enriched;
    }

    const events: any[] = [createdEvent];
    if (wo.approvedAt) {
      events.push({
        id: 'approved', timestamp: wo.approvedAt, type: 'approved',
        userId: 'unknown', userName: wo.systemInformation?.approvedBy?.name || 'Admin',
        userRole: 'admin', details: 'Work order approved',
      });
    }
    if (wo.assignedAt && (wo.assignedToName || wo.assignedSubcontractorName)) {
      events.push({
        id: 'assigned', timestamp: wo.assignedAt, type: 'assigned',
        userId: 'unknown', userName: 'Admin', userRole: 'admin',
        details: `Assigned to ${wo.assignedToName || wo.assignedSubcontractorName}`,
      });
    }
    if (wo.scheduledServiceDate && wo.scheduledServiceTime) {
      const d = wo.scheduledServiceDate?.toDate ? wo.scheduledServiceDate.toDate() : new Date(wo.scheduledServiceDate);
      events.push({
        id: 'schedule_set', timestamp: wo.scheduledServiceDate, type: 'schedule_set',
        userId: 'unknown', userName: wo.assignedToName || wo.assignedSubcontractorName || 'Subcontractor',
        userRole: 'subcontractor', details: `Service scheduled for ${d.toLocaleDateString()} at ${wo.scheduledServiceTime}`,
      });
    }
    if (wo.completedAt) {
      events.push({
        id: 'completed', timestamp: wo.completedAt, type: 'completed',
        userId: 'unknown', userName: wo.assignedToName || wo.assignedSubcontractorName || 'Subcontractor',
        userRole: 'subcontractor', details: 'Work order completed',
      });
    }
    return events;
  };

  const handleShareForBidding = async () => {
    if (!hasShareForBiddingPermission) {
      toast.error('You do not have permission to share work orders for bidding');
      return;
    }
    if (!workOrder) return;

    try {
      const subsQuery = query(collection(db, 'subcontractors'), where('status', '==', 'approved'));
      const subsSnapshot = await getDocs(subsQuery);

      if (subsSnapshot.empty) {
        toast.error('No approved subcontractors found');
        return;
      }

      // Company-level subcontractor-state permission. Empty/missing array = ALL allowed.
      let allowedStates: string[] = [];
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
          const companyId = clientDoc.data()?.companyId;
          if (companyId) {
            const companySnap = await getDoc(doc(db, 'companies', companyId));
            const list = companySnap.data()?.allowedSubcontractorStates;
            if (Array.isArray(list)) allowedStates = list;
          }
        }
      } catch (err) {
        // If lookup fails, fall through to "all allowed" — never block sharing on this.
        console.warn('[shareForBidding] state-permission lookup failed', err);
      }
      const { isSubcontractorAllowedByStates } = await import('@/lib/us-states');

      const allSubsData = subsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          fullName: doc.data().fullName,
          email: doc.data().email,
          businessName: doc.data().businessName,
          skills: doc.data().skills || [],
          state: doc.data().state || '',
          city: doc.data().city || '',
        }))
        .filter((sub) => isSubcontractorAllowedByStates(sub.state, allowedStates)) as (Subcontractor & { skills: string[]; state: string; city: string })[];

      if (allSubsData.length === 0) {
        toast.error(
          allowedStates.length > 0
            ? `No approved subcontractors found in your company's allowed states (${allowedStates.join(', ')})`
            : 'No approved subcontractors found',
        );
        return;
      }

      let matchingCount = 0;
      const subsData = allSubsData.map(sub => {
        let matchesCategory = false;
        if (workOrder.category) {
          const categoryLower = workOrder.category.toLowerCase();
          if (sub.skills && sub.skills.length > 0) {
            matchesCategory = sub.skills.some(skill =>
              skill.toLowerCase().includes(categoryLower) ||
              categoryLower.includes(skill.toLowerCase())
            );
          }
        }
        if (matchesCategory) matchingCount++;
        return { id: sub.id, fullName: sub.fullName, email: sub.email, businessName: sub.businessName, matchesCategory } as Subcontractor;
      });

      if (workOrder.category) {
        if (matchingCount === 0) {
          toast.warning(`No subcontractors found matching category "${workOrder.category}". Showing all ${subsData.length} subcontractor(s).`);
        } else {
          toast.success(`Found ${matchingCount} subcontractor(s) matching category "${workOrder.category}".`);
        }
      }

      subsData.sort((a, b) => (b.matchesCategory ? 1 : 0) - (a.matchesCategory ? 1 : 0));
      setSubcontractors(subsData);
      setSelectedSubcontractors([]);
      setShowBiddingModal(true);
    } catch (error) {
      console.error('Error loading subcontractors:', error);
      toast.error('Failed to load subcontractors');
    }
  };

  const handleSubmitBidding = async () => {
    if (!workOrder) return;
    if (selectedSubcontractors.length === 0) {
      toast.error('Please select at least one subcontractor');
      return;
    }

    setSubmitting(true);
    try {
      const workOrderNumber = workOrder.workOrderNumber || `WO-${Date.now().toString().slice(-8)}`;

      const subAuthIds = selectedSubcontractors.map(subId => {
        const sub = subcontractors.find(s => s.id === subId);
        return sub ? subcontractorAuthId(sub) : subId;
      });

      const promises = selectedSubcontractors.map(async subId => {
        const sub = subcontractors.find(s => s.id === subId);
        if (!sub) return;
        const authId = subcontractorAuthId(sub);
        await addDoc(collection(db, 'biddingWorkOrders'), {
          workOrderId: workOrder.id,
          workOrderNumber,
          subcontractorId: authId,
          subcontractorName: sub.fullName,
          subcontractorEmail: sub.email,
          workOrderTitle: workOrder.title,
          workOrderDescription: workOrder.description,
          clientId: workOrder.clientId,
          clientName: workOrder.clientName,
          clientEmail: workOrder.clientEmail || '',
          companyId: workOrder.companyId || null,
          images: workOrder.images || [],
          estimateBudget: (workOrder as any).estimateBudget ?? null,
          priority: workOrder.priority || '',
          category: workOrder.category || '',
          locationName: workOrder.locationName || '',
          locationAddress: (workOrder as any).locationAddress || '',
          status: 'pending',
          sharedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      });

      await Promise.all(promises);

      await notifyBiddingOpportunity(subAuthIds, workOrder.id, workOrderNumber, workOrder.title);

      try {
        for (const subId of selectedSubcontractors) {
          const sub = subcontractors.find(s => s.id === subId);
          if (sub && sub.email) {
            await fetch('/api/email/send-bidding-opportunity', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                toEmail: sub.email,
                toName: sub.fullName,
                workOrderNumber,
                workOrderTitle: workOrder.title,
                workOrderDescription: workOrder.description,
                locationName: workOrder.locationName,
                category: workOrder.category,
                priority: workOrder.priority,
                portalLink: `${window.location.origin}/subcontractor-portal/bidding`,
              }),
            });
          }
        }
      } catch (emailError) {
        console.error('Failed to send bidding opportunity emails:', emailError);
      }

      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
      const clientName = clientDoc.exists() ? clientDoc.data().fullName : 'Client';

      const woDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const woData = woDoc.data();
      const existingTimeline = woData?.timeline || [];
      const existingSysInfo = woData?.systemInformation || {};

      const selectedSubNames = selectedSubcontractors.map(subId => {
        const sub = subcontractors.find(s => s.id === subId);
        return sub ? sub.fullName : 'Unknown';
      }).join(', ');

      const timelineEvent = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Timestamp.now(),
        type: 'shared_for_bidding',
        userId: currentUser.uid,
        userName: clientName,
        userRole: 'client',
        details: `Shared for bidding with ${selectedSubcontractors.length} subcontractor(s): ${selectedSubNames}`,
        metadata: { subcontractorIds: selectedSubcontractors, subcontractorCount: selectedSubcontractors.length },
      };

      const updatedSysInfo = {
        ...existingSysInfo,
        sharedForBidding: {
          by: { id: currentUser.uid, name: clientName },
          timestamp: Timestamp.now(),
          subcontractors: selectedSubcontractors.map(subId => {
            const sub = subcontractors.find(s => s.id === subId);
            return { id: subId, name: sub ? sub.fullName : 'Unknown' };
          }),
        },
      };

      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'bidding',
        workOrderNumber,
        sharedForBiddingAt: serverTimestamp(),
        biddingSubcontractors: arrayUnion(...subAuthIds),
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: updatedSysInfo,
      });

      toast.success(`Work order shared with ${selectedSubcontractors.length} subcontractor(s)`);
      setShowBiddingModal(false);
      setSelectedSubcontractors([]);

      const refreshDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      if (refreshDoc.exists()) {
        setWorkOrder({ id: refreshDoc.id, ...refreshDoc.data() } as WorkOrder);
      }
    } catch (error: any) {
      console.error('Error sharing work order:', error);
      toast.error(error.message || 'Failed to share work order');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSubcontractorSelection = (subId: string) => {
    setSelectedSubcontractors(prev =>
      prev.includes(subId) ? prev.filter(id => id !== subId) : [...prev, subId]
    );
  };

  const selectAllSubcontractors = () => {
    if (selectedSubcontractors.length === subcontractors.length) {
      setSelectedSubcontractors([]);
    } else {
      setSelectedSubcontractors(subcontractors.map(s => s.id));
    }
  };

  const handleQuoteSelection = (quoteId: string, checked: boolean) => {
    if (checked) {
      setSelectedQuoteIds(prev => [...prev, quoteId]);
    } else {
      setSelectedQuoteIds(prev => prev.filter(id => id !== quoteId));
    }
  };

  const handleCompareQuotes = () => {
    if (selectedQuoteIds.length >= 2) {
      setShowCompareDialog(true);
    }
  };

  const selectedQuotes = quotes.filter(q => selectedQuoteIds.includes(q.id));

  const handleApproveWorkOrder = async () => {
    if (!hasApproveRejectPermission) {
      toast.error('You do not have permission to approve work orders');
      return;
    }
    if (!workOrder) return;

    setProcessing(true);
    try {
      const currentUser = auth.currentUser;
      let clientName = workOrder.clientName || 'Client';
      if (currentUser) {
        const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
        if (clientDoc.exists()) {
          clientName = clientDoc.data().fullName || clientName;
        }
      }

      const woDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const woData = woDoc.data();
      const existingTimeline = woData?.timeline || [];
      const existingSysInfo = woData?.systemInformation || {};

      const timelineEvent = createTimelineEvent({
        type: 'approved',
        userId: currentUser?.uid || 'unknown',
        userName: clientName,
        userRole: 'client',
        details: `Work order approved by ${clientName} via Client Portal`,
        metadata: {},
      });

      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: {
          ...existingSysInfo,
          approvedBy: {
            id: currentUser?.uid || 'unknown',
            name: clientName,
            timestamp: Timestamp.now(),
          },
        },
      });
      toast.success('Work order approved successfully');

      const refreshDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      if (refreshDoc.exists()) {
        setWorkOrder({ id: refreshDoc.id, ...refreshDoc.data() } as WorkOrder);
      }
    } catch (error: any) {
      console.error('Error approving work order:', error);
      toast.error(error.message || 'Failed to approve work order');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectWorkOrder = async () => {
    if (!hasApproveRejectPermission) {
      toast.error('You do not have permission to reject work orders');
      return;
    }
    if (!workOrder) return;

    const reason = prompt('Please provide a reason for rejection:');
    if (!reason || reason.trim() === '') {
      toast.error('Rejection reason is required');
      return;
    }

    setProcessing(true);
    try {
      const currentUser = auth.currentUser;
      let clientName = workOrder.clientName || 'Client';
      if (currentUser) {
        const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
        if (clientDoc.exists()) {
          clientName = clientDoc.data().fullName || clientName;
        }
      }

      const woDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const woData = woDoc.data();
      const existingTimeline = woData?.timeline || [];
      const existingSysInfo = woData?.systemInformation || {};

      const timelineEvent = createTimelineEvent({
        type: 'rejected',
        userId: currentUser?.uid || 'unknown',
        userName: clientName,
        userRole: 'client',
        details: `Work order rejected by ${clientName}. Reason: ${reason.trim()}`,
        metadata: { reason: reason.trim() },
      });

      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'rejected',
        rejectionReason: reason.trim(),
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: {
          ...existingSysInfo,
          rejectedBy: {
            id: currentUser?.uid || 'unknown',
            name: clientName,
            timestamp: Timestamp.now(),
            reason: reason.trim(),
          },
        },
      });
      toast.success('Work order rejected');

      const refreshDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      if (refreshDoc.exists()) {
        setWorkOrder({ id: refreshDoc.id, ...refreshDoc.data() } as WorkOrder);
      }
    } catch (error: any) {
      console.error('Error rejecting work order:', error);
      toast.error(error.message || 'Failed to reject work order');
    } finally {
      setProcessing(false);
    }
  };

  const handleArchiveWorkOrder = async () => {
    if (!workOrder) return;
    setArchiving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { toast.error('You must be logged in'); return; }

      const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
      const clientName = clientDoc.exists() ? (clientDoc.data().fullName || currentUser.email || 'Client') : (currentUser.email || 'Client');

      const woRef = doc(db, 'workOrders', workOrder.id);
      const woSnap = await getDoc(woRef);
      const woData = woSnap.data();

      await updateDoc(woRef, {
        status: 'archived',
        previousStatus: workOrder.status,
        archivedBy: currentUser.uid,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...(woData?.timeline || []), createTimelineEvent({
          type: 'archived',
          userId: currentUser.uid,
          userName: clientName,
          userRole: 'client',
          details: `Work order archived by ${clientName} (Client)`,
          metadata: { previousStatus: workOrder.status },
        })],
        systemInformation: {
          ...(woData?.systemInformation || {}),
          archivedBy: {
            id: currentUser.uid,
            name: clientName,
            role: 'client',
            timestamp: Timestamp.now(),
          },
        },
      });

      toast.success('Work order archived successfully');
      // Refresh
      const refreshSnap = await getDoc(woRef);
      if (refreshSnap.exists()) {
        setWorkOrder({ id: refreshSnap.id, ...refreshSnap.data() } as any);
      }
    } catch (error: any) {
      console.error('Error archiving work order:', error);
      toast.error(error.message || 'Failed to archive work order');
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  if (!workOrder) {
    return (
      <ClientLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-foreground">Work Order Not Found</h2>
          <Link href="/client-portal/work-orders">
            <Button className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Work Orders
            </Button>
          </Link>
        </div>
      </ClientLayout>
    );
  }

  const currentStepIdx = STATUS_PIPELINE.findIndex(s => s.key === workOrder.status);
  const totalImages = (workOrder.images?.length ?? 0) + (workOrder.completionImages?.length ?? 0);

  const TABS = [
    { key: 'overview', label: 'Overview', icon: FileText },
    { key: 'attachments', label: `Attachments${totalImages > 0 ? ` (${totalImages})` : ''}`, icon: Paperclip },
    ...(quotes.length > 0 ? [{ key: 'quotes', label: `Quotes (${quotes.length})`, icon: Receipt }] : []),
    {
      key: 'invoices' as const,
      label: `Invoices${relatedInvoices.length > 0 ? ` (${relatedInvoices.length})` : ''}`,
      icon: DollarSign,
    },
    ...(hasViewTimelinePermission ? [{ key: 'history', label: 'History', icon: History }] : []),
  ] as { key: typeof activeTab; label: string; icon: any }[];

  return (
    <ClientLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <Link href="/client-portal/work-orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground truncate">{workOrder.title}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${getStatusColor(workOrder.status)}`}>
                {workOrder.status.replace(/_/g, ' ').toUpperCase()}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${getPriorityColor(workOrder.priority)}`}>
                {workOrder.priority.toUpperCase()}
              </span>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              {workOrder.workOrderNumber && <>#{workOrder.workOrderNumber} &nbsp;·&nbsp;</>}
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 inline" /> {workOrder.locationName}
              </span>
              {workOrder.createdAt?.toDate && (
                <> &nbsp;·&nbsp; <Calendar className="h-3 w-3 inline" /> {workOrder.createdAt.toDate().toLocaleDateString()}</>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            {hasApproveRejectPermission && workOrder.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleApproveWorkOrder}
                  loading={processing} disabled={processing}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 border-red-600 hover:border-red-700"
                  onClick={handleRejectWorkOrder}
                  loading={processing} disabled={processing}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </>
            )}
            {hasShareForBiddingPermission && workOrder.status === 'approved' && (
              <Button size="sm" variant="outline" onClick={handleShareForBidding}>
                <Share2 className="h-4 w-4 mr-2" />
                Share for Bidding
              </Button>
            )}
            {hasArchivePermission && workOrder.status !== 'archived' && (
              <Button
                size="sm"
                variant="outline"
                className="text-gray-600 hover:text-gray-800 border-gray-300 hover:bg-gray-50"
                onClick={handleArchiveWorkOrder}
                loading={archiving} disabled={archiving}
              >
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </Button>
            )}
            {workOrder.status === 'archived' && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Archive className="h-4 w-4" />
                Archived
              </span>
            )}
            {(workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor') && workOrder.assignedSubcontractor && (
              <Link href={`/client-portal/messages?workOrderId=${workOrder.id}`}>
                <Button size="sm" variant="outline">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Message Group
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Status Pipeline */}
        {currentStepIdx >= 0 && (
          <div className="bg-card border rounded-xl p-4 overflow-x-auto">
            <div className="flex items-center min-w-max gap-0">
              {STATUS_PIPELINE.map((step, idx) => {
                const isDone = idx < currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                return (
                  <div key={step.key} className="flex items-center">
                    <div className={`flex flex-col items-center px-3 ${isCurrent ? 'opacity-100' : isDone ? 'opacity-80' : 'opacity-40'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                        isCurrent ? 'bg-primary border-primary text-primary-foreground' :
                        isDone ? 'bg-green-500 border-green-500 text-white' :
                        'bg-muted border-muted-foreground/30 text-muted-foreground'
                      }`}>
                        {isDone ? <CheckCircle className="h-4 w-4" /> : idx + 1}
                      </div>
                      <span className={`text-xs mt-1 text-center whitespace-nowrap ${isCurrent ? 'font-semibold text-primary' : isDone ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < STATUS_PIPELINE.length - 1 && (
                      <div className={`h-0.5 w-8 ${idx < currentStepIdx ? 'bg-green-500' : 'bg-muted'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader><CardTitle>Work Order Details</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-muted-foreground text-sm mb-1">Description</h3>
                      <p className="text-foreground">{workOrder.description}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="font-semibold text-muted-foreground text-sm mb-1">Category</h3>
                        <p className="text-foreground">{workOrder.category}</p>
                      </div>
                      <div>
                        <h3 className="font-semibold text-muted-foreground text-sm mb-1">Estimate Budget</h3>
                        {workOrder.estimateBudget
                          ? <p className="text-foreground font-semibold">${workOrder.estimateBudget.toLocaleString()}</p>
                          : <p className="text-muted-foreground text-sm">Not set</p>
                        }
                      </div>
                    </div>
                    {(workOrder.scheduledServiceDate || workOrder.scheduledServiceTime) && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-semibold text-muted-foreground text-sm mb-1">Scheduled Date</h3>
                          {workOrder.scheduledServiceDate
                            ? <p className="text-foreground flex items-center gap-1"><Calendar className="h-4 w-4 text-muted-foreground" />{workOrder.scheduledServiceDate?.toDate?.().toLocaleDateString() || 'N/A'}</p>
                            : <p className="text-muted-foreground text-sm">Not scheduled</p>
                          }
                        </div>
                        <div>
                          <h3 className="font-semibold text-muted-foreground text-sm mb-1">Scheduled Time</h3>
                          {workOrder.scheduledServiceTime
                            ? <p className="text-foreground flex items-center gap-1"><Clock className="h-4 w-4 text-muted-foreground" />{workOrder.scheduledServiceTime}</p>
                            : <p className="text-muted-foreground text-sm">Not set</p>
                          }
                        </div>
                      </div>
                    )}
                    {workOrder.rejectionReason && (
                      <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                        <h3 className="font-semibold text-destructive mb-2 flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" /> Rejection Reason
                        </h3>
                        <p className="text-destructive/80 text-sm">{workOrder.rejectionReason}</p>
                      </div>
                    )}
                    {workOrder.status === 'completed' && workOrder.completionDetails && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <h3 className="font-semibold text-green-800 mb-2 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" /> Completion Details
                        </h3>
                        <p className="text-green-700 text-sm whitespace-pre-wrap">{workOrder.completionDetails}</p>
                        {workOrder.completionNotes && (
                          <div className="mt-3 pt-3 border-t border-green-300">
                            <p className="text-xs font-semibold text-green-800 mb-1">Follow-up Notes</p>
                            <p className="text-green-700 text-sm whitespace-pre-wrap">{workOrder.completionNotes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Approved Quote Pricing */}
                {workOrder.approvedQuoteAmount && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-green-600" />
                        Approved Quote
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-lg font-semibold text-foreground">Total Amount</span>
                          <span className="text-3xl font-bold text-green-600">
                            ${workOrder.approvedQuoteAmount.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {workOrder.assignedSubcontractorName && (
                        <div className="text-sm text-muted-foreground pt-3 border-t">
                          <span className="font-semibold">Contractor:</span> {workOrder.assignedSubcontractorName}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Location</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div><p className="text-muted-foreground">Location Name</p><p className="font-semibold">{workOrder.locationName}</p></div>
                    <div><p className="text-muted-foreground">Address</p><p className="font-semibold">{formatAddress(workOrder.locationAddress)}</p></div>
                  </CardContent>
                </Card>

                {workOrder.assignedToName && (
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5" />Assigned To</CardTitle></CardHeader>
                    <CardContent className="text-sm">
                      <p className="font-semibold">{workOrder.assignedToName}</p>
                      {workOrder.assignedAt && <p className="text-muted-foreground text-xs mt-1">Assigned {workOrder.assignedAt?.toDate?.().toLocaleDateString()}</p>}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* ATTACHMENTS TAB */}
          {activeTab === 'attachments' && (
            <div className="space-y-6">
              {workOrder.images && workOrder.images.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />Work Order Images ({workOrder.images.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {workOrder.images.map((image, idx) => (
                        <img key={idx} src={image} alt={`Image ${idx + 1}`}
                          className="w-full h-40 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity border"
                          onClick={() => { setLightboxImages(workOrder.images || []); setLightboxIndex(idx); }} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {workOrder.completionImages && workOrder.completionImages.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-600" />Completion Images ({workOrder.completionImages.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {workOrder.completionImages.map((image, idx) => (
                        <img key={idx} src={image} alt={`Completion ${idx + 1}`}
                          className="w-full h-40 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity border"
                          onClick={() => { setLightboxImages(workOrder.completionImages || []); setLightboxIndex(idx); }} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {totalImages === 0 && (
                <div className="text-center py-16">
                  <Paperclip className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No attachments uploaded.</p>
                </div>
              )}
            </div>
          )}

          {/* QUOTES TAB */}
          {activeTab === 'quotes' && (
            <div className="max-w-3xl">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Quotes ({quotes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {quotes.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No quotes received yet</p>
                  ) : (
                    <div className="space-y-3">
                      {quotes.length >= 2 && (
                        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                          <p className="text-sm text-primary">Select 2 or more quotes to compare them side-by-side</p>
                        </div>
                      )}
                      {quotes.map((quote) => (
                        <div key={quote.id} className={`p-4 border rounded-lg hover:bg-muted/30 transition-colors ${selectedQuoteIds.includes(quote.id) ? 'bg-primary/5 border-primary/30' : ''}`}>
                          <div className="flex items-start gap-3">
                            {quotes.length >= 2 && (
                              <Checkbox
                                checked={selectedQuoteIds.includes(quote.id)}
                                onCheckedChange={(checked) => handleQuoteSelection(quote.id, checked === true)}
                                className="mt-1"
                              />
                            )}
                            <div className="flex-1 flex justify-between items-start">
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  {quote.sentToClientAt?.toDate?.().toLocaleDateString() || quote.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                                </p>
                                {quote.notes && <p className="text-sm text-muted-foreground mt-1">{quote.notes}</p>}
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold text-primary">
                                  ${(quote.clientAmount || quote.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                                <p className="text-xs text-muted-foreground capitalize">{quote.status.replace(/_/g, ' ')}</p>
                                <Link href={`/client-portal/quotes/${quote.id}`} className="text-xs text-primary underline mt-1 inline-block">View Details</Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {quotes.length >= 2 && selectedQuoteIds.length >= 2 && (
                        <Button onClick={handleCompareQuotes} className="w-full">
                          <GitCompare className="h-4 w-4 mr-2" />
                          Compare {selectedQuoteIds.length} Quotes
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* INVOICES TAB */}
          {activeTab === 'invoices' && (
            <div className="max-w-3xl">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Related Invoices ({relatedInvoices.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {relatedInvoices.length === 0 ? (
                    <div className="text-center py-8">
                      <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No invoices yet for this work order.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {relatedInvoices.map((inv) => (
                        <div key={inv.id} className="p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-sm">
                                Invoice #{inv.invoiceNumber || inv.id.slice(0, 8)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {inv.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-primary">
                                ${(inv.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </p>
                              <span
                                className={`text-xs capitalize px-2 py-0.5 rounded-full ${
                                  inv.status === 'paid'
                                    ? 'bg-green-100 text-green-700'
                                    : inv.status === 'overdue'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-yellow-100 text-yellow-700'
                                }`}
                              >
                                {inv.status || 'draft'}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/client-portal/invoices/${inv.id}`}>View Invoice</Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                      {relatedInvoices.length > 1 && (
                        <Link href={`/client-portal/invoices?workOrderId=${workOrder.id}`}>
                          <Button variant="outline" className="w-full mt-2">
                            View all invoices
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && hasViewTimelinePermission && (
            <div className="max-w-3xl">
              <WorkOrderSystemInfo
                timeline={buildTimeline(workOrder)}
                systemInformation={workOrder.systemInformation}
                viewerRole="client"
                creationSourceLabel={getCreatedDetails(workOrder)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Compare Quotes Dialog */}
      <CompareQuotesDialog
        quotes={selectedQuotes}
        isOpen={showCompareDialog}
        onClose={() => setShowCompareDialog(false)}
        viewMode="client"
      />

      {/* Share for Bidding Modal */}
      {showBiddingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-card z-10 rounded-t-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Share for Bidding</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Select subcontractors to share this work order with</p>
                </div>
                <button onClick={() => { setShowBiddingModal(false); setSelectedSubcontractors([]); }} className="p-2 hover:bg-muted rounded-lg transition-colors">
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-1">{workOrder.title}</h3>
                {workOrder.workOrderNumber && <p className="text-sm text-blue-700">{workOrder.workOrderNumber}</p>}
              </div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="selectAll"
                    checked={selectedSubcontractors.length === subcontractors.length && subcontractors.length > 0}
                    onChange={selectAllSubcontractors}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="selectAll" className="text-sm font-medium text-foreground">Select All ({subcontractors.length})</label>
                </div>
                <div className="text-sm text-muted-foreground">{selectedSubcontractors.length} selected</div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto border border-border rounded-xl p-4">
                {subcontractors.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No approved subcontractors found</p>
                ) : (
                  subcontractors.map(sub => (
                    <div
                      key={sub.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedSubcontractors.includes(sub.id)
                          ? sub.matchesCategory ? 'bg-green-50 border-green-400 ring-2 ring-green-200' : 'bg-blue-50 border-blue-300'
                          : sub.matchesCategory ? 'bg-green-50 border-green-300 hover:border-green-400' : 'bg-white border-border hover:bg-muted'
                      }`}
                      onClick={() => toggleSubcontractorSelection(sub.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSubcontractors.includes(sub.id)}
                        onChange={() => toggleSubcontractorSelection(sub.id)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{sub.fullName}</p>
                          {sub.matchesCategory && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">Matches Category</span>
                          )}
                        </div>
                        {sub.businessName && <p className="text-sm text-muted-foreground">{sub.businessName}</p>}
                        <p className="text-sm text-muted-foreground">{sub.email}</p>
                        {(sub.city || sub.state) && (
                          <p className="text-sm text-muted-foreground">{[sub.city, sub.state].filter(Boolean).join(', ')}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t mt-6">
                <Button variant="outline" onClick={() => { setShowBiddingModal(false); setSelectedSubcontractors([]); }} disabled={submitting} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleSubmitBidding} disabled={submitting || selectedSubcontractors.length === 0} className="flex-1">
                  {submitting ? 'Sharing...' : `Share with ${selectedSubcontractors.length} Subcontractor${selectedSubcontractors.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}
    </ClientLayout>
  );
}
