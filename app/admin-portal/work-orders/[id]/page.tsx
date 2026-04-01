'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, Timestamp, arrayUnion } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, MapPin, Calendar, User, FileText, Image as ImageIcon, DollarSign, MessageSquare, CheckCircle, GitCompare, Edit2, Clock, History, Paperclip, StickyNote, Receipt, ChevronRight, AlertCircle, Plus, Send, Share2, X, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatAddress } from '@/lib/utils';
import CompareQuotesDialog from '@/components/compare-quotes-dialog';
import WorkOrderSystemInfo from '@/components/work-order-system-info';
import { getWorkOrderClientDisplayName } from '@/lib/appy-client';
import { notifyBiddingOpportunity, notifyQuoteSubmission } from '@/lib/notifications';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';
import { subcontractorAuthId } from '@/lib/subcontractor-ids';
import { toast } from 'sonner';

const WORK_ORDER_EDIT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'bidding', label: 'Bidding' },
  { value: 'quotes_received', label: 'Quotes Received' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'accepted_by_subcontractor', label: 'Accepted by Sub' },
  { value: 'pending_invoice', label: 'Pending Invoice' },
  { value: 'completed', label: 'Completed' },
];

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  appyRequestor?: string; // APPY Requestor field - stores the requestor from maintenance API requests
  locationId: string;
  locationName?: string;
  locationAddress?: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  estimateBudget?: number;
  status: string;
  images: string[];
  assignedTo?: string;
  assignedToName?: string;
  assignedSubcontractor?: string;
  assignedSubcontractorName?: string;
  createdAt: any;
  approvedAt?: any;
  completedAt?: any;
  rejectionReason?: string;
  completionDetails?: string;
  completionNotes?: string;
  completionImages?: string[];
  scheduledServiceDate?: any;
  scheduledServiceTime?: string;
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
  importFileName?: string;
  assignedAt?: any;
  rejectedAt?: any;
  scheduleSharedWithClient?: boolean;
  scheduleSharedAt?: any;
  ratingCompleteToSpecs?: boolean;
  ratedAt?: any;
  ratedBy?: string;
}

interface Subcontractor {
  id: string;
  uid?: string;
  fullName: string;
  email: string;
  businessName?: string;
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
}

