'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { ArrowLeft, MapPin, Calendar, User, FileText, Image as ImageIcon, DollarSign, MessageSquare, CheckCircle, GitCompare, Edit2, Clock, History, Paperclip, StickyNote, Receipt, ChevronRight, AlertCircle, Plus, Send, Share2, X, UserPlus, Eye, Archive, Landmark, Upload, Loader2 } from 'lucide-react';
import { uploadMultipleToCloudinary } from '@/lib/cloudinary-upload';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatAddress } from '@/lib/utils';
import CompareQuotesDialog from '@/components/compare-quotes-dialog';
import WorkOrderSystemInfo from '@/components/work-order-system-info';
import { getWorkOrderClientDisplayName } from '@/lib/appy-client';
import { notifyBiddingOpportunity, notifyClientOfQuoteSent } from '@/lib/notifications';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';
import { subcontractorAuthId } from '@/lib/subcontractor-ids';
import { generateInvoiceNumber } from '@/lib/invoice-number';
import { toast } from 'sonner';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import type { VendorPayment, VendorPaymentAdjustment, VendorPaymentStatus } from '@/types';

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
  city?: string;
  state?: string;
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
  clientLineItems?: LineItem[];
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
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'history' | 'attachments' | 'quotes' | 'invoices' | 'vendor_payment'>('overview');
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [relatedInvoices, setRelatedInvoices] = useState<any[]>([]);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    notes: '',
    terms: 'Payment due within 30 days of invoice date.',
    discountAmount: '',
  });
  const [invoiceLineItems, setInvoiceLineItems] = useState<Array<{ description: string; quantity: number; unitPrice: number; amount: number }>>([]);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [showBiddingModal, setShowBiddingModal] = useState(false);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedSubcontractors, setSelectedSubcontractors] = useState<string[]>([]);
  const [biddingSubmitting, setBiddingSubmitting] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

  // Manual assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignSubcontractors, setAssignSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedAssignSubId, setSelectedAssignSubId] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignFromQuote, setAssignFromQuote] = useState<Quote | null>(null);

  // One-click invoice creation
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  // View quote detail modal
  const [viewQuoteDetail, setViewQuoteDetail] = useState<Quote | null>(null);

  // Share quote with client modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareQuote, setShareQuote] = useState<Quote | null>(null);
  const [shareMarkup, setShareMarkup] = useState('20');
  const [shareSubmitting, setShareSubmitting] = useState(false);

  // Vendor payment
  const [vendorPayment, setVendorPayment] = useState<VendorPayment | null>(null);
  const [vendorPaymentLoading, setVendorPaymentLoading] = useState(false);
  const [showCreateVendorPaymentModal, setShowCreateVendorPaymentModal] = useState(false);
  const [vendorPaymentBaseAmount, setVendorPaymentBaseAmount] = useState('');
  const [vendorPaymentInternalNotes, setVendorPaymentInternalNotes] = useState('');
  const [creatingVendorPayment, setCreatingVendorPayment] = useState(false);
  // Adjustments being staged inside the create modal (before saving)
  const [modalAdjustments, setModalAdjustments] = useState<VendorPaymentAdjustment[]>([]);
  const [modalAdjType, setModalAdjType] = useState<'increase' | 'decrease'>('increase');
  const [modalAdjAmount, setModalAdjAmount] = useState('');
  const [modalAdjReason, setModalAdjReason] = useState('');
  const [addAdjustmentType, setAddAdjustmentType] = useState<'increase' | 'decrease'>('increase');
  const [addAdjustmentAmount, setAddAdjustmentAmount] = useState('');
  const [addAdjustmentReason, setAddAdjustmentReason] = useState('');
  const [addingAdjustment, setAddingAdjustment] = useState(false);
  const [markingVendorPaid, setMarkingVendorPaid] = useState(false);

  // Subcontractor bank account (for vendor payment)
  const [subBankAccount, setSubBankAccount] = useState<{
    bankName: string; accountHolderName: string; accountType: string;
    routingNumber: string; accountNumberLast4: string;
  } | null>(null);

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

      setQuotes([]);
      setRelatedInvoices([]);
      setNotes([]);
      setVendorPayment(null);
      setLoading(true);
      let woExists = false;
      try {
        const woDoc = await getDoc(doc(db, 'workOrders', id));
        if (woDoc.exists()) {
          setWorkOrder({ id: woDoc.id, ...woDoc.data() } as WorkOrder);
          woExists = true;
        } else {
          setWorkOrder(null);
          setQuotes([]);
          setRelatedInvoices([]);
          setNotes([]);
        }
      } catch (error) {
        console.error('Error fetching work order:', error);
        setWorkOrder(null);
        setQuotes([]);
        setRelatedInvoices([]);
        setNotes([]);
      } finally {
        setLoading(false);
      }

      if (!woExists) return;

      try {
        const [quotesSnapshot, invoicesSnapshot, notesSnapshot, vendorPaymentSnapshot] = await Promise.all([
          getDocs(query(collection(db, 'quotes'), where('workOrderId', '==', id))),
          getDocs(query(collection(db, 'invoices'), where('workOrderId', '==', id))),
          getDocs(query(collection(db, 'workOrderNotes'), where('workOrderId', '==', id))),
          getDocs(query(collection(db, 'vendorPayments'), where('workOrderId', '==', id))),
        ]);

        setQuotes(quotesSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Quote[]);
        setRelatedInvoices(invoicesSnapshot.docs.map(d => ({ ...d.data(), id: d.id })));
        setNotes(
          notesSnapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        );

        const vpDoc = vendorPaymentSnapshot.docs[0];
        setVendorPayment(vpDoc ? ({ id: vpDoc.id, ...vpDoc.data() } as VendorPayment) : null);
      } catch (error) {
        console.error('Error fetching related work order data:', error);
      }
    };

    fetchWorkOrder();
  }, [id]);

  // Fetch subcontractor bank account when work order loads
  useEffect(() => {
    if (!workOrder) { setSubBankAccount(null); return; }
    const subId = workOrder.assignedSubcontractor || workOrder.assignedTo;
    if (!subId) { setSubBankAccount(null); return; }
    const fetchBank = async () => {
      try {
        const subDoc = await getDoc(doc(db, 'subcontractors', subId));
        if (subDoc.exists() && subDoc.data().bankAccount) {
          const ba = subDoc.data().bankAccount;
          setSubBankAccount({
            bankName: ba.bankName || '',
            accountHolderName: ba.accountHolderName || '',
            accountType: ba.accountType || '',
            routingNumber: ba.routingNumber || '',
            accountNumberLast4: ba.accountNumberLast4 || '',
          });
        } else {
          setSubBankAccount(null);
        }
      } catch (err) {
        console.error('Error fetching subcontractor bank account:', err);
        setSubBankAccount(null);
      }
    };
    fetchBank();
  }, [workOrder?.assignedSubcontractor, workOrder?.assignedTo]);

  const canCreateVendorPayment = useMemo(() => {
    if (!workOrder) return { ok: false, reason: 'Work order not loaded' };
    if (!(workOrder.status === 'pending_invoice' || workOrder.status === 'completed')) {
      return { ok: false, reason: 'Vendor payments can only be created when WO is Pending Invoice or Completed' };
    }
    const subId = workOrder.assignedSubcontractor || workOrder.assignedTo;
    if (!subId) return { ok: false, reason: 'No subcontractor assigned to this work order' };
    if (vendorPayment) return { ok: false, reason: 'Vendor payment already exists for this work order' };
    return { ok: true, reason: '' };
  }, [workOrder, vendorPayment]);

  const preferredBaseQuote = useMemo(() => {
    if (!quotes || quotes.length === 0) return null;
    return quotes.find(q => q.status === 'accepted') || quotes[0] || null;
  }, [quotes]);

  const openCreateVendorPayment = () => {
    if (!workOrder) return;
    const defaultBase = preferredBaseQuote?.totalAmount ?? 0;
    setVendorPaymentBaseAmount(String(defaultBase));
    setVendorPaymentInternalNotes('');
    setModalAdjustments([]);
    setModalAdjType('increase');
    setModalAdjAmount('');
    setModalAdjReason('');
    setShowCreateVendorPaymentModal(true);
  };

  const refreshVendorPayment = async () => {
    if (!id) return;
    setVendorPaymentLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'vendorPayments'), where('workOrderId', '==', id)));
      const vpDoc = snap.docs[0];
      setVendorPayment(vpDoc ? ({ id: vpDoc.id, ...vpDoc.data() } as VendorPayment) : null);
    } finally {
      setVendorPaymentLoading(false);
    }
  };

  const formatMoney = (amount: number, currency = 'USD') => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount || 0);
    } catch {
      return `$${(amount || 0).toFixed(2)}`;
    }
  };

  const computeTotals = (baseAmount: number, adjustments: VendorPaymentAdjustment[]) => {
    const adjustmentTotal = (adjustments || []).reduce((sum, a) => {
      const signed = a.type === 'decrease' ? -Math.abs(a.amount) : Math.abs(a.amount);
      return sum + signed;
    }, 0);
    const finalAmount = baseAmount + adjustmentTotal;
    return { adjustmentTotal, finalAmount };
  };

  const handleCreateVendorPayment = async () => {
    if (!workOrder) return;
    if (!canCreateVendorPayment.ok) {
      toast.error(canCreateVendorPayment.reason);
      return;
    }
    const baseAmount = Number(vendorPaymentBaseAmount);
    if (!Number.isFinite(baseAmount) || baseAmount < 0) {
      toast.error('Base amount must be a valid number (0 or more).');
      return;
    }

    setCreatingVendorPayment(true);
    try {
      const subcontractorId = workOrder.assignedSubcontractor || workOrder.assignedTo;
      const subcontractorName = workOrder.assignedSubcontractorName || workOrder.assignedToName || 'Subcontractor';
      const status: VendorPaymentStatus = 'created';
      const adjustments: VendorPaymentAdjustment[] = modalAdjustments;
      const { adjustmentTotal, finalAmount } = computeTotals(baseAmount, adjustments);

      // Guard: one per work order
      const existing = await getDocs(query(collection(db, 'vendorPayments'), where('workOrderId', '==', workOrder.id)));
      if (existing.docs.length > 0) {
        toast.error('Vendor payment already exists for this work order.');
        setShowCreateVendorPaymentModal(false);
        await refreshVendorPayment();
        return;
      }

      const vpRef = await addDoc(collection(db, 'vendorPayments'), {
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.workOrderNumber,
        subcontractorId,
        subcontractorName,
        status,
        currency: 'USD',
        baseAmount,
        adjustments,
        adjustmentTotal,
        finalAmount,
        internalNotes: vendorPaymentInternalNotes || '',
        sourceQuoteId: preferredBaseQuote?.id ?? null,
        createdAt: serverTimestamp(),
        createdBy: { uid: auth.currentUser?.uid ?? 'unknown', email: auth.currentUser?.email ?? '' },
        updatedAt: serverTimestamp(),
        updatedBy: { uid: auth.currentUser?.uid ?? 'unknown', email: auth.currentUser?.email ?? '' },
      });

      // Optional: back-reference on work order for convenience
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        vendorPaymentId: vpRef.id,
        updatedAt: serverTimestamp(),
      } as any);

      toast.success('Vendor payment created.');
      setShowCreateVendorPaymentModal(false);
      await refreshVendorPayment();
    } catch (err: any) {
      console.error('Error creating vendor payment:', err);
      toast.error(err?.message || 'Failed to create vendor payment');
    } finally {
      setCreatingVendorPayment(false);
    }
  };

  const handleAddAdjustment = async () => {
    if (!vendorPayment) return;
    const amt = Number(addAdjustmentAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Adjustment amount must be greater than 0.');
      return;
    }
    if (!addAdjustmentReason.trim()) {
      toast.error('Please enter a reason for this adjustment.');
      return;
    }

    const nextAdjustments: VendorPaymentAdjustment[] = [
      ...(vendorPayment.adjustments || []),
      {
        id: (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: addAdjustmentType,
        amount: Math.abs(amt),
        reason: addAdjustmentReason.trim(),
        createdAt: serverTimestamp() as any,
        createdBy: { uid: auth.currentUser?.uid ?? 'unknown', email: auth.currentUser?.email ?? '', role: 'admin' },
      },
    ];

    const { adjustmentTotal, finalAmount } = computeTotals(vendorPayment.baseAmount, nextAdjustments);
    if (finalAmount < 0) {
      toast.error('Final amount cannot be negative.');
      return;
    }

    setAddingAdjustment(true);
    try {
      await updateDoc(doc(db, 'vendorPayments', vendorPayment.id), {
        adjustments: nextAdjustments,
        adjustmentTotal,
        finalAmount,
        updatedAt: serverTimestamp(),
        updatedBy: { uid: auth.currentUser?.uid ?? 'unknown', email: auth.currentUser?.email ?? '' },
      } as any);
      toast.success('Adjustment added.');
      setAddAdjustmentAmount('');
      setAddAdjustmentReason('');
      await refreshVendorPayment();
    } catch (err: any) {
      console.error('Error adding adjustment:', err);
      toast.error(err?.message || 'Failed to add adjustment');
    } finally {
      setAddingAdjustment(false);
    }
  };

  const handleMarkVendorPaid = async () => {
    if (!vendorPayment) return;
    if (vendorPayment.status === 'paid') return;
    setMarkingVendorPaid(true);
    try {
      await updateDoc(doc(db, 'vendorPayments', vendorPayment.id), {
        status: 'paid',
        updatedAt: serverTimestamp(),
        updatedBy: { uid: auth.currentUser?.uid ?? 'unknown', email: auth.currentUser?.email ?? '' },
      } as any);
      toast.success('Vendor payment marked as paid.');
      await refreshVendorPayment();
    } catch (err: any) {
      console.error('Error marking vendor payment paid:', err);
      toast.error(err?.message || 'Failed to mark as paid');
    } finally {
      setMarkingVendorPaid(false);
    }
  };

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

  const handleUploadAttachmentImages = async (files: FileList | null) => {
    if (!files || files.length === 0 || !workOrder) return;
    setUploadingAttachments(true);
    try {
      const urls = await uploadMultipleToCloudinary(files);
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        images: arrayUnion(...urls),
        updatedAt: serverTimestamp(),
      });
      setWorkOrder(prev => prev ? { ...prev, images: [...(prev.images || []), ...urls] } : prev);
      toast.success(`Uploaded ${urls.length} image${urls.length === 1 ? '' : 's'}`);
    } catch (error: any) {
      console.error('Error uploading work order images:', error);
      toast.error(error?.message || 'Failed to upload images');
    } finally {
      setUploadingAttachments(false);
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

      // Company-level subcontractor-state permission: filter to states allowed for
      // the WO's company. Empty/missing array = ALL allowed (no restriction).
      let allowedStates: string[] = [];
      try {
        const wo = workOrder as any;
        let companyId: string | undefined = wo?.companyId;
        if (!companyId && wo?.clientId) {
          const cSnap = await getDoc(doc(db, 'clients', wo.clientId));
          companyId = cSnap.data()?.companyId;
        }
        if (companyId) {
          const compSnap = await getDoc(doc(db, 'companies', companyId));
          const list = compSnap.data()?.allowedSubcontractorStates;
          if (Array.isArray(list)) allowedStates = list;
        }
      } catch (err) {
        console.warn('[admin shareForBidding] state-permission lookup failed', err);
      }
      const { isSubcontractorAllowedByStates } = await import('@/lib/us-states');

      const allSubs = subsSnapshot.docs
        .map(d => ({
          id: d.id,
          uid: d.data().uid,
          fullName: d.data().fullName,
          email: d.data().email,
          businessName: d.data().businessName,
          skills: d.data().skills || [],
          state: d.data().state || '',
          city: d.data().city || '',
        }))
        .filter((s) => isSubcontractorAllowedByStates(s.state, allowedStates));

      if (allSubs.length === 0) {
        toast.error(
          allowedStates.length > 0
            ? `No approved subcontractors in this company's allowed states (${allowedStates.join(', ')})`
            : 'No approved subcontractors found',
        );
        return;
      }

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
      const selectedSubNames = selectedSubcontractors.map(id => subcontractors.find(s => s.id === id)?.fullName || 'Unknown').join(', ');
      const currentUser = auth.currentUser;

      // ONE single Firestore write — update work order status + bidding subs
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'bidding', workOrderNumber,
        biddingSubcontractors: arrayUnion(...subAuthIds),
        sharedForBiddingAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      // DONE — close modal immediately, everything else runs in background
      setWorkOrder(prev => prev ? { ...prev, status: 'bidding' } : prev);
      toast.success(`Shared with ${selectedSubcontractors.length} subcontractor(s) for bidding`);
      setShowBiddingModal(false);
      setSelectedSubcontractors([]);
      setBiddingSubmitting(false);

      // ── Background: create bidding docs, send emails, update timeline ──
      // None of this blocks the UI
      Promise.all(selectedSubcontractors.map(async subId => {
        const sub = subcontractors.find(s => s.id === subId);
        if (!sub) return;
        const authId = subcontractorAuthId(sub);
        await addDoc(collection(db, 'biddingWorkOrders'), {
          workOrderId: workOrder.id, workOrderNumber,
          subcontractorId: authId, subcontractorName: sub.fullName, subcontractorEmail: sub.email,
          workOrderTitle: workOrder.title, workOrderDescription: workOrder.description,
          clientId: workOrder.clientId, clientName: workOrder.clientName, clientEmail: workOrder.clientEmail || '',
          priority: workOrder.priority || '', category: workOrder.category || '',
          locationName: workOrder.locationName || '', locationAddress: workOrder.locationAddress || '',
          images: workOrder.images || [],
          estimateBudget: workOrder.estimateBudget ?? null,
          status: 'pending', sharedAt: serverTimestamp(), createdAt: serverTimestamp(),
        });
      })).catch(console.error);

      notifyBiddingOpportunity(subAuthIds, workOrder.id, workOrderNumber, workOrder.title).catch(console.error);

      selectedSubcontractors.forEach((subId) => {
        const sub = subcontractors.find(s => s.id === subId);
        if (sub?.email) {
          fetch('/api/email/send-bidding-opportunity', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
              toEmail: sub.email, toName: sub.fullName, workOrderNumber,
              workOrderTitle: workOrder.title, workOrderDescription: workOrder.description,
              locationName: workOrder.locationName, category: workOrder.category,
              priority: workOrder.priority,
              portalLink: `${window.location.origin}/subcontractor-portal/bidding`,
            }),
          }).catch(console.error);
        }
      });

      // Timeline update in background
      (async () => {
        try {
          const adminDocSnap = currentUser ? await getDoc(doc(db, 'adminUsers', currentUser.uid)) : null;
          const adminName = adminDocSnap?.exists() ? adminDocSnap.data().fullName : 'Admin';
          const woSnap = await getDoc(doc(db, 'workOrders', workOrder.id));
          const woData = woSnap.data();
          await updateDoc(doc(db, 'workOrders', workOrder.id), {
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
        } catch (e) { console.error('Timeline update failed:', e); }
      })();

    } catch (err) {
      console.error(err);
      toast.error('Failed to share work order for bidding');
      setBiddingSubmitting(false);
    }
  };

  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleApproveWorkOrder = async () => {
    if (!workOrder) return;
    setApproving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { toast.error('You must be logged in'); return; }

      const adminSnap = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminSnap.exists() ? (adminSnap.data().fullName || currentUser.email || 'Admin') : (currentUser.email || 'Admin');

      const woRef = doc(db, 'workOrders', workOrder.id);
      const approveSnap = await getDoc(woRef);
      const approveData = approveSnap.data();

      await updateDoc(woRef, {
        status: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...(approveData?.timeline || []), createTimelineEvent({
          type: 'approved',
          userId: currentUser.uid,
          userName: adminName,
          userRole: 'admin',
          details: `Work order approved by ${adminName}`,
          metadata: { workOrderNumber: workOrder.workOrderNumber },
        })],
        systemInformation: {
          ...(approveData?.systemInformation || {}),
          approvedBy: { id: currentUser.uid, name: adminName, timestamp: Timestamp.now() },
        },
      });

      toast.success('Work order approved');
      const refreshSnap = await getDoc(woRef);
      if (refreshSnap.exists()) setWorkOrder({ id: refreshSnap.id, ...refreshSnap.data() } as any);
    } catch (error) {
      console.error('Error approving work order:', error);
      toast.error('Failed to approve work order');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectWorkOrder = async () => {
    if (!workOrder || !rejectReason.trim()) {
      toast.error('Please enter a rejection reason');
      return;
    }
    setRejecting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { toast.error('You must be logged in'); return; }

      const adminSnap = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminSnap.exists() ? (adminSnap.data().fullName || currentUser.email || 'Admin') : (currentUser.email || 'Admin');

      const woRef = doc(db, 'workOrders', workOrder.id);
      const rejectSnap = await getDoc(woRef);
      const rejectData = rejectSnap.data();

      await updateDoc(woRef, {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedAt: serverTimestamp(),
        rejectionReason: rejectReason,
        updatedAt: serverTimestamp(),
        timeline: [...(rejectData?.timeline || []), createTimelineEvent({
          type: 'rejected',
          userId: currentUser.uid,
          userName: adminName,
          userRole: 'admin',
          details: `Work order rejected by ${adminName}. Reason: ${rejectReason}`,
          metadata: { reason: rejectReason },
        })],
        systemInformation: {
          ...(rejectData?.systemInformation || {}),
          rejectedBy: { id: currentUser.uid, name: adminName, timestamp: Timestamp.now(), reason: rejectReason },
        },
      });

      toast.success('Work order rejected');
      setShowRejectDialog(false);
      setRejectReason('');
      const refreshSnap = await getDoc(woRef);
      if (refreshSnap.exists()) setWorkOrder({ id: refreshSnap.id, ...refreshSnap.data() } as any);
    } catch (error) {
      console.error('Error rejecting work order:', error);
      toast.error('Failed to reject work order');
    } finally {
      setRejecting(false);
    }
  };

  const [archiving, setArchiving] = useState(false);

  const handleArchiveWorkOrder = async () => {
    if (!workOrder) return;
    setArchiving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { toast.error('You must be logged in'); return; }

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? (adminDoc.data().fullName || currentUser.email || 'Admin') : (currentUser.email || 'Admin');

      const archiveRef = doc(db, 'workOrders', workOrder.id);
      const archiveSnap = await getDoc(archiveRef);
      const archiveData = archiveSnap.data();

      await updateDoc(archiveRef, {
        status: 'archived',
        previousStatus: workOrder.status,
        archivedBy: currentUser.uid,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...(archiveData?.timeline || []), createTimelineEvent({
          type: 'archived',
          userId: currentUser.uid,
          userName: adminName,
          userRole: 'admin',
          details: `Work order archived by ${adminName}`,
          metadata: { previousStatus: workOrder.status },
        })],
        systemInformation: {
          ...(archiveData?.systemInformation || {}),
          archivedBy: {
            id: currentUser.uid,
            name: adminName,
            role: 'admin',
            timestamp: Timestamp.now(),
          },
        },
      });

      toast.success('Work order archived successfully');
      // Refresh
      const archiveRefresh = await getDoc(archiveRef);
      if (archiveRefresh.exists()) {
        setWorkOrder({ id: archiveRefresh.id, ...archiveRefresh.data() } as any);
      }
    } catch (error) {
      console.error('Error archiving work order:', error);
      toast.error('Failed to archive work order');
    } finally {
      setArchiving(false);
    }
  };

  const handleOpenInvoiceModal = async () => {
    if (!workOrder) return;
    try {
      // Find the approved quote
      let approvedQuote: Quote | null = null;
      const invoiceWoData = (await getDoc(doc(db, 'workOrders', workOrder.id))).data();
      const approvedQuoteId = invoiceWoData?.approvedQuoteId;

      if (approvedQuoteId) {
        const qDoc = await getDoc(doc(db, 'quotes', approvedQuoteId));
        if (qDoc.exists()) approvedQuote = { id: qDoc.id, ...qDoc.data() } as Quote;
      }
      if (!approvedQuote) {
        approvedQuote = quotes.find(q => q.status === 'accepted') || quotes[0] || null;
      }

      // Build line items
      let lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }> = [];
      if (approvedQuote) {
        const clientAmount = approvedQuote.clientAmount || approvedQuote.totalAmount || 0;
        if (approvedQuote.lineItems && approvedQuote.lineItems.length > 0) {
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
      } else {
        const amt = invoiceWoData?.approvedQuoteAmount || workOrder.estimateBudget || 0;
        lineItems = [{ description: workOrder.title, quantity: 1, unitPrice: amt, amount: amt }];
      }

      setInvoiceLineItems(lineItems);
      setInvoiceForm({
        notes: '',
        terms: 'Payment due within 30 days of invoice date.',
        discountAmount: '',
      });
      setShowInvoiceModal(true);
    } catch (error) {
      console.error('Error preparing invoice:', error);
      toast.error('Failed to prepare invoice data');
    }
  };

  const updateInvoiceLineItem = (index: number, field: string, value: string) => {
    setInvoiceLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === 'description') {
        item.description = value;
      } else {
        const num = parseFloat(value) || 0;
        if (field === 'quantity') { item.quantity = num; item.amount = parseFloat((num * item.unitPrice).toFixed(2)); }
        else if (field === 'unitPrice') { item.unitPrice = num; item.amount = parseFloat((item.quantity * num).toFixed(2)); }
        else if (field === 'amount') { item.amount = num; }
      }
      updated[index] = item;
      return updated;
    });
  };

  const handleConfirmCreateInvoice = async () => {
    if (!workOrder) return;
    setCreatingInvoice(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { toast.error('You must be logged in'); return; }

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const createdByName = adminDoc.exists() ? (adminDoc.data()?.fullName ?? 'Admin') : 'Admin';

      const subtotal = invoiceLineItems.reduce((s, li) => s + (li.amount || 0), 0);
      const discountAmount = Math.max(0, Number(invoiceForm.discountAmount || 0) || 0);
      const totalAmount = Math.max(0, subtotal - discountAmount);

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const invoiceNumber = generateInvoiceNumber();

      const invoiceWoData = (await getDoc(doc(db, 'workOrders', workOrder.id))).data();

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
        lineItems: invoiceLineItems,
        discountAmount,
        dueDate,
        notes: invoiceForm.notes,
        terms: invoiceForm.terms,
        ...(invoiceWoData?.completionDetails && { completionDetails: invoiceWoData.completionDetails }),
        ...(invoiceWoData?.completionNotes && { completionNotes: invoiceWoData.completionNotes }),
        ...(invoiceWoData?.completionImages?.length && { completionImages: invoiceWoData.completionImages }),
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

      setShowInvoiceModal(false);

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
            lineItems: invoiceLineItems,
            stripePaymentLink,
            subcontractorId: (workOrder as any).assignedTo || (workOrder as any).subcontractorId || undefined,
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
      const markupFactor = shareQuote.totalAmount > 0 ? clientAmount / shareQuote.totalAmount : 1;
      const clientLineItems = (shareQuote.lineItems || []).map((item: any) => ({
        ...item,
        unitPrice: item.unitPrice * markupFactor,
        amount: item.amount * markupFactor,
      }));
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
        clientLineItems,
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
      const shareWoDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const shareWoData = shareWoDoc.data();
      const existingTimeline = shareWoData?.timeline || [];
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
          await notifyClientOfQuoteSent(
            (workOrder as any).clientId,
            shareQuote.workOrderId,
            shareQuote.workOrderNumber,
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

      const assignWoDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const assignWoData = assignWoDoc.data();

      const updatePayload: Record<string, any> = {
        status: 'assigned',
        assignedSubcontractor: sub.uid || sub.id,
        assignedSubcontractorName: sub.fullName,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...(assignWoData?.timeline || []), createTimelineEvent({
          type: 'assigned',
          userId: currentUser?.uid || 'unknown',
          userName: adminName,
          userRole: 'admin',
          details: `Manually assigned to ${sub.fullName} by ${adminName}`,
          metadata: { subcontractorId: sub.uid || sub.id, subcontractorName: sub.fullName, source: 'admin_manual_assign' },
        })],
        systemInformation: {
          ...(assignWoData?.systemInformation || {}),
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

      // Send assignment email to subcontractor (fire-and-forget)
      if (sub.email) {
        fetch('/api/email/send-assignment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            toEmail: sub.email,
            toName: sub.fullName,
            workOrderNumber: workOrder.workOrderNumber,
            workOrderTitle: workOrder.title,
            clientName: workOrder.clientName,
            locationName: workOrder.locationName,
            locationAddress: workOrder.locationAddress,
          }),
        }).catch(err => console.error('Failed to send assignment email:', err));
      }

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
    { key: 'vendor_payment', label: `Vendor Payment${vendorPayment ? ' (1)' : ''}`, icon: DollarSign },
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
            {workOrder.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleApproveWorkOrder}
                  loading={approving} disabled={approving}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 border-red-300 hover:bg-red-50"
                  onClick={() => setShowRejectDialog(true)}
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </>
            )}
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
                onClick={handleOpenInvoiceModal}
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
            {workOrder.status !== 'archived' && (
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
          </div>
        </div>

        {/* Create Invoice Modal */}
        {showInvoiceModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-card z-10 flex justify-between items-center gap-3">
                <div>
                  <h2 className="text-xl font-bold">Create Invoice</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Review and adjust the invoice details before creating.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowInvoiceModal(false)} disabled={creatingInvoice}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-6 space-y-6">
                {/* Client Info (read-only) */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Client</Label>
                    <p className="font-medium">{workOrder?.clientName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Work Order</Label>
                    <p className="font-medium">{workOrder?.title}</p>
                    <p className="text-xs text-muted-foreground">{workOrder?.workOrderNumber}</p>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <Label className="mb-2 block">Line Items</Label>
                  <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground uppercase px-1 mb-1">
                    <div className="col-span-5">Description</div>
                    <div className="col-span-2 text-right">Qty</div>
                    <div className="col-span-2 text-right">Unit Price</div>
                    <div className="col-span-2 text-right">Amount</div>
                    <div className="col-span-1" />
                  </div>
                  {invoiceLineItems.map((li, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
                      <div className="col-span-12 md:col-span-5">
                        <Input value={li.description} onChange={e => updateInvoiceLineItem(i, 'description', e.target.value)} placeholder="Description" />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <Input type="number" min="0" step="0.01" value={li.quantity} onChange={e => updateInvoiceLineItem(i, 'quantity', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <Input type="number" min="0" step="0.01" value={li.unitPrice} onChange={e => updateInvoiceLineItem(i, 'unitPrice', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                      </div>
                      <div className="col-span-3 md:col-span-2">
                        <Input type="number" min="0" step="0.01" value={li.amount} onChange={e => updateInvoiceLineItem(i, 'amount', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {invoiceLineItems.length > 1 && (
                          <Button type="button" size="sm" variant="ghost" className="text-red-500 hover:text-red-700 p-1 h-auto"
                            onClick={() => setInvoiceLineItems(prev => prev.filter((_, idx) => idx !== i))}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setInvoiceLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, amount: 0 }])}>
                    <Plus className="h-4 w-4 mr-1" /> Add Line Item
                  </Button>
                  <div className="flex justify-end mt-3 text-sm">
                    <span className="text-muted-foreground">
                      Subtotal: <span className="font-semibold text-foreground">${invoiceLineItems.reduce((s, li) => s + (li.amount || 0), 0).toFixed(2)}</span>
                    </span>
                  </div>
                </div>

                {/* Discount & Total */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Discount</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min="0"
                      step="0.01"
                      value={invoiceForm.discountAmount}
                      onChange={(e) => setInvoiceForm(prev => ({ ...prev, discountAmount: e.target.value }))}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="e.g. 20"
                    />
                  </div>
                  <div className="rounded-lg border border-border p-3 bg-muted/30">
                    <div className="text-xs text-muted-foreground">Invoice Total</div>
                    <div className="text-lg font-bold">
                      ${Math.max(0, invoiceLineItems.reduce((s, li) => s + (li.amount || 0), 0) - (Number(invoiceForm.discountAmount || 0) || 0)).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    className="mt-1"
                    value={invoiceForm.notes}
                    onChange={e => setInvoiceForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes for the client..."
                    rows={3}
                  />
                </div>

                {/* Terms */}
                <div>
                  <Label>Terms</Label>
                  <Textarea
                    className="mt-1"
                    value={invoiceForm.terms}
                    onChange={e => setInvoiceForm(prev => ({ ...prev, terms: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
              <div className="p-6 border-t flex gap-3">
                <Button
                  className="flex-1"
                  onClick={handleConfirmCreateInvoice}
                  loading={creatingInvoice} disabled={creatingInvoice}
                >
                  <Receipt className="h-4 w-4 mr-2" />
                  {creatingInvoice ? 'Creating Invoice...' : 'Create Invoice'}
                </Button>
                <Button variant="outline" onClick={() => setShowInvoiceModal(false)} disabled={creatingInvoice}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Dialog */}
        {showRejectDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg shadow-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-2">Reject Work Order</h3>
              <p className="text-sm text-muted-foreground mb-4">Please provide a reason for rejecting this work order.</p>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="mb-4"
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowRejectDialog(false); setRejectReason(''); }}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRejectWorkOrder}
                  loading={rejecting} disabled={rejecting || !rejectReason.trim()}
                >
                  Reject Work Order
                </Button>
              </div>
            </div>
          </div>
        )}

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
                        {quotes.slice(0, 2).map(q => {
                          const qDisplayAmount = q.clientAmount || q.totalAmount || 0;
                          const qStatusColors: Record<string, string> = { pending: 'text-yellow-600', sent_to_client: 'text-blue-600', accepted: 'text-green-600', rejected: 'text-red-600' };
                          const qStatusLabels: Record<string, string> = { pending: 'Pending', sent_to_client: 'Sent to Client', accepted: 'Accepted', rejected: 'Rejected' };
                          const canAssignQ = q.status === 'accepted' && !['assigned', 'accepted_by_subcontractor', 'pending_invoice', 'completed'].includes(workOrder.status);
                          return (
                          <div key={q.id} className={`p-3 rounded-lg ${q.status === 'accepted' ? 'bg-green-50 border border-green-200' : 'bg-muted/40'}`}>
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-sm">{q.subcontractorName}</p>
                                <p className={`text-xs font-medium ${qStatusColors[q.status] || 'text-muted-foreground'}`}>{qStatusLabels[q.status] || q.status}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-primary">${qDisplayAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                {q.clientAmount && q.markupPercentage != null && (
                                  <p className="text-xs text-muted-foreground">{q.markupPercentage}% markup</p>
                                )}
                              </div>
                            </div>
                            {canAssignQ && (
                              <Button size="sm" className="w-full mt-2 bg-green-600 hover:bg-green-700 h-7 text-xs" onClick={() => openAssignModal(q)}>
                                <UserPlus className="h-3 w-3 mr-1" />
                                Assign to Subcontractor
                              </Button>
                            )}
                          </div>
                          );
                        })}
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

          {/* VENDOR PAYMENT TAB */}
          {activeTab === 'vendor_payment' && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle>Vendor Payment</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Track subcontractor payout for this work order (base + adjustments).
                    </p>
                  </div>
                  {!vendorPayment ? (
                    <Button
                      onClick={openCreateVendorPayment}
                      disabled={!canCreateVendorPayment.ok || creatingVendorPayment}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Vendor Payment
                    </Button>
                  ) : (
                    <Button
                      variant={vendorPayment.status === 'paid' ? 'outline' : 'default'}
                      onClick={handleMarkVendorPaid}
                      disabled={vendorPayment.status === 'paid' || markingVendorPaid}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {vendorPayment.status === 'paid' ? 'Paid' : (markingVendorPaid ? 'Marking…' : 'Mark as Paid')}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {vendorPaymentLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                    </div>
                  ) : !vendorPayment ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border p-4 bg-muted/30">
                        <div className="text-sm font-medium text-foreground">No vendor payment yet</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {canCreateVendorPayment.ok
                            ? 'You can create a vendor payment for this work order now.'
                            : canCreateVendorPayment.reason}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Base amount defaults from the accepted quote (if available):{' '}
                        <span className="font-medium text-foreground">
                          {preferredBaseQuote ? formatMoney(preferredBaseQuote.totalAmount, 'USD') : '—'}
                        </span>
                      </div>
                      {/* Subcontractor Bank Account Info */}
                      {subBankAccount ? (
                        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Landmark className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-semibold text-foreground">Subcontractor ACH Details on File</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                            <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium">{subBankAccount.bankName}</span></div>
                            <div><span className="text-muted-foreground">Holder:</span> <span className="font-medium">{subBankAccount.accountHolderName}</span></div>
                            <div><span className="text-muted-foreground">Type:</span> <span className="font-medium capitalize">{subBankAccount.accountType}</span></div>
                            <div><span className="text-muted-foreground">Routing:</span> <span className="font-medium">{subBankAccount.routingNumber}</span></div>
                            <div><span className="text-muted-foreground">Account:</span> <span className="font-medium">••••{subBankAccount.accountNumberLast4}</span></div>
                          </div>
                        </div>
                      ) : (workOrder.assignedSubcontractor || workOrder.assignedTo) ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          Subcontractor has not added bank account details yet.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                          vendorPayment.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}>
                          {vendorPayment.status.toUpperCase()}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Subcontractor: <span className="text-foreground font-medium">{vendorPayment.subcontractorName}</span>
                        </span>
                      </div>

                      {/* Subcontractor Bank Account Info */}
                      {subBankAccount ? (
                        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Landmark className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-semibold text-foreground">Pay To — ACH Details</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                            <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium">{subBankAccount.bankName}</span></div>
                            <div><span className="text-muted-foreground">Holder:</span> <span className="font-medium">{subBankAccount.accountHolderName}</span></div>
                            <div><span className="text-muted-foreground">Type:</span> <span className="font-medium capitalize">{subBankAccount.accountType}</span></div>
                            <div><span className="text-muted-foreground">Routing:</span> <span className="font-medium">{subBankAccount.routingNumber}</span></div>
                            <div><span className="text-muted-foreground">Account:</span> <span className="font-medium">••••{subBankAccount.accountNumberLast4}</span></div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          Subcontractor has not added bank account details. Contact them to add ACH information.
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-border p-4">
                          <div className="text-xs text-muted-foreground">Base amount</div>
                          <div className="text-lg font-bold">{formatMoney(vendorPayment.baseAmount, vendorPayment.currency)}</div>
                        </div>
                        <div className="rounded-xl border border-border p-4">
                          <div className="text-xs text-muted-foreground">Adjustments total</div>
                          <div className="text-lg font-bold">
                            {formatMoney(vendorPayment.adjustmentTotal, vendorPayment.currency)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border p-4">
                          <div className="text-xs text-muted-foreground">Final amount</div>
                          <div className="text-lg font-bold">
                            {formatMoney(vendorPayment.finalAmount, vendorPayment.currency)}
                          </div>
                        </div>
                      </div>

                      {/* Show adjustments only if there are any */}
                      {vendorPayment.adjustments && vendorPayment.adjustments.length > 0 && (
                        <div className="rounded-xl border border-border p-4 mt-4">
                          <div className="font-semibold mb-3">Adjustments</div>
                          <div className="space-y-2">
                            {vendorPayment.adjustments.slice().reverse().map((a) => {
                              const signed = a.type === "decrease" ? -Math.abs(a.amount) : Math.abs(a.amount);
                              const badgeClass =
                                a.type === "decrease"
                                  ? "bg-red-50 text-red-800 border-red-200"
                                  : "bg-emerald-50 text-emerald-800 border-emerald-200";
                              const createdLabel =
                                (a as any).createdAt?.toDate?.().toLocaleString?.() || "";
                              return (
                                <div key={a.id} className="rounded-lg border border-border p-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-foreground truncate">{a.reason}</div>
                                      <div className="text-xs text-muted-foreground mt-0.5">
                                        {createdLabel}
                                      </div>
                                    </div>
                                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}>
                                      {signed >= 0 ? "+" : "−"}{formatMoney(Math.abs(signed), vendorPayment.currency)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Create Vendor Payment Modal */}
          {showCreateVendorPaymentModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
                <div className="p-6 border-b flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Create Vendor Payment</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Base amount defaults from the accepted quote (if available). You can override it.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateVendorPaymentModal(false)} disabled={creatingVendorPayment}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Work order</Label>
                      <div className="mt-1 text-sm font-medium">WO #{workOrder.workOrderNumber}</div>
                    </div>
                    <div>
                      <Label>Subcontractor</Label>
                      <div className="mt-1 text-sm font-medium">
                        {workOrder.assignedSubcontractorName || workOrder.assignedToName || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Subcontractor Bank Account in Modal */}
                  {subBankAccount ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Landmark className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-xs font-semibold text-green-800 dark:text-green-300">ACH Details on File</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium">{subBankAccount.bankName}</span></div>
                        <div><span className="text-muted-foreground">Holder:</span> <span className="font-medium">{subBankAccount.accountHolderName}</span></div>
                        <div><span className="text-muted-foreground">Routing:</span> <span className="font-medium">{subBankAccount.routingNumber}</span></div>
                        <div><span className="text-muted-foreground">Account:</span> <span className="font-medium">••••{subBankAccount.accountNumberLast4}</span></div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-2.5 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      Subcontractor has no bank account on file. Payment will need to be arranged manually.
                    </div>
                  )}

                  <div>
                    <Label>Base amount</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min="0"
                      step="0.01"
                      value={vendorPaymentBaseAmount}
                      onChange={(e) => setVendorPaymentBaseAmount(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="e.g. 250"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Quote default: {preferredBaseQuote ? formatMoney(preferredBaseQuote.totalAmount, 'USD') : '—'}
                    </div>
                  </div>

                  {/* Live totals preview */}
                  {(() => {
                    const base = Number(vendorPaymentBaseAmount) || 0;
                    const { adjustmentTotal, finalAmount } = computeTotals(base, modalAdjustments);
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-border p-3 text-center">
                          <div className="text-xs text-muted-foreground">Base amount</div>
                          <div className="font-semibold">{formatMoney(base, 'USD')}</div>
                        </div>
                        <div className="rounded-lg border border-border p-3 text-center">
                          <div className="text-xs text-muted-foreground">Adjustments total</div>
                          <div className="font-semibold">{formatMoney(adjustmentTotal, 'USD')}</div>
                        </div>
                        <div className="rounded-lg border border-border p-3 text-center">
                          <div className="text-xs text-muted-foreground">Final amount</div>
                          <div className="font-semibold text-emerald-700">{formatMoney(finalAmount, 'USD')}</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Add adjustment */}
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <div className="font-semibold text-sm">Add adjustment</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Type</Label>
                        <select
                          className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                          value={modalAdjType}
                          onChange={(e) => setModalAdjType(e.target.value as any)}
                        >
                          <option value="increase">Increase</option>
                          <option value="decrease">Decrease</option>
                        </select>
                      </div>
                      <div>
                        <Label>Amount</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={modalAdjAmount}
                          onChange={(e) => setModalAdjAmount(e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          placeholder="e.g. 50"
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Reason</Label>
                      <Textarea
                        value={modalAdjReason}
                        onChange={(e) => setModalAdjReason(e.target.value)}
                        placeholder="Why are we adjusting the base amount?"
                        className="mt-1 min-h-[60px]"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const amt = Number(modalAdjAmount);
                        if (!Number.isFinite(amt) || amt <= 0) { toast.error('Adjustment amount must be greater than 0.'); return; }
                        if (!modalAdjReason.trim()) { toast.error('Please provide a reason for the adjustment.'); return; }
                        const base = Number(vendorPaymentBaseAmount) || 0;
                        const next: VendorPaymentAdjustment[] = [
                          ...modalAdjustments,
                          {
                            id: (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}`,
                            type: modalAdjType,
                            amount: amt,
                            reason: modalAdjReason.trim(),
                            createdAt: serverTimestamp() as any,
                            createdBy: {
                              uid: auth.currentUser?.uid ?? 'unknown',
                              email: auth.currentUser?.email ?? '',
                              role: 'admin' as const,
                            },
                          },
                        ];
                        const { finalAmount } = computeTotals(base, next);
                        if (finalAmount < 0) { toast.error('Final amount cannot be negative.'); return; }
                        setModalAdjustments(next);
                        setModalAdjAmount('');
                        setModalAdjReason('');
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add adjustment
                    </Button>

                    {modalAdjustments.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="text-xs font-medium text-muted-foreground">Adjustments to be saved</div>
                        {modalAdjustments.map((a, i) => {
                          const signed = a.type === 'decrease' ? -Math.abs(a.amount) : Math.abs(a.amount);
                          return (
                            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5">
                              <div className="min-w-0">
                                <div className="text-sm text-foreground truncate">{a.reason}</div>
                                <div className="text-xs text-muted-foreground capitalize">{a.type}</div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-sm font-semibold ${signed >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                  {signed >= 0 ? '+' : '−'}{formatMoney(Math.abs(signed), 'USD')}
                                </span>
                                <button
                                  className="text-muted-foreground hover:text-red-500"
                                  onClick={() => setModalAdjustments(modalAdjustments.filter((_, idx) => idx !== i))}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Internal notes (admin only)</Label>
                    <Textarea
                      className="mt-1 min-h-[70px]"
                      value={vendorPaymentInternalNotes}
                      onChange={(e) => setVendorPaymentInternalNotes(e.target.value)}
                      placeholder="Optional internal context for accounting…"
                    />
                  </div>
                </div>
                <div className="p-6 border-t flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreateVendorPaymentModal(false)} disabled={creatingVendorPayment}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateVendorPayment} disabled={creatingVendorPayment}>
                    <Plus className="h-4 w-4 mr-2" />
                    {creatingVendorPayment ? 'Creating…' : 'Create'}
                  </Button>
                </div>
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
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Add Images</CardTitle>
                </CardHeader>
                <CardContent>
                  <label
                    htmlFor="wo-image-upload-admin"
                    className={`flex items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-dashed rounded-lg ${uploadingAttachments ? 'cursor-not-allowed border-gray-200 bg-gray-50' : 'cursor-pointer border-gray-300 hover:border-primary'}`}
                  >
                    <span className="flex items-center gap-2 text-sm text-gray-600">
                      {uploadingAttachments ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Uploading images…</>
                      ) : (
                        <><Upload className="h-4 w-4" />Click to upload images</>
                      )}
                    </span>
                    <input
                      id="wo-image-upload-admin"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={uploadingAttachments}
                      onChange={(e) => {
                        handleUploadAttachmentImages(e.target.files);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                </CardContent>
              </Card>
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
              {(!workOrder.images || workOrder.images.length === 0) && (!workOrder.completionImages || workOrder.completionImages.length === 0) && (
                <div className="text-center py-8">
                  <Paperclip className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No attachments uploaded yet. Use the upload card above to add images.</p>
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
                      {quotes.map(quote => {
                        const displayAmount = quote.clientAmount || quote.totalAmount || 0;
                        const isAccepted = quote.status === 'accepted';
                        const canAssign = !['assigned', 'accepted_by_subcontractor', 'pending_invoice', 'completed'].includes(workOrder.status);
                        const canShare = workOrder.status === 'quotes_received' && quote.status !== 'accepted' && quote.status !== 'rejected';
                        const statusLabels: Record<string, string> = { pending: 'Pending', sent_to_client: 'Sent to Client', accepted: 'Accepted', rejected: 'Rejected' };
                        const statusColors: Record<string, string> = { pending: 'text-yellow-600', sent_to_client: 'text-blue-600', accepted: 'text-green-600', rejected: 'text-red-600' };
                        return (
                        <div key={quote.id} className={`p-4 border rounded-lg hover:bg-muted/30 transition-colors ${isAccepted ? 'border-green-300 bg-green-50/30' : ''} ${selectedQuoteIds.includes(quote.id) ? 'bg-primary/5 border-primary/30' : ''}`}>
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
                                <p className="text-2xl font-bold text-primary">${displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                {quote.clientAmount && quote.markupPercentage != null && (
                                  <p className="text-xs text-muted-foreground">incl. {quote.markupPercentage}% markup</p>
                                )}
                                <p className={`text-xs font-medium capitalize ${statusColors[quote.status] || 'text-muted-foreground'}`}>{statusLabels[quote.status] || quote.status}</p>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t flex flex-col gap-2">
                            <Button size="sm" variant="outline" className="w-full" onClick={() => setViewQuoteDetail(quote)}>
                              <Eye className="h-3.5 w-3.5 mr-2" />
                              View Full Quote
                            </Button>
                            {canShare && (
                              <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => { setShareQuote(quote); setShareMarkup(String(quote.markupPercentage || 20)); setShowShareModal(true); }}>
                                <Share2 className="h-3.5 w-3.5 mr-2" />
                                {quote.status === 'sent_to_client' ? 'Resend to Client' : 'Share Quote with Client'}
                              </Button>
                            )}
                            {isAccepted && canAssign && (
                              <Button size="sm" className="w-full bg-green-600 hover:bg-green-700" onClick={() => openAssignModal(quote)}>
                                <UserPlus className="h-3.5 w-3.5 mr-2" />
                                Assign to Subcontractor
                              </Button>
                            )}
                          </div>
                        </div>
                        );
                      })}
                      {quotes.length >= 2 && selectedQuoteIds.length >= 2 && (
                        <Button onClick={handleCompareQuotes} className="w-full">
                          <GitCompare className="h-4 w-4 mr-2" />Compare {selectedQuoteIds.length} Quotes
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
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/admin-portal/invoices/${inv.id}`}>View Invoice</Link>
                            </Button>
                          </div>
                        </div>
                      ))}
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
      {/* View Quote Detail Modal */}
      {viewQuoteDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg shadow-lg max-w-2xl w-full my-4">
            <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-card z-10">
              <div>
                <h2 className="text-lg font-semibold">{viewQuoteDetail.subcontractorName}</h2>
                <p className="text-xs text-muted-foreground">{viewQuoteDetail.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${{ pending: 'text-yellow-600 bg-yellow-50', sent_to_client: 'text-blue-600 bg-blue-50', accepted: 'text-green-600 bg-green-50', rejected: 'text-red-600 bg-red-50' }[viewQuoteDetail.status] || 'text-muted-foreground bg-muted'}`}>
                  {{ pending: 'Pending', sent_to_client: 'Sent to Client', accepted: 'Accepted', rejected: 'Rejected' }[viewQuoteDetail.status] || viewQuoteDetail.status}
                </span>
                <Button variant="outline" size="sm" onClick={() => setViewQuoteDetail(null)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Amounts */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs text-muted-foreground mb-0.5">Subcontractor Total</p><p className="font-semibold text-base">${(viewQuoteDetail.totalAmount || 0).toFixed(2)}</p></div>
                {viewQuoteDetail.clientAmount != null && (
                  <div><p className="text-xs text-muted-foreground mb-0.5">Client Amount {viewQuoteDetail.markupPercentage != null ? `(${viewQuoteDetail.markupPercentage}% markup)` : ''}</p><p className="font-semibold text-base text-blue-600">${viewQuoteDetail.clientAmount.toFixed(2)}</p></div>
                )}
              </div>
              {/* Client-facing line items */}
              {viewQuoteDetail.clientLineItems && viewQuoteDetail.clientLineItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Line Items — Client View ({viewQuoteDetail.markupPercentage ?? 0}% markup)</p>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-muted text-muted-foreground text-xs uppercase"><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2 text-right">Unit Price</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                      <tbody>
                        {viewQuoteDetail.clientLineItems.map((item, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-3 py-2">{item.description}</td>
                            <td className="px-3 py-2 text-center">{item.quantity.toFixed(1)}</td>
                            <td className="px-3 py-2 text-right">${item.unitPrice.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium">${item.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-right text-sm font-semibold text-blue-600">Client Total: ${(viewQuoteDetail.clientAmount || 0).toFixed(2)}</div>
                </div>
              )}
              {/* Original subcontractor line items */}
              {viewQuoteDetail.lineItems && viewQuoteDetail.lineItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{viewQuoteDetail.clientLineItems?.length ? 'Original Subcontractor Quote' : 'Line Items'}</p>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-muted text-muted-foreground text-xs uppercase"><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2 text-right">Unit Price</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                      <tbody>
                        {viewQuoteDetail.lineItems.map((item, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-3 py-2">{item.description}</td>
                            <td className="px-3 py-2 text-center">{item.quantity.toFixed(1)}</td>
                            <td className="px-3 py-2 text-right">${item.unitPrice.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium">${item.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-right text-sm font-semibold">Total: ${(viewQuoteDetail.totalAmount || 0).toFixed(2)}</div>
                </div>
              )}
              {viewQuoteDetail.notes && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-3">{viewQuoteDetail.notes}</p>
                </div>
              )}
              {/* Actions */}
              <div className="border-t pt-4 flex flex-col gap-2">
                {viewQuoteDetail.status !== 'accepted' && viewQuoteDetail.status !== 'rejected' && workOrder.status === 'quotes_received' && (
                  <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => { setShareQuote(viewQuoteDetail); setShareMarkup(String(viewQuoteDetail.markupPercentage || 20)); setShowShareModal(true); setViewQuoteDetail(null); }}>
                    <Share2 className="h-4 w-4 mr-2" />
                    {viewQuoteDetail.status === 'sent_to_client' ? 'Resend to Client' : 'Share with Client'}
                  </Button>
                )}
                {viewQuoteDetail.status === 'accepted' && !['assigned', 'accepted_by_subcontractor', 'pending_invoice', 'completed'].includes(workOrder.status) && (
                  <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => { openAssignModal(viewQuoteDetail); setViewQuoteDetail(null); }}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign to Subcontractor
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showShareModal && shareQuote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg shadow-lg max-w-lg w-full my-4">
            <div className="p-5 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Share Quote with Client</h2>
              <Button variant="outline" size="sm" onClick={() => setShowShareModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                Sharing quote from <strong>{shareQuote.subcontractorName}</strong> — subcontractor total: <strong>${(shareQuote.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
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
              </div>
              {/* Real-time line items preview */}
              {shareQuote.lineItems && shareQuote.lineItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Client will see</p>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted text-muted-foreground text-xs uppercase">
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-3 py-2 text-center">Qty</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shareQuote.lineItems.map((item: any, idx: number) => {
                          const factor = 1 + (parseFloat(shareMarkup) || 0) / 100;
                          return (
                            <tr key={idx} className="border-t border-border">
                              <td className="px-3 py-2">{item.description}</td>
                              <td className="px-3 py-2 text-center">{(item.quantity || 1).toFixed(1)}</td>
                              <td className="px-3 py-2 text-right">${(item.unitPrice * factor).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-medium">${(item.amount * factor).toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex justify-between items-center text-sm font-semibold border-t pt-2">
                    <span>Client Total</span>
                    <span className="text-blue-600">${(shareQuote.totalAmount * (1 + (parseFloat(shareMarkup) || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
              {(!shareQuote.lineItems || shareQuote.lineItems.length === 0) && shareMarkup && (
                <p className="text-sm font-semibold">
                  Client will see: <span className="text-blue-600">${(shareQuote.totalAmount * (1 + (parseFloat(shareMarkup) || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </p>
              )}
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

      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}
    </AdminLayout>
  );
}
