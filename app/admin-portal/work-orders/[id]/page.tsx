'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, MapPin, Calendar, User, FileText, Image as ImageIcon, DollarSign, MessageSquare, CheckCircle, GitCompare, Edit2, Clock, History, Paperclip, StickyNote, Receipt, ChevronRight, AlertCircle, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatAddress } from '@/lib/utils';
import CompareQuotesDialog from '@/components/compare-quotes-dialog';
import WorkOrderSystemInfo from '@/components/work-order-system-info';
import { getWorkOrderClientDisplayName } from '@/lib/appy-client';
import { toast } from 'sonner';

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
      case 'completed': return 'text-emerald-600 bg-emerald-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
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
    { key: 'completed', label: 'Completed' },
  ];
  const currentStepIdx = workOrder
    ? STATUS_PIPELINE.findIndex(s => s.key === workOrder.status)
    : -1;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!workOrder) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900">Work Order Not Found</h2>
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
              WO #{workOrder.workOrderNumber} &nbsp;·&nbsp;
              <span className="flex-inline items-center gap-1">
                <MapPin className="h-3 w-3 inline" /> {workOrder.locationName}
              </span>
              {workOrder.createdAt?.toDate && (
                <> &nbsp;·&nbsp; <Calendar className="h-3 w-3 inline" /> {workOrder.createdAt.toDate().toLocaleDateString()}</>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {(workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor') && workOrder.assignedSubcontractor && (
              <Link href={`/admin-portal/messages?workOrderId=${workOrder.id}`}>
                <Button size="sm" variant="outline">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Message
                </Button>
              </Link>
            )}
            <Link href={`/admin-portal/work-orders?editId=${workOrder.id}`}>
              <Button size="sm" variant="outline">
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </Link>
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
                <Button className="flex-1" onClick={() => handleWorkOrderRating(true)} disabled={ratingSubmitting}>
                  Yes
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleWorkOrderRating(false)} disabled={ratingSubmitting}>
                  No
                </Button>
                <Button variant="ghost" onClick={() => setShowRatingDialog(false)} disabled={ratingSubmitting}>
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
                      <p className="text-foreground">{workOrder.description}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="font-semibold text-muted-foreground text-sm mb-1">Category</h3>
                        <p className="text-foreground">{workOrder.category}</p>
                      </div>
                      {workOrder.estimateBudget && (
                        <div>
                          <h3 className="font-semibold text-muted-foreground text-sm mb-1">Estimate Budget</h3>
                          <p className="text-foreground font-semibold">${workOrder.estimateBudget.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    {workOrder.scheduledServiceDate && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-semibold text-muted-foreground text-sm mb-1">Scheduled Date</h3>
                          <p className="text-foreground flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {workOrder.scheduledServiceDate?.toDate?.().toLocaleDateString() || 'N/A'}
                          </p>
                        </div>
                        {workOrder.scheduledServiceTime && (
                          <div>
                            <h3 className="font-semibold text-muted-foreground text-sm mb-1">Scheduled Time</h3>
                            <p className="text-foreground flex items-center gap-1">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              {workOrder.scheduledServiceTime}
                            </p>
                          </div>
                        )}
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
                      <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
                        <h3 className="font-semibold text-green-800 dark:text-green-400 mb-2 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" /> Completion Details
                        </h3>
                        <p className="text-green-700 dark:text-green-300 text-sm whitespace-pre-wrap">{workOrder.completionDetails}</p>
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
                    <div><p className="text-muted-foreground">Name</p><p className="font-semibold">{getWorkOrderClientDisplayName(workOrder)}</p></div>
                    <div><p className="text-muted-foreground">Email</p><p className="font-semibold">{workOrder.clientEmail}</p></div>
                    {workOrder.appyRequestor && <div><p className="text-muted-foreground">APPY Requestor</p><p className="font-semibold">{workOrder.appyRequestor}</p></div>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Location</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div><p className="text-muted-foreground">Location Name</p><p className="font-semibold">{workOrder.locationName}</p></div>
                    <div><p className="text-muted-foreground">Address</p><p className="font-semibold">{formatAddress(workOrder.locationAddress)}</p></div>
                  </CardContent>
                </Card>

                {workOrder.assignedToName && (
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Assigned To</CardTitle></CardHeader>
                    <CardContent className="text-sm">
                      <p className="font-semibold">{workOrder.assignedToName}</p>
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
                        </div>
                      ))}
                      <Link href={`/admin-portal/invoices?workOrderId=${workOrder.id}`}>
                        <Button variant="outline" className="w-full mt-2">View in Invoices</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Compare Quotes Dialog */}
      <CompareQuotesDialog
        quotes={selectedQuotes}
        isOpen={showCompareDialog}
        onClose={() => setShowCompareDialog(false)}
      />
    </AdminLayout>
  );
}