export default function ViewWorkOrder() {
  const params = useParams();
  const id = params?.id as string;

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'history' | 'attachments' | 'quotes' | 'invoices'>('overview');
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [relatedInvoices, setRelatedInvoices] = useState<any[]>([]);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [showBiddingModal, setShowBiddingModal] = useState(false);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedSubcontractors, setSelectedSubcontractors] = useState<string[]>([]);
  const [biddingSubmitting, setBiddingSubmitting] = useState(false);

  // Manual assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignSubcontractors, setAssignSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedAssignSubId, setSelectedAssignSubId] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignFromQuote, setAssignFromQuote] = useState<Quote | null>(null);

  // One-click invoice creation
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  // Share quote with client modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareQuote, setShareQuote] = useState<Quote | null>(null);
  const [shareMarkup, setShareMarkup] = useState('20');
  const [shareSubmitting, setShareSubmitting] = useState(false);

  // Inline edit mode
  const [editMode, setEditMode] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '', description: '', category: '', priority: 'medium', status: 'pending',
    estimateBudget: '', clientId: '', locationId: '', scheduledServiceDate: '', scheduledServiceTime: '',
  });
  const [editClients, setEditClients] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [editLocations, setEditLocations] = useState<{ id: string; locationName: string; clientId?: string; companyId?: string }[]>([]);
  const [editCategories, setEditCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchWorkOrder = async () => {
      if (!id) return;

      try {
        const woDoc = await getDoc(doc(db, 'workOrders', id));
        if (woDoc.exists()) {
          setWorkOrder({ id: woDoc.id, ...woDoc.data() } as WorkOrder);

          // Fetch related quotes, invoices, and notes in parallel
          const [quotesSnapshot, invoicesSnapshot, notesSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'quotes'), where('workOrderId', '==', id))),
            getDocs(query(collection(db, 'invoices'), where('workOrderId', '==', id))),
            getDocs(query(collection(db, 'workOrderNotes'), where('workOrderId', '==', id))),
          ]);
          const quotesData = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Quote[];
          setQuotes(quotesData);
          const invoicesData = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setRelatedInvoices(invoicesData);
          const notesData = invoicesSnapshot.docs.length >= 0
            ? notesSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
            : [];
          setNotes(notesData);
        }
      } catch (error) {
        console.error('Error fetching work order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkOrder();
  }, [id]);

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

  // Helper: get creation details for every type of work order so Timeline always shows how the WO was created
  const getCreatedDetails = (wo: WorkOrder, existingCreatedEvent?: { details?: string; metadata?: Record<string, unknown> }) => {
    let createdDetails = 'Work order created';
    const metadata: Record<string, any> = {};
    const creatorName = wo.systemInformation?.createdBy?.name;

    if (wo.createdViaAPI || wo.isMaintenanceRequestOrder) {
      const parts = ['Work order created from Maintenance Request'];
      if (wo.maintRequestNumber) parts.push(` (${wo.maintRequestNumber})`);
      if (wo.appyRequestor) parts.push(` — Requestor: ${wo.appyRequestor}`);
      createdDetails = parts.join('');
      metadata.source = 'maintenance_request_api';
      if (wo.maintRequestNumber) metadata.maintRequestNumber = wo.maintRequestNumber;
      if (wo.appyRequestor) metadata.requestor = wo.appyRequestor;
    } else if (wo.isFromRecurringWorkOrder) {
      createdDetails = `Work order created from Recurring Work Order${wo.recurringWorkOrderNumber ? ` (${wo.recurringWorkOrderNumber})` : ''}`;
      metadata.source = 'recurring_work_order';
    } else if (wo.importedFromCSV) {
      createdDetails = `Work order created via CSV import${wo.importFileName ? ` (${wo.importFileName})` : ''}`;
      metadata.source = 'csv_import';
    } else if (wo.systemInformation?.createdBy?.role === 'client') {
      createdDetails = creatorName
        ? `Work order created by ${creatorName} via Client Portal`
        : 'Work order created via Client Portal';
      metadata.source = 'client_portal_ui';
    } else if (wo.systemInformation?.createdBy?.role === 'admin') {
      createdDetails = creatorName
        ? `Work order created by ${creatorName} via Admin Portal`
        : 'Work order created via Admin Portal';
      metadata.source = 'admin_portal_ui';
    } else if (wo.systemInformation?.createdBy?.role === 'system') {
      createdDetails = creatorName
        ? `Work order created by ${creatorName} (system)`
        : 'Work order created by system';
      metadata.source = 'system';
    } else if (existingCreatedEvent?.metadata?.source === 'client_portal_ui') {
      createdDetails = existingCreatedEvent.details?.trim() || `Work order created via Client Portal`;
      if (existingCreatedEvent.metadata) Object.assign(metadata, existingCreatedEvent.metadata);
    } else if (existingCreatedEvent?.metadata?.source === 'admin_portal_ui') {
      createdDetails = existingCreatedEvent.details?.trim() || `Work order created via Admin Portal`;
      if (existingCreatedEvent.metadata) Object.assign(metadata, existingCreatedEvent.metadata);
    } else if (existingCreatedEvent?.details && existingCreatedEvent.details.trim() !== '') {
      createdDetails = existingCreatedEvent.details;
      if (existingCreatedEvent.metadata) Object.assign(metadata, existingCreatedEvent.metadata);
    } else {
      createdDetails = 'Work order created via portal';
      metadata.source = 'portal_ui';
    }
    return { createdDetails, metadata };
  };

  // Build a complete timeline: use stored timeline events if available,
  // otherwise synthesize from work order fields. Always ensure a "created" event with full creation details is present.
  const buildTimeline = (wo: WorkOrder) => {
    const toDate = (val: any) => {
      if (!val) return null;
      if (val.toDate) return val.toDate();
      if (val instanceof Date) return val;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };
    const existingCreated = wo.timeline?.find((e: any) => e && String(e.type) === 'created');
    const { createdDetails, metadata: createdMetadata } = getCreatedDetails(wo, existingCreated);

    const createdEvent = {
      id: 'created',
      timestamp: wo.createdAt ?? null,
      type: 'created',
      userId: wo.createdBy || 'unknown',
      userName: wo.systemInformation?.createdBy?.name ?? (wo.createdViaAPI ? 'Automated System' : 'Unknown'),
      userRole: (wo.createdViaAPI ? 'system' : 'admin') as 'admin' | 'system',
      details: createdDetails,
      metadata: createdMetadata,
    };

    if (wo.timeline && wo.timeline.length > 0) {
      let hasCreated = false;
      const enriched = wo.timeline.map((event: any) => {
        if (event && String(event.type) === 'created') {
          hasCreated = true;
          return { ...event, details: createdDetails, metadata: { ...(event.metadata || {}), ...createdMetadata } };
        }
        return event;
      });
      if (!hasCreated) return [createdEvent, ...enriched];
      return enriched;
    }

    // Synthesize timeline from existing fields; always include created event first
    const events: any[] = [createdEvent];

    if (wo.approvedAt) {
      events.push({
        id: 'approved',
        timestamp: wo.approvedAt,
        type: 'approved',
        userId: wo.approvedBy || 'unknown',
        userName: wo.systemInformation?.approvedBy?.name || 'Unknown',
        userRole: 'admin',
        details: 'Work order approved',
      });
    }

    if (wo.rejectedAt) {
      events.push({
        id: 'rejected',
        timestamp: wo.rejectedAt,
        type: 'rejected',
        userId: 'unknown',
        userName: wo.systemInformation?.rejectedBy?.name || 'Unknown',
        userRole: 'admin',
        details: `Work order rejected${wo.rejectionReason ? `. Reason: ${wo.rejectionReason}` : ''}`,
      });
    }

    if (wo.assignedAt && (wo.assignedToName || wo.assignedSubcontractorName)) {
      events.push({
        id: 'assigned',
        timestamp: wo.assignedAt,
        type: 'assigned',
        userId: 'unknown',
        userName: wo.systemInformation?.assignment?.assignedBy?.name || 'Admin',
        userRole: 'admin',
        details: `Assigned to ${wo.assignedToName || wo.assignedSubcontractorName}`,
      });
    }

    if (wo.scheduledServiceDate && wo.scheduledServiceTime) {
      events.push({
        id: 'schedule_set',
        timestamp: wo.scheduledServiceDate,
        type: 'schedule_set',
        userId: 'unknown',
        userName: wo.assignedToName || wo.assignedSubcontractorName || 'Subcontractor',
        userRole: 'subcontractor',
        details: `Service scheduled for ${toDate(wo.scheduledServiceDate)?.toLocaleDateString() || 'N/A'} at ${wo.scheduledServiceTime}`,
      });
    }

    if (wo.scheduleSharedAt) {
      events.push({
        id: 'schedule_shared',
        timestamp: wo.scheduleSharedAt,
        type: 'schedule_shared',
        userId: 'unknown',
        userName: 'Admin',
        userRole: 'admin',
        details: 'Service schedule shared with client',
      });
    }

    if (wo.completedAt) {
      events.push({
        id: 'completed',
        timestamp: wo.completedAt,
        type: 'completed',
        userId: 'unknown',
        userName: wo.assignedToName || wo.assignedSubcontractorName || 'Subcontractor',
        userRole: 'subcontractor',
        details: 'Work order completed',
      });
    }

    return events;
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

  const handleAddNote = async () => {
    if (!newNote.trim() || !workOrder) return;
    setAddingNote(true);
    try {
      const noteRef = await addDoc(collection(db, 'workOrderNotes'), {
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.workOrderNumber,
        text: newNote.trim(),
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.email ?? 'Admin',
        type: 'user',
      });
      setNotes(prev => [{
        id: noteRef.id,
        workOrderId: workOrder.id,
        text: newNote.trim(),
        createdAt: { toMillis: () => Date.now(), toDate: () => new Date() },
        createdBy: auth.currentUser?.email ?? 'Admin',
        type: 'user',
      }, ...prev]);
      setNewNote('');
      toast.success('Note added');
    } catch (err) {
      toast.error('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const enterEditMode = async () => {
    if (!workOrder) return;
    setEditForm({
      title: workOrder.title || '',
      description: workOrder.description || '',
      category: workOrder.category || '',
      priority: workOrder.priority || 'medium',
      status: workOrder.status || 'pending',
      estimateBudget: workOrder.estimateBudget != null ? String(workOrder.estimateBudget) : '',
      clientId: workOrder.clientId || '',
      locationId: workOrder.locationId || '',
      scheduledServiceDate: workOrder.scheduledServiceDate?.toDate
        ? workOrder.scheduledServiceDate.toDate().toISOString().split('T')[0]
        : '',
      scheduledServiceTime: workOrder.scheduledServiceTime || '',
    });
    const [clientsSnap, locationsSnap, categoriesSnap] = await Promise.all([
      getDocs(collection(db, 'clients')),
      getDocs(collection(db, 'locations')),
      getDocs(collection(db, 'categories')),
    ]);
    setEditClients(clientsSnap.docs.map(d => ({ id: d.id, fullName: d.data().fullName, email: d.data().email })));
    setEditLocations(locationsSnap.docs.map(d => ({ id: d.id, locationName: d.data().locationName, clientId: d.data().clientId, companyId: d.data().companyId })));
    setEditCategories(categoriesSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
    setEditMode(true);
    setActiveTab('overview');
  };

  const handleSaveEdit = async () => {
    if (!workOrder) return;
    setEditSaving(true);
    try {
      const selectedClient = editClients.find(c => c.id === editForm.clientId);
      const selectedLocation = editLocations.find(l => l.id === editForm.locationId);
      const updates: any = {
        title: editForm.title,
        description: editForm.description,
        category: editForm.category,
        priority: editForm.priority,
        status: editForm.status,
        estimateBudget: editForm.estimateBudget ? parseFloat(editForm.estimateBudget) : null,
        updatedAt: serverTimestamp(),
      };
      if (selectedClient) {
        updates.clientId = selectedClient.id;
        updates.clientName = selectedClient.fullName;
        updates.clientEmail = selectedClient.email;
      }
      if (selectedLocation) {
        updates.locationId = selectedLocation.id;
        updates.locationName = selectedLocation.locationName;
      }
      if (editForm.scheduledServiceDate) {
        updates.scheduledServiceDate = new Date(editForm.scheduledServiceDate);
      }
      if (editForm.scheduledServiceTime) {
        updates.scheduledServiceTime = editForm.scheduledServiceTime;
      }
      await updateDoc(doc(db, 'workOrders', workOrder.id), updates);
      setWorkOrder(prev => prev ? {
        ...prev, ...updates,
        scheduledServiceDate: editForm.scheduledServiceDate ? { toDate: () => new Date(editForm.scheduledServiceDate) } : prev.scheduledServiceDate,
      } : prev);
      toast.success('Work order updated successfully');
      setEditMode(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  };

  const handleShareForBidding = async () => {
    if (!workOrder) return;
    try {
      const subsSnapshot = await getDocs(query(collection(db, 'subcontractors'), where('status', '==', 'approved')));
      if (subsSnapshot.empty) { toast.error('No approved subcontractors found'); return; }

      const allSubs = subsSnapshot.docs.map(d => ({
        id: d.id,
        uid: d.data().uid,
        fullName: d.data().fullName,
        email: d.data().email,
        businessName: d.data().businessName,
        skills: d.data().skills || [],
      }));

      let matchingCount = 0;
      const subsData: Subcontractor[] = allSubs.map(sub => {
        let matchesCategory = false;
        if (workOrder.category && sub.skills.length > 0) {
          const cat = workOrder.category.toLowerCase();
          matchesCategory = sub.skills.some((s: string) => s.toLowerCase().includes(cat) || cat.includes(s.toLowerCase()));
        }
        if (matchesCategory) matchingCount++;
        return { id: sub.id, uid: sub.uid, fullName: sub.fullName, email: sub.email, businessName: sub.businessName, matchesCategory };
      });

      if (workOrder.category) {
        if (matchingCount === 0) toast.warning(`No subcontractors match "${workOrder.category}". Showing all ${subsData.length}.`);
        else toast.success(`${matchingCount} subcontractor(s) match "${workOrder.category}".`);
      }

      setSubcontractors(subsData);
      setSelectedSubcontractors([]);
      setShowBiddingModal(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load subcontractors');
    }
  };

  const handleSubmitBidding = async () => {
    if (!workOrder || selectedSubcontractors.length === 0) {
      toast.error('Please select at least one subcontractor');
      return;
    }
    setBiddingSubmitting(true);
    try {
      const workOrderNumber = workOrder.workOrderNumber || `WO-${Date.now().toString().slice(-8)}`;

      const subAuthIds = selectedSubcontractors.map((subId) => {
        const sub = subcontractors.find((s) => s.id === subId);
        return sub ? subcontractorAuthId(sub) : subId;
      });

      await Promise.all(selectedSubcontractors.map(async subId => {
        const sub = subcontractors.find(s => s.id === subId);
        if (!sub) return;
        const authId = subcontractorAuthId(sub);
        await addDoc(collection(db, 'biddingWorkOrders'), {
          workOrderId: workOrder.id, workOrderNumber,
          subcontractorId: authId, subcontractorName: sub.fullName, subcontractorEmail: sub.email,
          workOrderTitle: workOrder.title, workOrderDescription: workOrder.description,
          clientId: workOrder.clientId, clientName: workOrder.clientName,
          priority: workOrder.priority || '',
          category: workOrder.category || '',
          locationName: workOrder.locationName || '',
          locationAddress: workOrder.locationAddress || '',
          images: workOrder.images || [],
          status: 'pending', sharedAt: serverTimestamp(), createdAt: serverTimestamp(),
        });
      }));

      // Allow subcontractors to read the workOrder via Firestore rules
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        biddingSubcontractors: arrayUnion(...subAuthIds),
        updatedAt: serverTimestamp(),
      });

      await notifyBiddingOpportunity(subAuthIds, workOrder.id, workOrderNumber, workOrder.title);

      await Promise.all(selectedSubcontractors.map(async (subId) => {
        const sub = subcontractors.find(s => s.id === subId);
        if (sub?.email) {
          await fetch('/api/email/send-bidding-opportunity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toEmail: sub.email, toName: sub.fullName,
              workOrderNumber, workOrderTitle: workOrder.title,
              workOrderDescription: workOrder.description,
              locationName: workOrder.locationName, category: workOrder.category,
              priority: workOrder.priority,
              portalLink: `${window.location.origin}/subcontractor-portal/bidding`,
            }),
          }).catch(console.error);
        }
      }));

      const currentUser = auth.currentUser;
      const adminDoc = currentUser ? await getDoc(doc(db, 'adminUsers', currentUser.uid)) : null;
      const adminName = adminDoc?.exists() ? adminDoc.data().fullName : 'Admin';
      const woDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const woData = woDoc.data();
      const selectedSubNames = selectedSubcontractors.map(id => subcontractors.find(s => s.id === id)?.fullName || 'Unknown').join(', ');

      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'bidding', workOrderNumber,
        sharedForBiddingAt: serverTimestamp(), updatedAt: serverTimestamp(),
        timeline: [...(woData?.timeline || []), {
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Timestamp.now(), type: 'shared_for_bidding',
          userId: currentUser?.uid || 'unknown', userName: adminName, userRole: 'admin',
          details: `Shared for bidding with ${selectedSubcontractors.length} subcontractor(s): ${selectedSubNames}`,
          metadata: { subcontractorIds: selectedSubcontractors, subcontractorCount: selectedSubcontractors.length },
        }],
        systemInformation: {
          ...(woData?.systemInformation || {}),
          sharedForBidding: {
            by: { id: currentUser?.uid || 'unknown', name: adminName },
            timestamp: Timestamp.now(),
            subcontractors: selectedSubcontractors.map(id => ({ id, name: subcontractors.find(s => s.id === id)?.fullName || 'Unknown' })),
          },
        },
      });

      setWorkOrder(prev => prev ? { ...prev, status: 'bidding' } : prev);
      toast.success(`Shared with ${selectedSubcontractors.length} subcontractor(s) for bidding`);
      setShowBiddingModal(false);
      setSelectedSubcontractors([]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to share work order for bidding');
    } finally {
      setBiddingSubmitting(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!workOrder) return;
    setCreatingInvoice(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { toast.error('You must be logged in'); return; }

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const createdByName = adminDoc.exists() ? (adminDoc.data()?.fullName ?? 'Admin') : 'Admin';

      // Find the approved quote — prefer approvedQuoteId stored on work order
      let approvedQuote: Quote | null = null;
      const woData = (await getDoc(doc(db, 'workOrders', workOrder.id))).data();
      const approvedQuoteId = woData?.approvedQuoteId;

      if (approvedQuoteId) {
        const qDoc = await getDoc(doc(db, 'quotes', approvedQuoteId));
        if (qDoc.exists()) approvedQuote = { id: qDoc.id, ...qDoc.data() } as Quote;
      }

      // Fall back: find first accepted quote for this work order
      if (!approvedQuote) {
        approvedQuote = quotes.find(q => q.status === 'accepted') || quotes[0] || null;
      }

      // Build line items from quote or a single line item from work order amount
      let lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }> = [];
      let totalAmount = 0;

      if (approvedQuote) {
        const clientAmount = approvedQuote.clientAmount || approvedQuote.totalAmount || 0;
        if (approvedQuote.lineItems && approvedQuote.lineItems.length > 0) {
          // Scale line items proportionally to client amount
          const scale = approvedQuote.totalAmount > 0 ? clientAmount / approvedQuote.totalAmount : 1;
          lineItems = approvedQuote.lineItems.map(li => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: parseFloat((li.unitPrice * scale).toFixed(2)),
            amount: parseFloat((li.amount * scale).toFixed(2)),
          }));
        } else {
          lineItems = [{ description: workOrder.title, quantity: 1, unitPrice: clientAmount, amount: clientAmount }];
        }
        totalAmount = lineItems.reduce((s, li) => s + li.amount, 0);
      } else {
        // No quote — use budget or 0
        const amt = woData?.approvedQuoteAmount || workOrder.estimateBudget || 0;
        lineItems = [{ description: workOrder.title, quantity: 1, unitPrice: amt, amount: amt }];
        totalAmount = amt;
      }

      // Due date: 30 days from now
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const invoiceNumber = `INV-${Date.now().toString().slice(-8).toUpperCase()}`;

      const invoiceRef = await addDoc(collection(db, 'invoices'), {
        invoiceNumber,
        clientId: workOrder.clientId,
        clientName: workOrder.clientName,
        clientEmail: workOrder.clientEmail,
        workOrderId: workOrder.id,
        workOrderTitle: workOrder.title,
        workOrderDescription: workOrder.description || '',
        category: workOrder.category || '',
        priority: workOrder.priority || '',
        status: 'sent',
        totalAmount,
        lineItems,
        dueDate,
        notes: '',
        terms: 'Payment due within 30 days of invoice date.',
        createdBy: currentUser.uid,
        createdByName,
        creationSource: 'work_order_quick_create',
        systemInformation: {
          createdBy: { id: currentUser.uid, name: createdByName, role: 'admin', timestamp: new Date() },
        },
        timeline: [{
          id: `created_${Date.now()}`,
          timestamp: new Date(),
          type: 'created',
          userId: currentUser.uid,
          userName: createdByName,
          userRole: 'admin',
          details: `Invoice created from work order by ${createdByName}`,
          metadata: { source: 'work_order_quick_create', invoiceNumber },
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Try auto-charge for Fixed Auto-Charge Plan clients
      let autoCharged = false;
      if (totalAmount > 0) {
        try {
          const clientDoc = await getDoc(doc(db, 'clients', workOrder.clientId));
          if (clientDoc.exists()) {
            const cd = clientDoc.data();
            const hasFixedPlan = cd.stripeSubscriptionId && cd.subscriptionStatus === 'active';
            const planAmount = Number(cd.subscriptionAmount);
            const amountsMatch = Number.isFinite(planAmount) && planAmount > 0 && Math.abs(totalAmount - planAmount) < 0.01;
            if (hasFixedPlan && amountsMatch && cd.defaultPaymentMethodId) {
              const chargeRes = await fetch('/api/stripe/charge-saved-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceId: invoiceRef.id, clientId: workOrder.clientId }),
              });
              const chargeData = await chargeRes.json();
              if (chargeRes.ok && chargeData.status === 'succeeded') {
                autoCharged = true;
              }
            }
          }
        } catch { /* non-fatal */ }
      }

      // Generate Stripe payment link
      let stripePaymentLink: string | null = null;
      if (!autoCharged && totalAmount > 0) {
        try {
          const res = await fetch('/api/stripe/create-payment-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              invoiceId: invoiceRef.id,
              invoiceNumber,
              amount: totalAmount,
              customerEmail: workOrder.clientEmail,
              clientName: workOrder.clientName,
              clientId: workOrder.clientId,
            }),
          });
          const data = await res.json();
          if (res.ok && data.paymentLink) {
            stripePaymentLink = data.paymentLink;
            await updateDoc(doc(db, 'invoices', invoiceRef.id), {
              stripePaymentLink: data.paymentLink,
              stripeSessionId: data.sessionId,
            });
          }
        } catch { /* non-fatal */ }
      }

      // Send invoice email to client
      try {
        await fetch('/api/email/send-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: workOrder.clientEmail,
            toName: workOrder.clientName,
            invoiceNumber,
            workOrderTitle: workOrder.title,
            totalAmount,
            dueDate: dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            lineItems,
            stripePaymentLink,
          }),
        });
      } catch (emailErr) {
        console.error('Invoice email failed (non-fatal):', emailErr);
      }

      // Update work order status to completed
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      });

      toast.success(`Invoice ${invoiceNumber} created and emailed to ${workOrder.clientEmail}`);

      // Navigate to the new invoice
      window.location.href = `/admin-portal/invoices/${invoiceRef.id}`;
    } catch (err: any) {
      console.error('Error creating invoice:', err);
      toast.error(err.message || 'Failed to create invoice');
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handleShareWithClient = async () => {
    if (!shareQuote || !workOrder) return;
    const markup = parseFloat(shareMarkup) || 0;
    setShareSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data()?.fullName : 'Admin';
      const clientAmount = shareQuote.totalAmount * (1 + markup / 100);
      const isResend = shareQuote.status === 'sent_to_client';
      const existingQuoteTimeline = (shareQuote as any).timeline || [];
      const sentEvent = createQuoteTimelineEvent({
        type: 'sent_to_client',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: isResend
          ? `Quote resent to client with ${markup}% markup ($${clientAmount.toFixed(2)})`
          : `Quote sent to client with ${markup}% markup ($${clientAmount.toFixed(2)})`,
        metadata: { quoteId: shareQuote.id, workOrderNumber: shareQuote.workOrderNumber },
      });
      const existingSysInfo = (shareQuote as any).systemInformation || {};
      await updateDoc(doc(db, 'quotes', shareQuote.id), {
        markupPercentage: markup,
        clientAmount,
        originalAmount: shareQuote.totalAmount,
        status: 'sent_to_client',
        sentToClientAt: serverTimestamp(),
        sentBy: currentUser.uid,
        timeline: [...existingQuoteTimeline, sentEvent],
        systemInformation: {
          ...existingSysInfo,
          sentToClientBy: { id: currentUser.uid, name: adminName, timestamp: Timestamp.now() },
        },
        updatedAt: serverTimestamp(),
      });
      const woDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const woData = woDoc.data();
      const existingTimeline = woData?.timeline || [];
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        timeline: [...existingTimeline, createTimelineEvent({
          type: 'quote_shared_with_client',
          userId: currentUser.uid,
          userName: adminName,
          userRole: 'admin',
          details: isResend
            ? `Quote from ${shareQuote.subcontractorName} resent to client with ${markup}% markup`
            : `Quote from ${shareQuote.subcontractorName} sent to client with ${markup}% markup`,
          metadata: { quoteId: shareQuote.id, subcontractorName: shareQuote.subcontractorName, clientAmount, markup },
        })],
        updatedAt: serverTimestamp(),
      });
      if (shareQuote.workOrderId && shareQuote.workOrderNumber) {
        try {
          await notifyQuoteSubmission(
            (workOrder as any).clientId,
            shareQuote.workOrderId,
            shareQuote.workOrderNumber,
            shareQuote.subcontractorName,
            clientAmount
          );
        } catch { /* best effort */ }
      }
      toast.success(isResend ? 'Quote resent to client' : 'Quote shared with client');
      setShowShareModal(false);
      setShareQuote(null);
      // Refresh quotes list
      const quotesSnap = await getDocs(query(collection(db, 'quotes'), where('workOrderId', '==', workOrder.id)));
      setQuotes(quotesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Quote)));
    } catch (err) {
      console.error('Error sharing quote:', err);
      toast.error('Failed to share quote with client');
    } finally {
      setShareSubmitting(false);
    }
  };

  const openAssignModal = async (quote?: Quote) => {
    try {
      const subsSnap = await getDocs(query(collection(db, 'subcontractors'), where('status', '==', 'approved')));
      const subs = subsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subcontractor));
      setAssignSubcontractors(subs);
      setAssignFromQuote(quote || null);
      if (quote) {
        const match = subs.find(
          (s) => subcontractorAuthId(s) === quote.subcontractorId || s.id === quote.subcontractorId
        );
        setSelectedAssignSubId(match?.id || '');
      } else {
        setSelectedAssignSubId('');
      }
      setShowAssignModal(true);
    } catch (err) {
      toast.error('Failed to load subcontractors');
    }
  };

  const handleSubmitManualAssign = async () => {
    if (!workOrder || !selectedAssignSubId) {
      toast.error('Please select a subcontractor');
      return;
    }
    setAssignSubmitting(true);
    try {
      const sub = assignSubcontractors.find(s => s.id === selectedAssignSubId);
      if (!sub) { toast.error('Subcontractor not found'); return; }

      const currentUser = auth.currentUser;
      const adminDoc = currentUser ? await getDoc(doc(db, 'adminUsers', currentUser.uid)) : null;
      const adminName = adminDoc?.exists() ? adminDoc.data().fullName : 'Admin';

      const woDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const woData = woDoc.data();

      const updatePayload: Record<string, any> = {
        status: 'assigned',
        assignedSubcontractor: sub.uid || sub.id,
        assignedSubcontractorName: sub.fullName,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...(woData?.timeline || []), createTimelineEvent({
          type: 'assigned',
          userId: currentUser?.uid || 'unknown',
          userName: adminName,
          userRole: 'admin',
          details: `Manually assigned to ${sub.fullName} by ${adminName}`,
          metadata: { subcontractorId: sub.uid || sub.id, subcontractorName: sub.fullName, source: 'admin_manual_assign' },
        })],
        systemInformation: {
          ...(woData?.systemInformation || {}),
          assignment: {
            subcontractorId: sub.uid || sub.id,
            subcontractorName: sub.fullName,
            assignedBy: { id: currentUser?.uid || 'unknown', name: adminName },
            timestamp: Timestamp.now(),
          },
        },
      };

      if (assignFromQuote) {
        updatePayload.approvedQuoteId = assignFromQuote.id;
        updatePayload.approvedQuoteAmount = assignFromQuote.clientAmount || assignFromQuote.totalAmount;
        updatePayload.approvedQuoteLaborCost = assignFromQuote.laborCost;
        updatePayload.approvedQuoteMaterialCost = assignFromQuote.materialCost;
        updatePayload.approvedQuoteLineItems = assignFromQuote.lineItems || [];
      }

      await updateDoc(doc(db, 'workOrders', workOrder.id), updatePayload);

      await addDoc(collection(db, 'assignedJobs'), {
        workOrderId: workOrder.id,
        subcontractorId: sub.uid || sub.id,
        assignedAt: serverTimestamp(),
        status: 'pending_acceptance',
      });

      setWorkOrder(prev => prev ? { ...prev, ...updatePayload, status: 'assigned', assignedSubcontractorName: sub.fullName } : prev);
      setShowAssignModal(false);
      setAssignFromQuote(null);
      toast.success(`Work order assigned to ${sub.fullName}`);
    } catch (err) {
      console.error('Error assigning work order:', err);
      toast.error('Failed to assign work order');
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleWorkOrderRating = async (completeToSpecs: boolean) => {
    if (!workOrder) return;
    setRatingSubmitting(true);
    try {
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        ratingCompleteToSpecs: completeToSpecs,
        ratedAt: serverTimestamp(),
        ratedBy: auth.currentUser?.email ?? auth.currentUser?.uid ?? 'Admin',
      });
      setWorkOrder((prev) => prev ? { ...prev, ratingCompleteToSpecs: completeToSpecs } : null);
      setShowRatingDialog(false);
      toast.success(completeToSpecs ? 'Thanks — work marked as complete to specifications.' : 'Rating recorded.');
    } catch (err) {
      toast.error('Failed to save rating');
    } finally {
      setRatingSubmitting(false);
    }
  };

  // ServiceChannel status pipeline
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
  const currentStepIdx = workOrder
    ? STATUS_PIPELINE.findIndex(s => s.key === workOrder.status)
    : -1;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!workOrder) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-foreground">Work Order Not Found</h2>
          <Link href="/admin-portal/work-orders">
            <Button className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Work Orders
            </Button>
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const TABS = [
    { key: 'overview', label: 'Overview', icon: FileText },
    { key: 'notes', label: `Notes${notes.length > 0 ? ` (${notes.length})` : ''}`, icon: StickyNote },
    { key: 'history', label: 'History', icon: History },
    { key: 'attachments', label: `Attachments${(workOrder.images?.length ?? 0) + (workOrder.completionImages?.length ?? 0) > 0 ? ` (${(workOrder.images?.length ?? 0) + (workOrder.completionImages?.length ?? 0)})` : ''}`, icon: Paperclip },
    { key: 'quotes', label: `Quotes${quotes.length > 0 ? ` (${quotes.length})` : ''}`, icon: FileText },
    { key: 'invoices', label: `Invoices${relatedInvoices.length > 0 ? ` (${relatedInvoices.length})` : ''}`, icon: Receipt },
  ];

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <Link href="/admin-portal/work-orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            {editMode ? (
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="text-xl font-bold h-10 max-w-sm"
                  placeholder="Work Order Title"
                />
                <SearchableSelect
                  className="w-full min-w-[160px] sm:w-52"
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
                  options={WORK_ORDER_EDIT_STATUS_OPTIONS}
                  placeholder="Status"
                  aria-label="Work order status"
                />
                <SearchableSelect
                  className="w-full min-w-[100px] sm:w-32"
                  value={editForm.priority}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, priority: v }))}
                  options={[
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                  ]}
                  placeholder="Priority"
                  aria-label="Priority"
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground truncate">{workOrder.title}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${getStatusColor(workOrder.status)}`}>
                  {workOrder.status.replace(/_/g, ' ').toUpperCase()}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${getPriorityColor(workOrder.priority)}`}>
                  {workOrder.priority.toUpperCase()}
                </span>
              </div>
            )}
            <p className="text-muted-foreground text-sm mt-0.5">
              #{workOrder.workOrderNumber} &nbsp;·&nbsp;
              <span className="flex-inline items-center gap-1">
                <MapPin className="h-3 w-3 inline" /> {workOrder.locationName}
              </span>
              {workOrder.createdAt?.toDate && (
                <> &nbsp;·&nbsp; <Calendar className="h-3 w-3 inline" /> {workOrder.createdAt.toDate().toLocaleDateString()}</>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            {(workOrder.status === 'approved' || workOrder.status === 'bidding') && (
              <Button size="sm" onClick={handleShareForBidding}>
                <Share2 className="h-4 w-4 mr-2" />
                Share for Bidding
              </Button>
            )}
            {(workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor') && (workOrder.assignedSubcontractor || workOrder.assignedTo) && (
              <Link href={`/admin-portal/messages?workOrderId=${workOrder.id}`}>
                <Button size="sm" variant="outline">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Message
                </Button>
              </Link>
            )}
            {!editMode ? (
              <Button size="sm" variant="outline" onClick={enterEditMode}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={handleSaveEdit} loading={editSaving} disabled={editSaving}>
                  Save Changes
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditMode(false)} disabled={editSaving}>
                  Cancel
                </Button>
              </>
            )}
            {(['approved', 'bidding', 'quotes_received'].includes(workOrder.status)) && (
              <Button size="sm" variant="outline" onClick={() => openAssignModal()}>
                <UserPlus className="h-4 w-4 mr-2" />
                Assign to Subcontractor
              </Button>
            )}
            {workOrder.status === 'pending_invoice' && (
              <Button
                size="sm"
                className="bg-orange-600 hover:bg-orange-700"
                onClick={handleCreateInvoice}
                disabled={creatingInvoice}
              >
                <Receipt className="h-4 w-4 mr-2" />
                {creatingInvoice ? 'Creating Invoice...' : 'Create Invoice'}
              </Button>
            )}
            {workOrder.status === 'completed' && workOrder.ratingCompleteToSpecs === undefined && (
              <Button size="sm" onClick={() => setShowRatingDialog(true)}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Leave a Rating
              </Button>
            )}
            {workOrder.status === 'completed' && workOrder.ratingCompleteToSpecs !== undefined && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Rated: {workOrder.ratingCompleteToSpecs ? 'Complete to specifications' : 'Not to specifications'}
              </span>
            )}
          </div>
        </div>

        {/* Rating Dialog */}
        {showRatingDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg shadow-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-2">Leave a Rating for this Work Order</h3>
              <p className="text-muted-foreground text-sm mb-4">Is the work complete and to specifications?</p>
              <div className="flex gap-3">
                <Button className="flex-1" onClick={() => handleWorkOrderRating(true)} loading={ratingSubmitting} disabled={ratingSubmitting}>
                  Yes
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleWorkOrderRating(false)} loading={ratingSubmitting} disabled={ratingSubmitting}>
                  No
                </Button>
                <Button variant="ghost" onClick={() => setShowRatingDialog(false)} loading={ratingSubmitting} disabled={ratingSubmitting}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Status Pipeline */}
        {currentStepIdx >= 0 && (
          <div className="bg-card border rounded-xl p-4 overflow-x-auto">
            <div className="flex items-center min-w-max gap-0">
              {STATUS_PIPELINE.map((step, idx) => {
                const isDone = idx < currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                const isSkipped = workOrder.status === 'rejected' || workOrder.status === 'rejected_by_subcontractor';
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
                      <span className={`text-xs mt-1 text-center whitespace-nowrap ${isCurrent ? 'font-semibold text-primary' : isDone ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
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
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
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
                      {editMode ? (
                        <Textarea
                          value={editForm.description}
                          onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                          className="min-h-[100px] resize-none"
                          placeholder="Detailed description of the work needed..."
                        />
                      ) : (
                        <p className="text-foreground">{workOrder.description}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="font-semibold text-muted-foreground text-sm mb-1">Category</h3>
                        {editMode ? (
                          <SearchableSelect
                            className="mt-1 w-full"
                            value={editForm.category}
                            onValueChange={(v) => setEditForm((f) => ({ ...f, category: v }))}
                            options={[
                              { value: '', label: 'Select category...' },
                              ...editCategories.map((c) => ({ value: c.name, label: c.name })),
                            ]}
                            placeholder="Select category..."
                            aria-label="Category"
                          />
                        ) : (
                          <p className="text-foreground">{workOrder.category}</p>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-muted-foreground text-sm mb-1">Estimate Budget</h3>
                        {editMode ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editForm.estimateBudget}
                            onChange={e => setEditForm(f => ({ ...f, estimateBudget: e.target.value }))}
                            placeholder="e.g., 5000"
                            onWheel={e => e.currentTarget.blur()}
                          />
                        ) : (
                          workOrder.estimateBudget
                            ? <p className="text-foreground font-semibold">${workOrder.estimateBudget.toLocaleString()}</p>
                            : <p className="text-muted-foreground text-sm">Not set</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="font-semibold text-muted-foreground text-sm mb-1">Scheduled Date</h3>
                        {editMode ? (
                          <Input
                            type="date"
                            value={editForm.scheduledServiceDate}
                            onChange={e => setEditForm(f => ({ ...f, scheduledServiceDate: e.target.value }))}
                          />
                        ) : (
                          workOrder.scheduledServiceDate
                            ? <p className="text-foreground flex items-center gap-1"><Calendar className="h-4 w-4 text-muted-foreground" />{workOrder.scheduledServiceDate?.toDate?.().toLocaleDateString() || 'N/A'}</p>
                            : <p className="text-muted-foreground text-sm">Not scheduled</p>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-muted-foreground text-sm mb-1">Scheduled Time</h3>
                        {editMode ? (
                          <Input
                            type="time"
                            value={editForm.scheduledServiceTime}
                            onChange={e => setEditForm(f => ({ ...f, scheduledServiceTime: e.target.value }))}
                          />
                        ) : (
                          workOrder.scheduledServiceTime
                            ? <p className="text-foreground flex items-center gap-1"><Clock className="h-4 w-4 text-muted-foreground" />{workOrder.scheduledServiceTime}</p>
                            : <p className="text-muted-foreground text-sm">Not set</p>
                        )}
                      </div>
                    </div>
                    {workOrder.rejectionReason && (
                      <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                        <h3 className="font-semibold text-destructive mb-2 flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" /> Rejection Reason
                        </h3>
                        <p className="text-destructive/80 text-sm">{workOrder.rejectionReason}</p>
                      </div>
                    )}
                    {workOrder.status === 'completed' && workOrder.completionDetails && (
                      <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
                        <h3 className="font-semibold text-green-800 dark:text-green-400 mb-2 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" /> Completion Details
                        </h3>
                        <p className="text-green-700 dark:text-green-300 text-sm whitespace-pre-wrap">{workOrder.completionDetails}</p>
                      </div>
                    )}
                    {editMode && (
                      <div className="flex gap-3 pt-2 border-t">
                        <Button onClick={handleSaveEdit} loading={editSaving} disabled={editSaving}>Save Changes</Button>
                        <Button variant="outline" onClick={() => setEditMode(false)} disabled={editSaving}>Cancel</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quick quotes preview */}
                {quotes.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2"><FileText className="h-5 w-5" />Quotes</span>
                        <Button size="sm" variant="ghost" onClick={() => setActiveTab('quotes')}>View all <ChevronRight className="h-4 w-4 ml-1" /></Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {quotes.slice(0, 2).map(q => (
                          <div key={q.id} className="flex justify-between items-center p-3 bg-muted/40 rounded-lg">
                            <div>
                              <p className="font-medium text-sm">{q.subcontractorName}</p>
                              <p className="text-xs text-muted-foreground capitalize">{q.status}</p>
                            </div>
                            <p className="font-bold text-primary">${(q.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                          </div>
                        ))}
                        {quotes.length > 2 && <p className="text-xs text-muted-foreground text-center">+{quotes.length - 2} more quotes</p>}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Client</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {editMode ? (
                      <div>
                        <Label className="text-muted-foreground">Client</Label>
                        <SearchableSelect
                          className="mt-1 w-full"
                          value={editForm.clientId}
                          onValueChange={(v) => setEditForm((f) => ({ ...f, clientId: v }))}
                          options={[
                            { value: '', label: 'Choose a client...' },
                            ...editClients.map((c) => ({
                              value: c.id,
                              label: `${c.fullName} (${c.email})`,
                            })),
                          ]}
                          placeholder="Choose a client..."
                          aria-label="Client"
                        />
                      </div>
                    ) : (
                      <>
                        <div><p className="text-muted-foreground">Name</p><p className="font-semibold">{getWorkOrderClientDisplayName(workOrder)}</p></div>
                        <div><p className="text-muted-foreground">Email</p><p className="font-semibold">{workOrder.clientEmail}</p></div>
                        {workOrder.appyRequestor && <div><p className="text-muted-foreground">APPY Requestor</p><p className="font-semibold">{workOrder.appyRequestor}</p></div>}
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Location</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {editMode ? (
                      <div>
                        <Label className="text-muted-foreground">Location</Label>
                        <SearchableSelect
                          className="mt-1 w-full"
                          value={editForm.locationId}
                          onValueChange={(v) => setEditForm((f) => ({ ...f, locationId: v }))}
                          options={[
                            { value: '', label: 'Choose a location...' },
                            ...editLocations.map((l) => ({ value: l.id, label: l.locationName })),
                          ]}
                          placeholder="Choose a location..."
                          aria-label="Location"
                        />
                      </div>
                    ) : (
                      <>
                        <div><p className="text-muted-foreground">Location Name</p><p className="font-semibold">{workOrder.locationName}</p></div>
                        <div><p className="text-muted-foreground">Address</p><p className="font-semibold">{formatAddress(workOrder.locationAddress)}</p></div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {(workOrder.assignedToName || workOrder.assignedSubcontractorName) && (
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Assigned To</CardTitle></CardHeader>
                    <CardContent className="text-sm">
                      <p className="font-semibold">{workOrder.assignedToName || workOrder.assignedSubcontractorName}</p>
                      {workOrder.assignedAt && <p className="text-muted-foreground text-xs mt-1">Assigned {workOrder.assignedAt?.toDate?.().toLocaleDateString()}</p>}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* NOTES TAB */}
          {activeTab === 'notes' && (
            <div className="max-w-3xl space-y-4">
              {/* Add note */}
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <Textarea
                      placeholder="Add a note about this work order..."
                      value={newNote}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNote(e.target.value)}
                      className="min-h-[80px] resize-none"
                    />
                    <div className="flex justify-end">
                      <Button onClick={handleAddNote} disabled={addingNote || !newNote.trim()} size="sm">
                        <Send className="h-4 w-4 mr-2" />
                        {addingNote ? 'Adding...' : 'Add Note'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes list */}
              {notes.length === 0 ? (
                <div className="text-center py-16">
                  <StickyNote className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No notes yet. Add the first note above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notes.map(note => (
                    <Card key={note.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-primary text-xs font-bold">{(note.createdBy ?? 'A').charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{note.createdBy ?? 'Admin'}</span>
                              <span className="text-xs text-muted-foreground">
                                {note.createdAt?.toDate?.().toLocaleString() ?? 'Just now'}
                              </span>
                              {note.type === 'system' && (
                                <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">System</span>
                              )}
                            </div>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{note.text}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="max-w-3xl">
              <WorkOrderSystemInfo
                timeline={buildTimeline(workOrder)}
                systemInformation={workOrder.systemInformation}
                viewerRole="admin"
                creationSourceLabel={getCreatedDetails(workOrder, workOrder.timeline?.find((e: any) => e?.type === 'created')).createdDetails}
              />
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
                          onClick={() => window.open(image, '_blank')} />
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
                          onClick={() => window.open(image, '_blank')} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {(!workOrder.images || workOrder.images.length === 0) && (!workOrder.completionImages || workOrder.completionImages.length === 0) && (
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
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><FileText className="h-5 w-5" />Quotes ({quotes.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {quotes.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No quotes received yet</p>
                  ) : (
                    <div className="space-y-3">
                      {quotes.length >= 2 && (
                        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                          <p className="text-sm text-primary">Select 2+ quotes to compare them side-by-side</p>
                        </div>
                      )}
                      {quotes.map(quote => (
                        <div key={quote.id} className={`p-4 border rounded-lg hover:bg-muted/30 transition-colors ${selectedQuoteIds.includes(quote.id) ? 'bg-primary/5 border-primary/30' : ''}`}>
                          <div className="flex items-start gap-3">
                            {quotes.length >= 2 && (
                              <Checkbox checked={selectedQuoteIds.includes(quote.id)} onCheckedChange={(c) => handleQuoteSelection(quote.id, c === true)} className="mt-1" />
                            )}
                            <div className="flex-1 flex justify-between items-start">
                              <div>
                                <p className="font-semibold">{quote.subcontractorName}</p>
                                <p className="text-sm text-muted-foreground">{quote.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</p>
                                {quote.notes && <p className="text-sm text-muted-foreground mt-1">{quote.notes}</p>}
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold text-primary">${(quote.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                <p className="text-xs text-muted-foreground capitalize">{quote.status}</p>
                              </div>
                            </div>
                          </div>
                          {workOrder.status !== 'assigned' && workOrder.status !== 'accepted_by_subcontractor' && workOrder.status !== 'pending_invoice' && workOrder.status !== 'completed' && (
                            <div className="mt-3 pt-3 border-t flex flex-col gap-2">
                              {workOrder.status === 'quotes_received' && (
                                <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => { setShareQuote(quote); setShareMarkup(String(quote.markupPercentage || 20)); setShowShareModal(true); }}>
                                  <Share2 className="h-3.5 w-3.5 mr-2" />
                                  {quote.status === 'sent_to_client' ? 'Resend to Client' : 'Share Quote with Client'}
                                </Button>
                              )}
                              <Button size="sm" variant={workOrder.status === 'quotes_received' ? 'outline' : 'default'} className="w-full" onClick={() => openAssignModal(quote)}>
                                <UserPlus className="h-3.5 w-3.5 mr-2" />
                                Assign This Subcontractor
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                      {quotes.length >= 2 && selectedQuoteIds.length >= 2 && (
                        <Button onClick={handleCompareQuotes} className="w-full">
                          <GitCompare className="h-4 w-4 mr-2" />Compare {selectedQuoteIds.length} Quotes
                        </Button>
                      )}
                      <Link href={`/admin-portal/quotes?workOrderId=${workOrder.id}`}>
                        <Button variant="outline" className="w-full mt-2">View in Quotes</Button>
                      </Link>
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
                <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Related Invoices ({relatedInvoices.length})</CardTitle></CardHeader>
                <CardContent>
                  {relatedInvoices.length === 0 ? (
                    <div className="text-center py-8">
                      <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No invoices yet for this work order.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {relatedInvoices.map((inv: any) => (
                        <div key={inv.id} className="p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-sm">Invoice #{inv.invoiceNumber || inv.id.slice(0, 8)}</p>
                              <p className="text-xs text-muted-foreground">{inv.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-primary">${(inv.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                              <span className={`text-xs capitalize px-2 py-0.5 rounded-full ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : inv.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {inv.status || 'draft'}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3">
                            <Link href={`/admin-portal/invoices/${inv.id}`}>
                              <Button variant="outline" size="sm">Open Full Invoice</Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                      <Link href={`/admin-portal/invoices?workOrderId=${workOrder.id}`}>
                        <Button variant="outline" className="w-full mt-2">View All Related Invoices</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Share for Bidding Modal */}
      {showBiddingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-card rounded-lg max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b sticky top-0 bg-card z-10">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold">Share for Bidding</h2>
                  <p className="text-sm text-muted-foreground mt-1">Select subcontractors to share this work order with</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setShowBiddingModal(false); setSelectedSubcontractors([]); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-1">{workOrder?.title}</h3>
                <p className="text-sm text-blue-700">{workOrder?.workOrderNumber}</p>
              </div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="selectAll"
                    checked={selectedSubcontractors.length === subcontractors.length && subcontractors.length > 0}
                    onChange={() => setSelectedSubcontractors(selectedSubcontractors.length === subcontractors.length ? [] : subcontractors.map(s => s.id))}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="selectAll" className="text-sm font-medium text-foreground">Select All ({subcontractors.length})</label>
                </div>
                <div className="text-sm text-muted-foreground">{selectedSubcontractors.length} selected</div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-4">
                {subcontractors.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No approved subcontractors found</p>
                ) : (
                  subcontractors.map(sub => (
                    <div
                      key={sub.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedSubcontractors.includes(sub.id)
                          ? sub.matchesCategory ? 'bg-green-50 border-green-400 ring-2 ring-green-200' : 'bg-blue-50 border-blue-300'
                          : sub.matchesCategory ? 'bg-green-50 border-green-300 hover:border-green-400' : 'bg-card border-border hover:bg-muted'
                      }`}
                      onClick={() => setSelectedSubcontractors(prev => prev.includes(sub.id) ? prev.filter(id => id !== sub.id) : [...prev, sub.id])}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSubcontractors.includes(sub.id)}
                        onChange={() => {}}
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
                <Button variant="outline" onClick={() => { setShowBiddingModal(false); setSelectedSubcontractors([]); }} disabled={biddingSubmitting} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleSubmitBidding} loading={biddingSubmitting} disabled={biddingSubmitting || selectedSubcontractors.length === 0} className="flex-1">
                  <Share2 className="h-4 w-4 mr-2" />
                  {biddingSubmitting ? 'Sharing...' : `Share with ${selectedSubcontractors.length} Subcontractor(s)`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compare Quotes Dialog */}
      <CompareQuotesDialog
        quotes={selectedQuotes}
        isOpen={showCompareDialog}
        onClose={() => setShowCompareDialog(false)}
      />

      {/* Manual Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-lg max-w-md w-full">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                {assignFromQuote ? `Assign Quote: ${assignFromQuote.subcontractorName}` : 'Assign to Subcontractor'}
              </h2>
              <Button variant="outline" size="sm" onClick={() => setShowAssignModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              {assignFromQuote && (
                <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                  Assigning quote from <strong>{assignFromQuote.subcontractorName}</strong> — ${(assignFromQuote.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Select Subcontractor</label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={selectedAssignSubId}
                  onValueChange={setSelectedAssignSubId}
                  options={[
                    { value: '', label: '-- Select subcontractor --' },
                    ...assignSubcontractors.map((sub) => ({
                      value: sub.id,
                      label: `${sub.fullName}${sub.businessName ? ` (${sub.businessName})` : ''}`,
                    })),
                  ]}
                  placeholder="Select subcontractor"
                  aria-label="Subcontractor to assign"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowAssignModal(false)}>Cancel</Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmitManualAssign}
                  disabled={!selectedAssignSubId || assignSubmitting}
                >
                  {assignSubmitting ? 'Assigning...' : 'Assign'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showShareModal && shareQuote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-lg max-w-sm w-full">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Share Quote with Client</h2>
              <Button variant="outline" size="sm" onClick={() => setShowShareModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                Sharing quote from <strong>{shareQuote.subcontractorName}</strong> — ${(shareQuote.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Markup %</label>
                <Input
                  type="number"
                  min="0"
                  value={shareMarkup}
                  onChange={e => setShareMarkup(e.target.value)}
                  placeholder="e.g. 20"
                />
                {shareMarkup && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Client will see: ${(shareQuote.totalAmount * (1 + (parseFloat(shareMarkup) || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowShareModal(false)}>Cancel</Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={handleShareWithClient}
                  disabled={shareSubmitting}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  {shareSubmitting ? 'Sharing...' : shareQuote.status === 'sent_to_client' ? 'Resend to Client' : 'Share with Client'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
