'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, addDoc, where, deleteDoc, getDoc, Timestamp, orderBy, writeBatch } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { notifyClientOfWorkOrderApproval, notifyBiddingOpportunity, notifyClientOfInvoice, notifyScheduledService } from '@/lib/notifications';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CheckCircle, XCircle, Share2, UserPlus, ClipboardList, FileText, Image as ImageIcon, Plus, Edit2, Save, X, Search, Trash2, Eye, Receipt, Upload, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Archive } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useViewControls } from '@/contexts/view-controls-context';
import { createTimelineEvent, createInvoiceTimelineEvent } from '@/lib/timeline';
import { getWorkOrderClientDisplayName } from '@/lib/appy-client';
import { subcontractorAuthId } from '@/lib/subcontractor-ids';
import { generateInvoiceNumber } from '@/lib/invoice-number';

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  appyRequestor?: string; // APPY Requestor field - stores the requestor from maintenance API requests
  companyId?: string;
  companyName?: string;
  locationId: string;
  locationName?: string;
  locationAddress?: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  estimateBudget?: number;
  status: 'pending' | 'approved' | 'rejected' | 'bidding' | 'quotes_received' | 'to_be_started' | 'assigned' | 'pending_invoice' | 'completed' | 'accepted_by_subcontractor' | 'rejected_by_subcontractor' | 'archived';
  images: string[];
  assignedTo?: string;
  assignedToName?: string;
  /** Set when assigned via quote approval or admin assign-from-quote (auth uid or subcontractor doc id per quote flow). */
  assignedSubcontractor?: string;
  assignedSubcontractorName?: string;
  scheduledServiceDate?: any;
  scheduledServiceTime?: string;
  scheduleSharedWithClient?: boolean;
  createdAt: any;
  quoteCount?: number;
  hasInvoice?: boolean;
  isMaintenanceRequestOrder?: boolean;
}

interface Client {
  id: string;
  fullName: string;
  email: string;
}

interface Location {
  id: string;
  clientId: string;
  companyId?: string;
  locationName: string;
  address: {
    street: string;
    city: string;
    state: string;
  };
}

interface Company {
  id: string;
  clientId?: string;
  name: string;
}

interface Subcontractor {
  id: string;
  uid: string;
  fullName: string;
  email: string;
  businessName?: string;
  city?: string;
  state?: string;
  status: 'pending' | 'approved' | 'rejected';
  matchesCategory?: boolean;
}

interface Category {
  id: string;
  name: string;
}

function WorkOrdersContent() {
  const searchParams = useSearchParams();
  const workOrderType = searchParams?.get('type') || 'all'; // 'all', 'standard', 'maintenance', or 'archive'

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'bidding' | 'quotes_received' | 'to_be_started' | 'assigned' | 'completed' | 'accepted_by_subcontractor' | 'rejected_by_subcontractor'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { viewMode, sortOption } = useViewControls();

  // Bidding modal states
  const [showBiddingModal, setShowBiddingModal] = useState(false);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedSubcontractors, setSelectedSubcontractors] = useState<string[]>([]);
  const [workOrderToShare, setWorkOrderToShare] = useState<WorkOrder | null>(null);

  // Reject modal states
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingWorkOrderId, setRejectingWorkOrderId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  
  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteProgress, setDeleteProgress] = useState('');

  // Work order type selection modal
  const [showWorkOrderTypeModal, setShowWorkOrderTypeModal] = useState(false);
  
  // Assign to subcontractor modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [workOrderToAssign, setWorkOrderToAssign] = useState<WorkOrder | null>(null);
  const [selectedSubcontractorForAssign, setSelectedSubcontractorForAssign] = useState<string>('');

  // Import modal states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);


  const [formData, setFormData] = useState({
    clientId: '',
  companyId: '',
    locationId: '',
    title: '',
    description: '',
    category: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    estimateBudget: '',
    status: 'approved' as WorkOrder['status'],
    isMaintenanceRequestOrder: false,
  });

  // Client-side pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const fetchWorkOrders = async () => {
    try {
      setLoading(true);

      // Fetch work orders, quotes, and invoices fully in parallel — eliminates the
      // previous waterfall where quotes/invoices couldn't start until all WO IDs arrived.
      const [woSnap, quotesSnap, invoicesSnap] = await Promise.all([
        getDocs(query(collection(db, 'workOrders'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'quotes')),
        getDocs(collection(db, 'invoices')),
      ]);

      const quoteCountByWoId = new Map<string, number>();
      quotesSnap.docs.forEach((d) => {
        const wid = d.data().workOrderId;
        if (wid) quoteCountByWoId.set(wid, (quoteCountByWoId.get(wid) ?? 0) + 1);
      });

      const hasInvoiceByWoId = new Set<string>(
        invoicesSnap.docs.map((d) => d.data().workOrderId).filter(Boolean)
      );

      const workOrdersData: WorkOrder[] = woSnap.docs.map((woDoc) => {
        const woData = { id: woDoc.id, ...woDoc.data() } as WorkOrder;
        woData.quoteCount = quoteCountByWoId.get(woDoc.id) ?? 0;
        woData.hasInvoice = hasInvoiceByWoId.has(woDoc.id);
        return woData;
      });

      setWorkOrders(workOrdersData);
    } catch (error) {
      console.error('Error fetching work orders:', error);
      toast.error('Failed to load work orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const clientsQuery = query(collection(db, 'clients'));
      const snapshot = await getDocs(clientsQuery);
      const clientsData = snapshot.docs.map(doc => ({
        id: doc.id,
        fullName: doc.data().fullName,
        email: doc.data().email,
      })) as Client[];
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const locationsQuery = query(collection(db, 'locations'));
      const snapshot = await getDocs(locationsQuery);
      const locationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        clientId: doc.data().clientId,
      companyId: doc.data().companyId,
        locationName: doc.data().locationName,
        address: doc.data().address,
      })) as Location[];
      setLocations(locationsData);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

const fetchCompanies = async () => {
  try {
    const companiesQuery = query(collection(db, 'companies'));
    const snapshot = await getDocs(companiesQuery);
    const companiesData = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      clientId: doc.data().clientId,
    })) as Company[];
    setCompanies(companiesData);
  } catch (error) {
    console.error('Error fetching companies:', error);
  }
};

const fetchCategories = async () => {
  try {
    const categoriesQuery = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const snapshot = await getDocs(categoriesQuery);
    const categoriesData = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
    })) as Category[];
    setCategories(categoriesData);
  } catch (error) {
    console.error('Error fetching categories:', error);
  }
};

  useEffect(() => {
    fetchWorkOrders();
    fetchClients();
    fetchLocations();
    fetchCompanies();
    fetchCategories();
  }, [workOrderType]);

  // Auto-open edit modal if editId query parameter is present
  useEffect(() => {
    const editId = searchParams?.get('editId');
    if (editId && workOrders.length > 0 && !loading) {
      const workOrderToEdit = workOrders.find(wo => wo.id === editId);
      if (workOrderToEdit) {
        handleOpenEdit(workOrderToEdit);
        // Clear the URL parameter after opening the modal
        window.history.replaceState({}, '', '/admin-portal/work-orders');
      }
    }
  }, [searchParams, workOrders, loading]);

  const handleApprove = async (workOrderId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      // Get admin user data
      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';

      // Get work order data first
      const workOrderDoc = await getDoc(doc(db, 'workOrders', workOrderId));
      if (!workOrderDoc.exists()) {
        toast.error('Work order not found');
        return;
      }
      const workOrderData = workOrderDoc.data();
      const existingTimeline = workOrderData.timeline || [];
      const existingSysInfo = workOrderData.systemInformation || {};

      // Create timeline event
      const timelineEvent = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Timestamp.now(),
        type: 'approved',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: `Work order approved by ${adminName}`,
        metadata: {
          workOrderNumber: workOrderData.workOrderNumber,
        }
      };

      // Update system information
      const updatedSysInfo = {
        ...existingSysInfo,
        approvedBy: {
          id: currentUser.uid,
          name: adminName,
          timestamp: Timestamp.now(),
        }
      };

      await updateDoc(doc(db, 'workOrders', workOrderId), {
        status: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: updatedSysInfo,
      });

      // Notify client about work order approval (in-app)
      await notifyClientOfWorkOrderApproval(
        workOrderData.clientId,
        workOrderId,
        workOrderData.workOrderNumber || workOrderId
      );

      // Send approval email to client (fire-and-forget)
      if (workOrderData.clientEmail) {
        fetch('/api/email/send-work-order-approved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            workOrderId,
            workOrderNumber: workOrderData.workOrderNumber || workOrderId,
            title: workOrderData.title,
            clientName: workOrderData.clientName,
            clientEmail: workOrderData.clientEmail,
            locationName: workOrderData.locationName,
            priority: workOrderData.priority,
          }),
        }).catch(err => console.error('Failed to send approval email:', err));
      }

      // Send WhatsApp notification to client
      try {
        const clientDoc = await getDoc(doc(db, 'clients', workOrderData.clientId));
        const clientPhone = clientDoc.data()?.phone;
        if (clientPhone) {
          await fetch('/api/whatsapp/send-approval', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toPhone: clientPhone,
              clientName: workOrderData.clientName,
              workOrderNumber: workOrderData.workOrderNumber || workOrderId,
              workOrderTitle: workOrderData.title,
            }),
          });
        }
      } catch (whatsappErr) {
        // Don't block approval if WhatsApp fails
        console.error('WhatsApp notification failed:', whatsappErr);
      }

      toast.success('Work order approved successfully');
      fetchWorkOrders();
    } catch (error) {
      console.error('Error approving work order:', error);
      toast.error('Failed to approve work order');
    }
  };

  const handleReject = (workOrderId: string) => {
    setRejectingWorkOrderId(workOrderId);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectingWorkOrderId) return;

    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason');
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';

      const workOrderDoc = await getDoc(doc(db, 'workOrders', rejectingWorkOrderId));
      const workOrderData = workOrderDoc.data();
      const existingTimeline = workOrderData?.timeline || [];
      const existingSysInfo = workOrderData?.systemInformation || {};

      const timelineEvent = createTimelineEvent({
        type: 'rejected',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: `Work order rejected by ${adminName}. Reason: ${rejectionReason}`,
        metadata: { reason: rejectionReason },
      });

      await updateDoc(doc(db, 'workOrders', rejectingWorkOrderId), {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedAt: serverTimestamp(),
        rejectionReason: rejectionReason,
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: {
          ...existingSysInfo,
          rejectedBy: {
            id: currentUser.uid,
            name: adminName,
            timestamp: Timestamp.now(),
            reason: rejectionReason,
          },
        },
      });

      toast.success('Work order rejected');
      setShowRejectModal(false);
      setRejectingWorkOrderId(null);
      setRejectionReason('');
      fetchWorkOrders();
    } catch (error) {
      console.error('Error rejecting work order:', error);
      toast.error('Failed to reject work order');
    }
  };

  const resetForm = () => {
    setFormData({
      clientId: '',
    companyId: '',
      locationId: '',
      title: '',
      description: '',
      category: '',
      priority: 'medium',
      estimateBudget: '',
      status: 'approved',
      isMaintenanceRequestOrder: false,
    });
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenCreate = () => {
    setShowWorkOrderTypeModal(true);
  };

  const handleCreateNormalWorkOrder = () => {
    resetForm();
    setFormData(prev => ({ ...prev, isMaintenanceRequestOrder: false }));
    setShowWorkOrderTypeModal(false);
    setShowModal(true);
  };

  const handleCreateMaintenanceWorkOrder = () => {
    resetForm();
    setFormData(prev => ({ ...prev, isMaintenanceRequestOrder: true }));
    setShowWorkOrderTypeModal(false);
    setShowModal(true);
  };

  const handleCreateRecurringWorkOrder = () => {
    setShowWorkOrderTypeModal(false);
    window.location.href = '/admin-portal/recurring-work-orders/create';
  };

  const handleCreateGuidedWorkOrder = () => {
    setShowWorkOrderTypeModal(false);
    window.location.href = '/admin-portal/work-orders/create/guided';
  };

const handleCompanySelect = (companyId: string) => {
  setFormData((prev) => ({
    ...prev,
    companyId,
    locationId: '',
  }));
};

const handleLocationSelect = (locationId: string) => {
  setFormData((prev) => ({
    ...prev,
    locationId,
  }));
};

  const handleSendInvoice = async (workOrder: WorkOrder) => {
    // Check if work order is completed
    if (workOrder.status !== 'completed' && workOrder.status !== 'pending_invoice') {
      toast.error('Invoice can only be generated after work order is completed');
      return;
    }

    // Check if invoice already exists
    const existingInvoiceQuery = query(
      collection(db, 'invoices'),
      where('workOrderId', '==', workOrder.id)
    );
    const existingInvoiceSnapshot = await getDocs(existingInvoiceQuery);
    if (!existingInvoiceSnapshot.empty) {
      const existingInvoice = existingInvoiceSnapshot.docs[0].data();
      if (existingInvoice.status === 'sent' || existingInvoice.status === 'paid') {
        toast.error('Invoice already sent for this work order');
        return;
      }
    }

    try {
      // Try to get amount from accepted quote first
      let invoiceAmount = 0;
      let lineItems: any[] = [];
      
      const quotesQuery = query(
        collection(db, 'quotes'),
        where('workOrderId', '==', workOrder.id),
        where('status', '==', 'accepted')
      );
      const quotesSnapshot = await getDocs(quotesQuery);
      
      if (!quotesSnapshot.empty) {
        // Use accepted quote amount
        const acceptedQuote = quotesSnapshot.docs[0].data();
        const quoteAmount = Number(acceptedQuote.clientAmount ?? acceptedQuote.totalAmount ?? 0);
        
        // Only use quote amount if it's valid (> 0)
        if (Number.isFinite(quoteAmount) && quoteAmount > 0) {
          invoiceAmount = quoteAmount;
          lineItems = acceptedQuote.lineItems || [{
            description: workOrder.title,
            quantity: 1,
            unitPrice: invoiceAmount,
            amount: invoiceAmount,
          }];
        }
      }
      
      // If no valid quote amount, fall back to estimated budget
      if (!invoiceAmount || invoiceAmount <= 0) {
        invoiceAmount = Number(workOrder.estimateBudget ?? 0);
        lineItems = [{
          description: workOrder.title,
          quantity: 1,
          unitPrice: invoiceAmount,
          amount: invoiceAmount,
        }];
      }

      // If still no amount, show error
      if (!invoiceAmount || invoiceAmount <= 0) {
        toast.error('Cannot create invoice: Work order must have an estimated budget or an accepted quote with an amount');
        return;
      }

      const invoiceNumber = generateInvoiceNumber();
      const currentUser = auth.currentUser;
      const adminName = currentUser ? (await getDoc(doc(db, 'adminUsers', currentUser.uid))).data()?.fullName : 'Admin';
      const createdEvent = createInvoiceTimelineEvent({
        type: 'created',
        userId: currentUser?.uid || 'system',
        userName: adminName,
        userRole: 'admin',
        details: `Invoice created from work order ${workOrder.workOrderNumber}`,
        metadata: { source: 'admin_portal', workOrderNumber: workOrder.workOrderNumber },
      });
      // Create invoice data
      const invoiceData: any = {
        invoiceNumber,
        workOrderId: workOrder.id,
        workOrderTitle: workOrder.title,
        clientId: workOrder.clientId,
        clientName: getWorkOrderClientDisplayName(workOrder),
        clientEmail: workOrder.clientEmail,
        status: 'draft' as const,
        totalAmount: invoiceAmount,
        lineItems: lineItems,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        notes: `Invoice for completed work order: ${workOrder.workOrderNumber}`,
        createdBy: currentUser?.uid,
        creationSource: 'admin_portal',
        timeline: [createdEvent],
        systemInformation: {
          createdBy: {
            id: currentUser?.uid || 'system',
            name: adminName,
            role: 'admin',
            timestamp: Timestamp.now(),
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Subcontractor on WO may be stored as assignedTo* (legacy/manual) or assignedSubcontractor* (quote path).
      const subId = workOrder.assignedSubcontractor || workOrder.assignedTo;
      const subName = workOrder.assignedSubcontractorName || workOrder.assignedToName;
      if (subId) {
        invoiceData.subcontractorId = subId;
      }
      if (subName) {
        invoiceData.subcontractorName = subName;
      }

      // Add quote reference if we used a quote
      if (!quotesSnapshot.empty) {
        invoiceData.quoteId = quotesSnapshot.docs[0].id;
      }

      if (!workOrder.clientEmail) {
        toast.error('Cannot create invoice: Client email is missing');
        return;
      }

      // Create invoice in Firestore
      const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);

      // ── Auto-charge check ────────────────────────────────────────────────
      // If the client has an active Fixed Auto-Charge Plan and the invoice
      // amount matches the plan amount, auto-charge and mark WO as completed.
      const clientDoc = await getDoc(doc(db, 'clients', workOrder.clientId));
      const clientData = clientDoc.exists() ? clientDoc.data() : null;
      const planAmount = Number(clientData?.subscriptionAmount);
      const planActive =
        clientData?.stripeSubscriptionId &&
        clientData?.subscriptionStatus === 'active' &&
        clientData?.defaultPaymentMethodId;

      if (
        planActive &&
        Number.isFinite(planAmount) &&
        planAmount > 0 &&
        Math.abs(planAmount - invoiceAmount) < 0.01
      ) {
        // Amounts match — attempt auto-charge
        const autoChargeResp = await fetch('/api/stripe/charge-saved-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: invoiceRef.id, clientId: workOrder.clientId }),
        });
        const autoChargeData = await autoChargeResp.json();

        if (autoChargeResp.ok && autoChargeData.status === 'succeeded') {
          // Mark work order as completed
          const woDocSnap = await getDoc(doc(db, 'workOrders', workOrder.id));
          const woData = woDocSnap.data();
          await updateDoc(doc(db, 'workOrders', workOrder.id), {
            status: 'completed',
            hasInvoice: true,
            updatedAt: serverTimestamp(),
            timeline: [...(woData?.timeline || []), createTimelineEvent({
              type: 'invoice_paid',
              userId: currentUser?.uid || 'system',
              userName: adminName,
              userRole: 'admin',
              details: `Invoice ${invoiceNumber} auto-charged (Fixed Auto-Charge Plan — $${invoiceAmount.toFixed(2)})`,
              metadata: { invoiceId: invoiceRef.id, invoiceNumber, amount: invoiceAmount },
            })],
          });
          toast.success(`Invoice auto-charged ($${invoiceAmount.toFixed(2)}) using Fixed Auto-Charge Plan. Work order marked as completed.`);
          fetchWorkOrders();
          return;
        } else {
          // Auto-charge failed — fall through to manual payment flow
          console.warn('Auto-charge failed:', autoChargeData);
          toast.warning('Auto-charge failed. Sending invoice to client for manual payment.');
        }
      }
      // ── End auto-charge check ────────────────────────────────────────────

      // Generate PDF
      const { generateInvoicePDF } = await import('@/lib/pdf-generator');
      const pdf = generateInvoicePDF({
        invoiceNumber: invoiceData.invoiceNumber,
        clientName: invoiceData.clientName,
        clientEmail: invoiceData.clientEmail,
        workOrderName: workOrder.title,
        vendorName: workOrder.assignedSubcontractorName || workOrder.assignedToName || undefined,
        serviceDescription: workOrder.description,
        lineItems: invoiceData.lineItems,
        subtotal: invoiceData.totalAmount,
        discountAmount: 0,
        totalAmount: invoiceData.totalAmount,
        dueDate: invoiceData.dueDate.toLocaleDateString(),
        notes: invoiceData.notes,
      });
      const pdfBase64 = pdf.output('dataurlstring').split(',')[1];

      // Create Stripe payment link
      const stripeResponse = await fetch('/api/stripe/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoiceRef.id,
          invoiceNumber: invoiceNumber,
          amount: invoiceData.totalAmount,
          customerEmail: workOrder.clientEmail || invoiceData.clientEmail,
          clientName: getWorkOrderClientDisplayName(workOrder) || invoiceData.clientName,
          clientId: workOrder.clientId || invoiceData.clientId,
        }),
      });

      const stripeData = await stripeResponse.json();

      // Check if Stripe payment link creation was successful
      if (!stripeResponse.ok || !stripeData.paymentLink) {
        console.error('Stripe payment link creation failed:', stripeData);
        toast.error(`Failed to create payment link: ${stripeData.error || 'Unknown error'}`);
        // Still update invoice but without payment link
        await updateDoc(invoiceRef, {
          status: 'draft',
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const stripePaymentLink = stripeData.paymentLink;
      const sentEvent = createInvoiceTimelineEvent({
        type: 'sent',
        userId: currentUser?.uid || 'system',
        userName: adminName,
        userRole: 'admin',
        details: 'Invoice sent to client with payment link',
        metadata: { invoiceNumber },
      });
      const invSnap = await getDoc(invoiceRef);
      const invData = invSnap.data();
      const existingTimeline = invData?.timeline || [];
      const existingSysInfo = invData?.systemInformation || {};
      // Update invoice with payment link
      await updateDoc(invoiceRef, {
        stripePaymentLink,
        status: 'sent',
        sentAt: serverTimestamp(),
        timeline: [...existingTimeline, sentEvent],
        systemInformation: {
          ...existingSysInfo,
          sentBy: {
            id: currentUser?.uid || 'system',
            name: adminName,
            timestamp: Timestamp.now(),
          },
        },
        updatedAt: serverTimestamp(),
      });

      // Notify client of invoice
      await notifyClientOfInvoice(
        workOrder.clientId,
        invoiceRef.id,
        invoiceNumber,
        workOrder.workOrderNumber || workOrder.id,
        invoiceData.totalAmount
      );

      // Format due date
      const formattedDueDate = new Date(invoiceData.dueDate).toLocaleDateString();

      // Send email with invoice
      const emailResponse = await fetch('/api/email/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: workOrder.clientEmail,
          toName: getWorkOrderClientDisplayName(workOrder),
          invoiceNumber,
          workOrderTitle: workOrder.title,
          totalAmount: invoiceData.totalAmount,
          dueDate: formattedDueDate,
          lineItems: invoiceData.lineItems,
          notes: invoiceData.notes,
          stripePaymentLink,
          pdfBase64,
          subcontractorId: (workOrder as any).assignedTo || (workOrder as any).subcontractorId || undefined,
        }),
      });

      const emailResult = await emailResponse.json();

      // Add timeline event for invoice sent (currentUser and adminName from above)
      if (currentUser) {
        const woDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
        const woData = woDoc.data();
        const existingTimeline = woData?.timeline || [];
        const existingSysInfo = woData?.systemInformation || {};

        await updateDoc(doc(db, 'workOrders', workOrder.id), {
          hasInvoice: true,
          timeline: [...existingTimeline, createTimelineEvent({
            type: 'invoice_sent',
            userId: currentUser.uid,
            userName: adminName,
            userRole: 'admin',
            details: `Invoice ${invoiceNumber} sent to ${getWorkOrderClientDisplayName(workOrder)} by ${adminName}`,
            metadata: { invoiceNumber, totalAmount: invoiceData.totalAmount },
          })],
          systemInformation: {
            ...existingSysInfo,
            invoicing: { sentAt: Timestamp.now(), sentBy: { id: currentUser.uid, name: adminName } },
          },
        });
      }

      if (emailResult.success) {
        toast.success('Invoice created and sent successfully!');
      } else {
        toast.warning('Invoice created successfully, but email notification failed. Client can view it in their portal.');
      }

      // Refresh work orders
      fetchWorkOrders();
    } catch (error) {
      console.error('Error sending invoice:', error);
      toast.error('Failed to send invoice');
    }
  };

  const handleShareScheduleWithClient = async (workOrder: WorkOrder) => {
    if (!workOrder.scheduledServiceDate || !workOrder.scheduledServiceTime) {
      toast.error('No scheduled service date/time found');
      return;
    }

    try {
      // Get admin info and existing timeline
      const currentUser = auth.currentUser;
      let schedAdminName = 'Admin';
      if (currentUser) {
        const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
        schedAdminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';
      }
      const woDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const woData = woDoc.data();
      const existingTimeline = woData?.timeline || [];
      const existingSysInfo = woData?.systemInformation || {};

      const serviceDate = workOrder.scheduledServiceDate?.toDate?.() || new Date(workOrder.scheduledServiceDate);
      const formattedDate = serviceDate.toLocaleDateString();
      const formattedTime = workOrder.scheduledServiceTime || 'N/A';

      // Update work order to mark schedule as shared
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        scheduleSharedWithClient: true,
        scheduleSharedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, createTimelineEvent({
          type: 'schedule_shared',
          userId: currentUser?.uid || 'unknown',
          userName: schedAdminName,
          userRole: 'admin',
          details: `Service schedule shared with client by ${schedAdminName} (${formattedDate} at ${formattedTime})`,
          metadata: { serviceDate: formattedDate, serviceTime: formattedTime },
        })],
        systemInformation: {
          ...existingSysInfo,
          scheduledService: {
            ...(existingSysInfo.scheduledService || {}),
            sharedWithClientAt: Timestamp.now(),
          },
        },
      });

      // Notify client about scheduled service

      await notifyScheduledService(
        workOrder.clientId,
        workOrder.id,
        workOrder.title,
        formattedDate,
        formattedTime
      );

      toast.success('Schedule shared with client successfully!');
      fetchWorkOrders();
    } catch (error) {
      console.error('Error sharing schedule with client:', error);
      toast.error('Failed to share schedule with client');
    }
  };

  const handleAssignToSubcontractor = async (workOrder: WorkOrder) => {
    try {
      // Get all approved subcontractors
      const subsQuery = query(
        collection(db, 'subcontractors'),
        where('status', '==', 'approved')
      );
      const subsSnapshot = await getDocs(subsQuery);

      if (subsSnapshot.empty) {
        toast.error('No approved subcontractors found');
        return;
      }

      // Map subcontractors data
      const subsData = subsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          uid: data.uid || doc.id, // Use uid if exists, otherwise use doc.id
          fullName: data.fullName,
          email: data.email,
          businessName: data.businessName,
          status: data.status,
        };
      }) as Subcontractor[];

      setSubcontractors(subsData);
      setWorkOrderToAssign(workOrder);
      setSelectedSubcontractorForAssign('');
      setShowAssignModal(true);
    } catch (error) {
      console.error('Error loading subcontractors:', error);
      toast.error('Failed to load subcontractors');
    }
  };

  const handleFilePreview = async (file: File) => {
    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      
      if (fileExtension === 'csv') {
        // Handle CSV file with proper parsing for quoted values
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          toast.error('CSV file is empty');
          return;
        }
        
        // Simple CSV parser that handles quoted values
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
              } else {
                // Toggle quote state
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              // End of field
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          
          // Add last field
          result.push(current.trim());
          return result;
        };
        
        // Parse header
        const header = parseCSVLine(lines[0]);
        
        // Parse data rows
        const data = lines.slice(1).map(line => {
          const values = parseCSVLine(line);
          const row: any = {};
          header.forEach((h, idx) => {
            row[h] = values[idx] || '';
          });
          return row;
        }).filter(row => {
          // Filter out completely empty rows
          return row && Object.keys(row).length > 0 && Object.values(row).some(v => 
            v !== null && v !== undefined && String(v).trim() !== ''
          );
        });
        
        setImportPreview(data);
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Handle Excel file
        try {
          const XLSX = await import('xlsx');
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          
          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            toast.error('Excel file has no sheets');
            setImportPreview([]);
            return;
          }
          
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          if (!worksheet) {
            toast.error('Could not read Excel sheet');
            setImportPreview([]);
            return;
          }
          
          const data = XLSX.utils.sheet_to_json(worksheet);
          
          if (!data || data.length === 0) {
            toast.error('Excel file has no data rows');
            setImportPreview([]);
            return;
          }
          
          setImportPreview(data as any[]);
        } catch (xlsxError: any) {
          console.error('Error reading Excel file:', xlsxError);
          toast.error(`Failed to read Excel file: ${xlsxError.message || 'Unknown error'}`);
          setImportPreview([]);
        }
      } else {
        toast.error('Unsupported file format. Please use CSV, XLSX, or XLS files.');
        setImportPreview([]);
      }
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error('Failed to read file. Please ensure it is a valid CSV or XLSX file.');
      setImportPreview([]);
    }
  };

  const handleImportWorkOrders = async () => {
    if (!importFile || importPreview.length === 0) {
      toast.error('Please select a valid file');
      return;
    }

    setImporting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('You must be logged in to import work orders');
        return;
      }

      // Get admin user data
      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Batched writes — commit every 499 ops (Firestore limit is 500)
      let currentBatch = writeBatch(db);
      let batchOpCount = 0;

      // Process each row
      for (let i = 0; i < importPreview.length; i++) {
        const row = importPreview[i];
        
        // Skip empty rows
        if (!row || Object.keys(row).length === 0 || !Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '')) {
          continue;
        }
        
        try {
          // Map CSV fields to work order fields (handle case-insensitive and variations)
          const getFieldValue = (fieldName: string, variations: string[]): string => {
            for (const variation of variations) {
              const value = row[variation];
              if (value !== undefined && value !== null && value !== '') {
                return String(value).trim();
              }
            }
            return '';
          };

          const restaurant = getFieldValue('RESTAURANT', ['RESTAURANT', 'restaurant', 'Restaurant', 'RESTAURANT NAME', 'Restaurant Name']);
          const serviceType = getFieldValue('SERVICE TYPE', ['SERVICE TYPE', 'service type', 'Service Type', 'SERVICE_TYPE', 'ServiceType']);
          const lastServiced = getFieldValue('LAST SERVICED', ['LAST SERVICED', 'last serviced', 'Last Serviced', 'LAST_SERVICED', 'LastServiced']);
          
          // Handle multiple "NEXT SERVICE NEEDED BY" columns - get the first non-empty one
          const nextServiceVariations = ['NEXT SERVICE NEEDED BY', 'next service needed by', 'Next Service Needed By', 'NEXT_SERVICE_NEEDED_BY', 'NextServiceNeededBy'];
          let nextServiceNeededBy = '';
          for (const variation of nextServiceVariations) {
            const value = row[variation];
            if (value !== undefined && value !== null && value !== '') {
              nextServiceNeededBy = String(value).trim();
              break;
            }
          }
          // Also check for numbered variations (NEXT SERVICE NEEDED BY 1, NEXT SERVICE NEEDED BY 2, etc.)
          if (!nextServiceNeededBy) {
            for (let j = 1; j <= 5; j++) {
              const numberedVariation = `NEXT SERVICE NEEDED BY ${j}`;
              const value = row[numberedVariation] || row[numberedVariation.toLowerCase()] || row[numberedVariation.replace(/\s/g, '')];
              if (value !== undefined && value !== null && value !== '') {
                nextServiceNeededBy = String(value).trim();
                break;
              }
            }
          }
          
          const frequencyLabel = getFieldValue('FREQUENCY LABEL', ['FREQUENCY LABEL', 'frequency label', 'Frequency Label', 'FREQUENCY_LABEL', 'FrequencyLabel']);
          const scheduling = getFieldValue('SCHEDULING', ['SCHEDULING', 'scheduling', 'Scheduling']);
          const notes = getFieldValue('NOTES', ['NOTES', 'notes', 'Notes', 'NOTES/DESCRIPTION', 'Notes/Description']);

          // Skip rows with no restaurant/client name
          if (!restaurant || restaurant.trim() === '') {
            // Skip silently - might be an empty row
            continue;
          }

          // Find client by restaurant name (improved matching)
          const restaurantLower = restaurant.toLowerCase().trim();
          const client = clients.find(c => {
            const clientNameLower = c.fullName.toLowerCase().trim();
            // Exact match
            if (clientNameLower === restaurantLower) return true;
            // Contains match (either direction)
            if (clientNameLower.includes(restaurantLower) || restaurantLower.includes(clientNameLower)) return true;
            // Check if restaurant name matches any part of client name (for cases like "Restaurant Name - Location")
            const clientParts = clientNameLower.split(/[\s\-_]+/);
            const restaurantParts = restaurantLower.split(/[\s\-_]+/);
            return restaurantParts.some(part => clientParts.includes(part)) || clientParts.some(part => restaurantParts.includes(part));
          });

          if (!client) {
            errorCount++;
            errors.push(`Row ${i + 1}: Client "${restaurant}" not found. Available clients: ${clients.map(c => c.fullName).join(', ')}`);
            continue;
          }

          // Find or use category
          let category = serviceType;
          const categoryExists = categories.find(c => c.name.toLowerCase() === serviceType.toLowerCase());
          if (!categoryExists && serviceType) {
            // Use the service type as category name even if it doesn't exist in categories
            category = serviceType;
          } else if (categoryExists) {
            category = categoryExists.name;
          } else {
            category = 'General Maintenance'; // Default category
          }

          // Find a location for this client (use first available location)
          const clientLocations = locations.filter(l => l.clientId === client.id);
          if (clientLocations.length === 0) {
            errorCount++;
            errors.push(`Row ${i + 1}: No location found for client "${restaurant}"`);
            continue;
          }

          const location = clientLocations[0];
          const companyId = location.companyId || '';

          // Parse dates (handle Excel serial dates and various formats)
          let lastServicedDate: any = null;
          let nextServiceDate: any = null;

          const parseDate = (dateValue: string | number): Date | null => {
            if (!dateValue) return null;
            
            // Handle Excel serial date (number)
            if (typeof dateValue === 'number') {
              // Excel serial date: days since January 1, 1900
              const excelEpoch = new Date(1900, 0, 1);
              excelEpoch.setDate(excelEpoch.getDate() + dateValue - 2); // -2 because Excel incorrectly treats 1900 as a leap year
              return excelEpoch;
            }
            
            // Handle string dates
            const dateStr = String(dateValue).trim();
            if (!dateStr) return null;
            
            // Try parsing as-is
            let parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              return parsed;
            }
            
            // Try common date formats
            const formats = [
              /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY
              /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
              /(\d{1,2})-(\d{1,2})-(\d{4})/, // MM-DD-YYYY
            ];
            
            for (const format of formats) {
              const match = dateStr.match(format);
              if (match) {
                if (format === formats[0]) {
                  // MM/DD/YYYY
                  parsed = new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
                } else if (format === formats[1]) {
                  // YYYY-MM-DD
                  parsed = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
                } else {
                  // MM-DD-YYYY
                  parsed = new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
                }
                if (!isNaN(parsed.getTime())) {
                  return parsed;
                }
              }
            }
            
            return null;
          };

          if (lastServiced) {
            const parsedDate = parseDate(lastServiced);
            if (parsedDate) {
              lastServicedDate = Timestamp.fromDate(parsedDate);
            }
          }

          if (nextServiceNeededBy) {
            const parsedDate = parseDate(nextServiceNeededBy);
            if (parsedDate) {
              nextServiceDate = Timestamp.fromDate(parsedDate);
            }
          }

          // Create work order with unique work order number
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
          const workOrderNumber = `WO-${timestamp.toString().slice(-8).toUpperCase()}-${randomSuffix}-${i}`;
          const workOrderData: any = {
            workOrderNumber,
            clientId: client.id,
            clientName: client.fullName,
            clientEmail: client.email,
            locationId: location.id,
            locationName: location.locationName,
            locationAddress: location.address && typeof location.address === 'object' 
              ? `${location.address.street || ''}, ${location.address.city || ''}, ${location.address.state || ''}`.replace(/^,\s*|,\s*$/g, '').trim()
              : (location.address || 'N/A'),
            title: serviceType || 'Maintenance Service',
            description: notes || `Service for ${restaurant}. Last serviced: ${lastServiced || 'N/A'}. Next service needed by: ${nextServiceNeededBy || 'N/A'}. Frequency: ${frequencyLabel || 'N/A'}. Scheduling: ${scheduling || 'N/A'}.`,
            category: category,
            priority: 'medium' as 'low' | 'medium' | 'high',
            status: 'approved' as WorkOrder['status'],
            images: [],
            isMaintenanceRequestOrder: true,
            createdAt: serverTimestamp(),
            // Store all imported fields
            importedFromCSV: true,
            importFileName: importFile.name,
            importDate: serverTimestamp(),
            importReference: {
              fileName: importFile.name,
              importedBy: currentUser.uid,
              importedByName: adminName,
              importedAt: serverTimestamp(),
            },
            // Store original CSV fields
            csvFields: {
              restaurant: restaurant,
              serviceType: serviceType,
              lastServiced: lastServiced,
              nextServiceNeededBy: nextServiceNeededBy,
              frequencyLabel: frequencyLabel,
              scheduling: scheduling,
              notes: notes,
            },
            lastServiced: lastServicedDate,
            nextServiceNeededBy: nextServiceDate,
            frequencyLabel: frequencyLabel,
            scheduling: scheduling,
          };

          if (companyId) {
            const company = companies.find(c => c.id === companyId);
            if (company) {
              workOrderData.companyId = company.id;
              workOrderData.companyName = company.name;
            }
          }

          // Add timeline event for CSV import
          workOrderData.timeline = [createTimelineEvent({
            type: 'created',
            userId: currentUser.uid,
            userName: adminName,
            userRole: 'admin',
            details: `Work order created by ${adminName} via CSV import from ${importFile.name}`,
            metadata: { source: 'csv_import', fileName: importFile.name },
          })];
          workOrderData.systemInformation = {
            createdBy: {
              id: currentUser.uid,
              name: adminName,
              role: 'admin',
              timestamp: Timestamp.now(),
            },
          };

          // Collect into current batch (batch.set requires a pre-generated ref)
          const newRef = doc(collection(db, 'workOrders'));
          currentBatch.set(newRef, workOrderData);
          batchOpCount++;
          successCount++;

          // Commit and start a new batch every 499 ops
          if (batchOpCount >= 499) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            batchOpCount = 0;
          }
        } catch (error: any) {
          errorCount++;
          errors.push(`Row ${i + 1}: ${error.message || 'Unknown error'}`);
          console.error(`Error importing row ${i + 1}:`, error);
        }
      }

      // Commit any remaining ops
      if (batchOpCount > 0) {
        await currentBatch.commit();
      }

      if (successCount > 0) {
        toast.success(`Successfully imported ${successCount} work order(s)`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to import ${errorCount} work order(s). Check console for details.`);
        console.error('Import errors:', errors);
      }

      // Reset and close modal
      setShowImportModal(false);
      setImportFile(null);
      setImportPreview([]);
      // Reset file input
      const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      fetchWorkOrders();
    } catch (error: any) {
      console.error('Error importing work orders:', error);
      toast.error(`Failed to import work orders: ${error.message || 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const handleSubmitAssignment = async () => {
    if (!workOrderToAssign || !selectedSubcontractorForAssign) {
      toast.error('Please select a subcontractor');
      return;
    }

    setSubmitting(true);

    try {
      const subcontractor = subcontractors.find(s => s.id === selectedSubcontractorForAssign);
      
      if (!subcontractor) {
        toast.error('Invalid subcontractor selected');
        return;
      }

      // Get admin info for timeline
      const currentUser = auth.currentUser;
      let adminName = 'Admin';
      if (currentUser) {
        const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
        adminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';
      }

      const workOrderDoc = await getDoc(doc(db, 'workOrders', workOrderToAssign.id));
      const woData = workOrderDoc.data();
      const existingTimeline = woData?.timeline || [];
      const existingSysInfo = woData?.systemInformation || {};

      const timelineEvent = createTimelineEvent({
        type: 'assigned',
        userId: currentUser?.uid || 'unknown',
        userName: adminName,
        userRole: 'admin',
        details: `Work order assigned to ${subcontractor.fullName} by ${adminName}`,
        metadata: { subcontractorId: subcontractor.uid || subcontractor.id, subcontractorName: subcontractor.fullName },
      });

      // Update work order status and assignment
      await updateDoc(doc(db, 'workOrders', workOrderToAssign.id), {
        status: 'assigned',
        assignedTo: subcontractor.uid || subcontractor.id,
        assignedToName: subcontractor.fullName,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: {
          ...existingSysInfo,
          assignment: {
            subcontractorId: subcontractor.uid || subcontractor.id,
            subcontractorName: subcontractor.fullName,
            assignedBy: { id: currentUser?.uid || 'unknown', name: adminName },
            timestamp: Timestamp.now(),
          },
        },
      });

      // Create assignment record for subcontractor portal
      await addDoc(collection(db, 'assignedJobs'), {
        workOrderId: workOrderToAssign.id,
        subcontractorId: subcontractor.uid || subcontractor.id,
        assignedAt: serverTimestamp(),
        status: 'pending_acceptance', // New status for pending acceptance
        createdAt: serverTimestamp(),
      });

      toast.success(`Work order assigned to ${subcontractor.fullName}`);
      setShowAssignModal(false);
      setWorkOrderToAssign(null);
      setSelectedSubcontractorForAssign('');
      fetchWorkOrders();
    } catch (error) {
      console.error('Error assigning work order:', error);
      toast.error('Failed to assign work order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (workOrder: WorkOrder) => {
  const locationForWorkOrder = locations.find(l => l.id === workOrder.locationId);
  const resolvedCompanyId = workOrder.companyId || locationForWorkOrder?.companyId || '';
  const selectedCompany = companies.find(c => c.id === resolvedCompanyId);
    setFormData({
      clientId: workOrder.clientId,
    companyId: resolvedCompanyId,
      locationId: workOrder.locationId,
      title: workOrder.title,
      description: workOrder.description,
      category: workOrder.category,
      priority: workOrder.priority,
      estimateBudget: workOrder.estimateBudget ? workOrder.estimateBudget.toString() : '',
      status: workOrder.status,
      isMaintenanceRequestOrder: workOrder.isMaintenanceRequestOrder || false,
    });
    setEditingId(workOrder.id);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.clientId || !formData.companyId || !formData.locationId || !formData.title || !formData.description || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      const client = clients.find(c => c.id === formData.clientId);
      const location = locations.find(l => l.id === formData.locationId);
      const company = companies.find(c => c.id === formData.companyId);

      if (!client || !location || !company) {
        toast.error('Invalid client, company, or location selected');
        return;
      }

      if (location.companyId && location.companyId !== company.id) {
        toast.error('Selected location does not belong to the chosen company');
        return;
      }

      const workOrderData: any = {
        clientId: formData.clientId,
        clientName: client.fullName,
        clientEmail: client.email,
        companyId: company.id,
        companyName: company.name,
        locationId: formData.locationId,
        locationName: location.locationName,
        locationAddress: location.address && typeof location.address === 'object' 
          ? `${location.address.street || ''}, ${location.address.city || ''}, ${location.address.state || ''}`.replace(/^,\s*|,\s*$/g, '').trim()
          : (location.address || 'N/A'),
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        estimateBudget: formData.estimateBudget ? parseFloat(formData.estimateBudget) : null,
        status: formData.status,
        updatedAt: serverTimestamp(),
      };

      if (formData.isMaintenanceRequestOrder) {
        workOrderData.isMaintenanceRequestOrder = true;
      }

      // Preserve appyRequestor if editing - get it from the original work order
      if (editingId) {
        const originalWorkOrder = workOrders.find(wo => wo.id === editingId);
        if (originalWorkOrder?.appyRequestor) {
          workOrderData.appyRequestor = originalWorkOrder.appyRequestor;
        }
      }

      if (editingId) {
        // Update existing work order
        await updateDoc(doc(db, 'workOrders', editingId), workOrderData);
        toast.success('Work order updated successfully');
      } else {
        // Create new work order
        const currentUser = auth.currentUser;
        let adminName = 'Admin';
        if (currentUser) {
          const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
          adminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';
        }

        const timelineEvent = createTimelineEvent({
          type: 'created',
          userId: currentUser?.uid || 'unknown',
          userName: adminName,
          userRole: 'admin',
          details: `Work order created by ${adminName} via Admin Portal`,
          metadata: { source: 'admin_portal_ui' },
        });

        const workOrderNumber = `WO-${Date.now().toString().slice(-8).toUpperCase()}`;
        const docRef = await addDoc(collection(db, 'workOrders'), {
          ...workOrderData,
          workOrderNumber,
          images: [],
          createdAt: serverTimestamp(),
          timeline: [timelineEvent],
          systemInformation: {
            createdBy: {
              id: currentUser?.uid || 'unknown',
              name: adminName,
              role: 'admin',
              timestamp: Timestamp.now(),
            },
          },
        });

        // Send email notifications to admins with work order emails enabled (fire-and-forget)
        fetch('/api/email/send-work-order-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            workOrderId: docRef.id,
            workOrderNumber,
            title: formData.title,
            clientName: client.fullName,
            locationName: location.locationName,
            priority: formData.priority,
            workOrderType: formData.isMaintenanceRequestOrder ? 'maintenance' : 'standard',
            description: formData.description,
          }),
        }).catch(err => console.error('Failed to send work order notification emails:', err));

        // Send confirmation email to the client (fire-and-forget)
        if (client.email) {
          fetch('/api/email/send-work-order-received', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
              workOrderId: docRef.id,
              workOrderNumber,
              title: formData.title,
              clientName: client.fullName,
              clientEmail: client.email,
              locationName: location.locationName,
              priority: formData.priority,
              description: formData.description,
            }),
          }).catch(err => console.error('Failed to send work order received email:', err));
        }

        toast.success('Work order created successfully');
      }

      resetForm();
      fetchWorkOrders();
    } catch (error: any) {
      console.error('Error saving work order:', error);
      toast.error(error.message || 'Failed to save work order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareForBidding = async (workOrder: WorkOrder) => {
    try {
      // Get all approved subcontractors
      const subsQuery = query(
        collection(db, 'subcontractors'),
        where('status', '==', 'approved')
      );
      const subsSnapshot = await getDocs(subsQuery);

      if (subsSnapshot.empty) {
        toast.error('No approved subcontractors found');
        return;
      }

      // Map subcontractors data and mark matching ones
      const allSubsData = subsSnapshot.docs.map(doc => ({
        id: doc.id,
        uid: doc.data().uid,
        fullName: doc.data().fullName,
        email: doc.data().email,
        businessName: doc.data().businessName,
        skills: doc.data().skills || [],
      })) as (Subcontractor & { skills: string[] })[];

      // Mark subcontractors that match the work order category
      let matchingCount = 0;
      const subsData = allSubsData.map(sub => {
        let matchesCategory = false;

        if (workOrder.category) {
          const categoryLower = workOrder.category.toLowerCase();
          // Check if subcontractor has matching skill/category
          if (!sub.skills || sub.skills.length === 0) {
            // If no skills specified, don't mark as matching (backward compatibility)
            matchesCategory = false;
          } else {
            matchesCategory = sub.skills.some(skill =>
              skill.toLowerCase().includes(categoryLower) ||
              categoryLower.includes(skill.toLowerCase())
            );
          }
        }

        if (matchesCategory) matchingCount++;

        return {
          id: sub.id,
          uid: sub.uid,
          fullName: sub.fullName,
          email: sub.email,
          businessName: sub.businessName,
          matchesCategory,
        } as Subcontractor;
      });

      // Show message about matching subcontractors
      if (workOrder.category) {
        if (matchingCount === 0) {
          toast.warning(`No subcontractors found matching category "${workOrder.category}". Showing all ${subsData.length} subcontractor(s).`);
        } else {
          toast.success(`Found ${matchingCount} subcontractor(s) matching category "${workOrder.category}". Showing all ${subsData.length} subcontractor(s).`);
        }
      }

      subsData.sort((a, b) => (b.matchesCategory ? 1 : 0) - (a.matchesCategory ? 1 : 0));
      setSubcontractors(subsData);
      setWorkOrderToShare(workOrder);
      setSelectedSubcontractors([]);
      setShowBiddingModal(true);
    } catch (error) {
      console.error('Error loading subcontractors:', error);
      toast.error('Failed to load subcontractors');
    }
  };

  const handleSubmitBidding = async () => {
    if (!workOrderToShare) return;

    if (selectedSubcontractors.length === 0) {
      toast.error('Please select at least one subcontractor');
      return;
    }

    setSubmitting(true);

    try {
      // Ensure workOrderNumber exists, generate if missing
      const workOrderNumber = workOrderToShare.workOrderNumber || `WO-${Date.now().toString().slice(-8)}`;

      // Create bidding work order for each selected subcontractor
      const subAuthIds = selectedSubcontractors.map((subId) => {
        const sub = subcontractors.find((s) => s.id === subId);
        return sub ? subcontractorAuthId(sub) : subId;
      });

      const promises = selectedSubcontractors.map(async (subId) => {
        const sub = subcontractors.find(s => s.id === subId);
        if (!sub) return;
        const authId = subcontractorAuthId(sub);

        await addDoc(collection(db, 'biddingWorkOrders'), {
          workOrderId: workOrderToShare.id,
          workOrderNumber: workOrderNumber,
          subcontractorId: authId,
          subcontractorName: sub.fullName,
          subcontractorEmail: sub.email,
          workOrderTitle: workOrderToShare.title,
          workOrderDescription: workOrderToShare.description,
          clientId: workOrderToShare.clientId,
          clientName: workOrderToShare.clientName,
          priority: workOrderToShare.priority || '',
          category: workOrderToShare.category || '',
          locationName: workOrderToShare.locationName || '',
          locationAddress: workOrderToShare.locationAddress || '',
          images: workOrderToShare.images || [],
          status: 'pending',
          sharedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });

        // Notify will be done after all bidding work orders are created
      });

      await Promise.all(promises);

      // Notify all selected subcontractors about bidding opportunity
      await notifyBiddingOpportunity(
        subAuthIds,
        workOrderToShare.id,
        workOrderNumber,
        workOrderToShare.title
      );

      // Send email notifications to all selected subcontractors in parallel
      try {
        await Promise.all(selectedSubcontractors.map(async (subId) => {
          const sub = subcontractors.find(s => s.id === subId);
          if (sub && sub.email) {
            await fetch('/api/email/send-bidding-opportunity', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                toEmail: sub.email,
                toName: sub.fullName,
                workOrderNumber: workOrderNumber,
                workOrderTitle: workOrderToShare.title,
                workOrderDescription: workOrderToShare.description,
                locationName: workOrderToShare.locationName,
                category: workOrderToShare.category,
                priority: workOrderToShare.priority,
                portalLink: `${window.location.origin}/subcontractor-portal/bidding`,
              }),
            });
          }
        }));
      } catch (emailError) {
        console.error('Failed to send bidding opportunity emails:', emailError);
        // Don't fail the whole operation if emails fail
      }

      // Get admin user data
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';

      // Get current work order data for timeline
      const workOrderDoc = await getDoc(doc(db, 'workOrders', workOrderToShare.id));
      const workOrderData = workOrderDoc.data();
      const existingTimeline = workOrderData?.timeline || [];
      const existingSysInfo = workOrderData?.systemInformation || {};

      // Get subcontractor names for timeline
      const selectedSubNames = selectedSubcontractors.map(subId => {
        const sub = subcontractors.find(s => s.id === subId);
        return sub ? sub.fullName : 'Unknown';
      }).join(', ');

      // Create timeline event
      const timelineEvent = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Timestamp.now(),
        type: 'shared_for_bidding',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: `Shared for bidding with ${selectedSubcontractors.length} subcontractor(s): ${selectedSubNames}`,
        metadata: {
          subcontractorIds: selectedSubcontractors,
          subcontractorCount: selectedSubcontractors.length,
        }
      };

      // Update system information
      const updatedSysInfo = {
        ...existingSysInfo,
        sharedForBidding: {
          by: { id: currentUser.uid, name: adminName },
          timestamp: Timestamp.now(),
          subcontractors: selectedSubcontractors.map(subId => {
            const sub = subcontractors.find(s => s.id === subId);
            return { id: subId, name: sub ? sub.fullName : 'Unknown' };
          })
        }
      };

      // Update work order status and ensure workOrderNumber exists
      // Also add biddingSubcontractors array so subcontractors can update status via Firestore rules
      await updateDoc(doc(db, 'workOrders', workOrderToShare.id), {
        status: 'bidding',
        workOrderNumber: workOrderNumber,
        sharedForBiddingAt: serverTimestamp(),
        biddingSubcontractors: subAuthIds,
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: updatedSysInfo,
      });

      toast.success(`Work order shared with ${selectedSubcontractors.length} subcontractor(s) for bidding`);
      setShowBiddingModal(false);
      setSelectedSubcontractors([]);
      setWorkOrderToShare(null);
      fetchWorkOrders();
    } catch (error) {
      console.error('Error sharing for bidding:', error);
      toast.error('Failed to share work order for bidding');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSubcontractorSelection = (subId: string) => {
    setSelectedSubcontractors(prev =>
      prev.includes(subId)
        ? prev.filter(id => id !== subId)
        : [...prev, subId]
    );
  };

  const selectAllSubcontractors = () => {
    if (selectedSubcontractors.length === subcontractors.length) {
      setSelectedSubcontractors([]);
    } else {
      setSelectedSubcontractors(subcontractors.map(s => s.id));
    }
  };

  const handleDeleteWorkOrder = async (workOrder: WorkOrder) => {
    // Show confirmation toast with action buttons
    toast(`Delete work order "${workOrder.title}"?`, {
      description: 'This will also delete all related quotes, bidding work orders, and invoices. This action cannot be undone.',
      action: {
        label: 'Delete',
        onClick: async () => {
          await performDeleteWorkOrder(workOrder);
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const performDeleteWorkOrder = async (workOrder: WorkOrder) => {
    try {
      // Delete related quotes
      const quotesQuery = query(
        collection(db, 'quotes'),
        where('workOrderId', '==', workOrder.id)
      );
      const quotesSnapshot = await getDocs(quotesQuery);
      const quoteDeletePromises = quotesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(quoteDeletePromises);

      // Delete related bidding work orders
      const biddingQuery = query(
        collection(db, 'biddingWorkOrders'),
        where('workOrderId', '==', workOrder.id)
      );
      const biddingSnapshot = await getDocs(biddingQuery);
      const biddingDeletePromises = biddingSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(biddingDeletePromises);

      // Delete related invoices
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('workOrderId', '==', workOrder.id)
      );
      const invoicesSnapshot = await getDocs(invoicesQuery);
      const invoiceDeletePromises = invoicesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(invoiceDeletePromises);

      // Delete the work order itself
      await deleteDoc(doc(db, 'workOrders', workOrder.id));

      toast.success('Work order and all related data deleted successfully');
      setSelectedIds(prev => prev.filter(id => id !== workOrder.id));
      fetchWorkOrders();
    } catch (error) {
      console.error('Error deleting work order:', error);
      toast.error('Failed to delete work order');
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredWorkOrders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredWorkOrders.map(wo => wo.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;

    const selectedCount = selectedIds.length;
    toast(`Delete ${selectedCount} work order${selectedCount > 1 ? 's' : ''}?`, {
      description: 'This will also delete all related quotes, bidding work orders, and invoices. This action cannot be undone.',
      action: {
        label: 'Delete',
        onClick: async () => {
          await performBulkDelete();
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const performBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const totalCount = selectedIds.length;

    try {
      setSubmitting(true);
      setDeleteProgress('Fetching related records…');

      // Build chunks of 30 for Firestore 'in' queries
      const IN_CHUNK = 30;
      const idChunks: string[][] = [];
      for (let i = 0; i < selectedIds.length; i += IN_CHUNK) {
        idChunks.push(selectedIds.slice(i, i + IN_CHUNK));
      }

      // Fetch all related docs across all collections in parallel using 'in' queries
      const [quoteSnaps, biddingSnaps, invoiceSnaps] = await Promise.all([
        Promise.all(idChunks.map(chunk => getDocs(query(collection(db, 'quotes'), where('workOrderId', 'in', chunk))))),
        Promise.all(idChunks.map(chunk => getDocs(query(collection(db, 'biddingWorkOrders'), where('workOrderId', 'in', chunk))))),
        Promise.all(idChunks.map(chunk => getDocs(query(collection(db, 'invoices'), where('workOrderId', 'in', chunk))))),
      ]);

      // Collect all refs to delete
      const refsToDelete: any[] = [];
      quoteSnaps.forEach(snap => snap.docs.forEach(d => refsToDelete.push(d.ref)));
      biddingSnaps.forEach(snap => snap.docs.forEach(d => refsToDelete.push(d.ref)));
      invoiceSnaps.forEach(snap => snap.docs.forEach(d => refsToDelete.push(d.ref)));
      selectedIds.forEach(id => refsToDelete.push(doc(db, 'workOrders', id)));

      // Commit deletes in batches of 500 (Firestore limit)
      const BATCH_SIZE = 500;
      const totalBatches = Math.ceil(refsToDelete.length / BATCH_SIZE);
      for (let i = 0; i < refsToDelete.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        setDeleteProgress(`Deleting batch ${batchNum} / ${totalBatches}…`);
        const batch = writeBatch(db);
        refsToDelete.slice(i, i + BATCH_SIZE).forEach(ref => batch.delete(ref));
        await batch.commit();
      }

      toast.success(`Successfully deleted ${totalCount} work order${totalCount > 1 ? 's' : ''} and all related data`);
      setSelectedIds([]);
      setDeleteProgress('');
      fetchWorkOrders();
    } catch (error) {
      console.error('Error deleting work orders:', error);
      toast.error('Failed to delete work orders');
      setDeleteProgress('');
    } finally {
      setSubmitting(false);
    }
  };

  const getTimestampValue = (value: any) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object' && value?.toDate) {
      const dateValue = value.toDate();
      return dateValue instanceof Date ? dateValue.getTime() : 0;
    }
    return 0;
  };

  const filteredWorkOrders = workOrders.filter(wo => {
    // Filter by work order type (client-side, avoids requiring a Firestore composite index)
    // Archive type shows only archived; all other types exclude archived work orders
    const typeMatch =
      workOrderType === 'archive'
        ? wo.status === 'archived'
        : (wo.status !== 'archived') && (
            workOrderType === 'all' ||
            workOrderType === 'standard' ||
            (workOrderType === 'maintenance' && !!wo.isMaintenanceRequestOrder)
          );

    // Filter by status
    const statusMatch = filter === 'all' || wo.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      wo.title?.toLowerCase().includes(searchLower) ||
      wo.description?.toLowerCase().includes(searchLower) ||
      wo.clientName?.toLowerCase().includes(searchLower) ||
      getWorkOrderClientDisplayName(wo).toLowerCase().includes(searchLower) ||
      wo.workOrderNumber?.toLowerCase().includes(searchLower) ||
      wo.category?.toLowerCase().includes(searchLower);

    return typeMatch && statusMatch && searchMatch;
  });

  const listStatusFilterOptions = [
    { value: 'all', label: `All Statuses (${filteredWorkOrders.length})` },
    { value: 'pending', label: `Pending (${workOrders.filter((w) => w.status === 'pending').length})` },
    { value: 'approved', label: `Approved (${workOrders.filter((w) => w.status === 'approved').length})` },
    { value: 'bidding', label: `Bidding (${workOrders.filter((w) => w.status === 'bidding').length})` },
    { value: 'quotes_received', label: `Quotes Received (${workOrders.filter((w) => w.status === 'quotes_received').length})` },
    { value: 'to_be_started', label: `To Be Started (${workOrders.filter((w) => w.status === 'to_be_started').length})` },
    { value: 'assigned', label: `Assigned (${workOrders.filter((w) => w.status === 'assigned').length})` },
    { value: 'accepted_by_subcontractor', label: `Accepted by Sub (${workOrders.filter((w) => w.status === 'accepted_by_subcontractor').length})` },
    { value: 'pending_invoice', label: `Pending Invoice (${workOrders.filter((w) => w.status === 'pending_invoice').length})` },
    { value: 'completed', label: `Completed (${workOrders.filter((w) => w.status === 'completed').length})` },
    { value: 'rejected_by_subcontractor', label: `Rejected by Sub (${workOrders.filter((w) => w.status === 'rejected_by_subcontractor').length})` },
  ];

  const workOrderFormPriorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  const workOrderFormStatusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'bidding', label: 'Bidding' },
    { value: 'quotes_received', label: 'Quotes Received' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'completed', label: 'Completed' },
  ];

  // Reset to page 1 whenever filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filter, workOrderType]);

  const sortedWorkOrders = [...filteredWorkOrders].sort((a, b) => {
    switch (sortOption) {
      case 'updatedAt':
        return (
          getTimestampValue((b as any).updatedAt || b.createdAt) -
          getTimestampValue((a as any).updatedAt || a.createdAt)
        );
      case 'createdAt':
      default:
        return getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt);
    }
  });

  // Client-side pagination slice
  const totalPages = Math.max(1, Math.ceil(sortedWorkOrders.length / rowsPerPage));
  const paginatedWorkOrders = sortedWorkOrders.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'approved': return 'text-green-600 bg-green-50';
      case 'rejected': return 'text-red-600 bg-red-50';
      case 'bidding': return 'text-blue-600 bg-blue-50';
      case 'quotes_received': return 'text-blue-600 bg-blue-50';
      case 'to_be_started': return 'text-orange-600 bg-orange-50';
      case 'assigned': return 'text-indigo-600 bg-indigo-50';
      case 'pending_invoice': return 'text-orange-600 bg-orange-50';
      case 'completed': return 'text-emerald-600 bg-emerald-50';
      case 'accepted_by_subcontractor': return 'text-purple-600 bg-purple-50';
      case 'rejected_by_subcontractor': return 'text-red-600 bg-red-50';
      case 'archived': return 'text-gray-600 bg-gray-100';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      bidding: 'Bidding',
      quotes_received: 'Quote Received',
      to_be_started: 'To Be Started',
      assigned: 'Assigned',
      pending_invoice: 'Pending Invoice',
      completed: 'Completed',
      accepted_by_subcontractor: 'Accepted by Subcontractor',
      rejected_by_subcontractor: 'Rejected by Subcontractor',
      archived: 'Archived',
    };

    if (labels[status]) {
      return labels[status];
    }

    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-muted-foreground bg-muted';
    }
  };

// Filter companies by search query (show all companies, not filtered by client)
const filteredLocationsForForm = locations.filter((location) => {
  if (formData.companyId) {
    return location.companyId === formData.companyId;
  }
  if (formData.clientId) {
    return location.clientId === formData.clientId;
  }
  return true;
});

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              {workOrderType === 'standard' && 'Standard Work Orders'}
              {workOrderType === 'maintenance' && 'Maintenance Requests Work Orders'}
              {workOrderType === 'archive' && 'Archived Work Orders'}
              {workOrderType === 'all' && 'All Work Orders'}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              {workOrderType === 'standard' && 'Manage standard work orders'}
              {workOrderType === 'maintenance' && 'Manage work orders created from maintenance requests'}
              {workOrderType === 'archive' && 'View work orders that have been archived'}
              {workOrderType === 'all' && 'Manage all work orders and assignments'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {workOrderType === 'archive' ? (
              <Link href="/admin-portal/work-orders" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Back to Work Orders</span>
                  <span className="sm:hidden">Back</span>
                </Button>
              </Link>
            ) : (
              <Link href="/admin-portal/work-orders?type=archive" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto">
                  <Archive className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Archived Work Orders</span>
                  <span className="sm:hidden">Archived</span>
                </Button>
              </Link>
            )}
            {workOrderType !== 'archive' && (
              <>
                <Button
                  onClick={() => setShowImportModal(true)}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Import Work Orders</span>
                  <span className="sm:hidden">Import</span>
                </Button>
                <Button
                  onClick={handleOpenCreate}
                  className="w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Create Work Order</span>
                  <span className="sm:hidden">Create</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search work orders by title, client, number, category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
          <SearchableSelect
            className="sm:w-56 shrink-0"
            value={filter}
            onValueChange={(v) => setFilter(v as typeof filter)}
            options={listStatusFilterOptions}
            placeholder="Filter by status..."
            aria-label="Filter work orders by status"
          />
        </div>

        {/* Selection Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Checkbox
              id="select-all-wo"
              checked={filteredWorkOrders.length > 0 && selectedIds.length === filteredWorkOrders.length}
              onCheckedChange={toggleSelectAll}
            />
            <label htmlFor="select-all-wo" className="text-sm font-medium text-foreground cursor-pointer">
              Select All ({filteredWorkOrders.length})
            </label>
            {selectedIds.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} selected
              </span>
            )}
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3">
              {deleteProgress && (
                <span className="text-sm text-muted-foreground">{deleteProgress}</span>
              )}
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                loading={submitting} disabled={submitting}
                className="w-full sm:w-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {submitting && deleteProgress ? deleteProgress : `Delete Selected (${selectedIds.length})`}
              </Button>
            </div>
          )}
        </div>

        {/* Work Orders Grid/List */}
        {loading ? (
          <div className="border rounded-lg overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border animate-pulse">
                <div className="h-4 w-4 rounded bg-gray-200" />
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="h-4 flex-1 rounded bg-gray-200" />
                <div className="h-4 w-20 rounded bg-gray-200" />
                <div className="h-6 w-16 rounded-full bg-gray-200" />
                <div className="h-4 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : sortedWorkOrders.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No work orders found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <Checkbox
                      checked={sortedWorkOrders.length > 0 && selectedIds.length === sortedWorkOrders.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work Order #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date Created</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-gray-200">
                {paginatedWorkOrders.map((workOrder) => (
                  <tr key={workOrder.id} className="hover:bg-muted transition-colors">
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selectedIds.includes(workOrder.id)}
                        onCheckedChange={() => toggleSelection(workOrder.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-foreground">{workOrder.title}</div>
                      <div className="text-muted-foreground text-xs mt-1 line-clamp-1">{workOrder.description}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{workOrder.workOrderNumber}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{getWorkOrderClientDisplayName(workOrder)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{workOrder.category}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getPriorityColor(workOrder.priority)}`}>
                        {(workOrder.priority || 'medium').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(workOrder.status)}`}>
                        {getStatusLabel(workOrder.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {workOrder.estimateBudget ? `$${workOrder.estimateBudget.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {workOrder.createdAt?.toDate?.()
                        ? workOrder.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.location.href = `/admin-portal/work-orders/${workOrder.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEdit(workOrder)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteWorkOrder(workOrder)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedWorkOrders.map((workOrder) => (
              <div key={workOrder.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                {/* Row 1: checkbox + title + status */}
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedIds.includes(workOrder.id)}
                    onCheckedChange={() => toggleSelection(workOrder.id)}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{workOrder.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{workOrder.workOrderNumber}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {workOrder.createdAt?.toDate?.()
                          ? workOrder.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(workOrder.status)}`}>
                      {getStatusLabel(workOrder.status)}
                    </span>
                  </div>
                </div>

                {/* Row 2: client + priority */}
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground truncate">{getWorkOrderClientDisplayName(workOrder)}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-semibold ${getPriorityColor(workOrder.priority)}`}>
                    {(workOrder.priority || 'medium').toUpperCase()}
                  </span>
                </div>

                {/* Row 3: category + budget/assigned */}
                <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
                  <span className="truncate">{workOrder.category || '—'}</span>
                  <span className="shrink-0">
                    {workOrder.estimateBudget ? `$${workOrder.estimateBudget.toLocaleString()}` : workOrder.assignedSubcontractorName || workOrder.assignedToName || '—'}
                  </span>
                </div>

                {/* Row 4: scheduled date badge (if accepted) */}
                {workOrder.status === 'accepted_by_subcontractor' && workOrder.scheduledServiceDate && (
                  <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      Scheduled: {workOrder.scheduledServiceDate?.toDate?.().toLocaleDateString() || 'N/A'} {workOrder.scheduledServiceTime && `at ${workOrder.scheduledServiceTime}`}
                    </span>
                  </div>
                )}

                {/* Row 5: invoice sent badge */}
                {(workOrder.status === 'pending_invoice' || workOrder.status === 'completed') && workOrder.hasInvoice && (
                  <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="h-3 w-3 shrink-0" />
                    <span>Invoice Sent</span>
                  </div>
                )}

                {/* Actions row */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1"
                    onClick={() => window.location.href = `/admin-portal/work-orders/${workOrder.id}`}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2" title="Edit" onClick={() => handleOpenEdit(workOrder)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  {workOrder.status === 'pending' && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 px-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50" title="Approve" onClick={() => handleApprove(workOrder.id)}>
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50" title="Reject" onClick={() => handleReject(workOrder.id)}>
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {(workOrder.status === 'approved' || workOrder.status === 'bidding') && (
                    <Button size="sm" variant="outline" className="h-8 px-2" title="Share for Bidding" onClick={() => handleShareForBidding(workOrder)}>
                      <Share2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {workOrder.status === 'quotes_received' && (
                    <Button size="sm" variant="outline" className="h-8 px-2" title="View Quotes"
                      onClick={() => window.location.href = `/admin-portal/quotes?workOrderId=${workOrder.id}`}>
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {(workOrder.status === 'to_be_started' || workOrder.status === 'rejected_by_subcontractor') && (
                    <Button size="sm" variant="outline" className="h-8 px-2" title="Assign to Subcontractor" onClick={() => handleAssignToSubcontractor(workOrder)}>
                      <UserPlus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {(workOrder.status === 'pending_invoice' || workOrder.status === 'completed') && !workOrder.hasInvoice && (
                    <Button size="sm" variant="outline" className="h-8 px-2" title="Generate & Send Invoice" onClick={() => handleSendInvoice(workOrder)}>
                      <Receipt className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50" title="Delete" onClick={() => handleDeleteWorkOrder(workOrder)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {sortedWorkOrders.length > 0 && (
          <div className="border-t bg-muted rounded-b-lg px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span>Rows per page:</span>
              <SearchableSelect
                className="w-24"
                value={String(rowsPerPage)}
                onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}
                options={[
                  { value: '25', label: '25' },
                  { value: '50', label: '50' },
                  { value: '100', label: '100' },
                ]}
                placeholder="Rows"
                aria-label="Rows per page"
              />
              <span className="text-muted-foreground">
                {((currentPage - 1) * rowsPerPage) + 1}–{Math.min(currentPage * rowsPerPage, sortedWorkOrders.length)} of {sortedWorkOrders.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => goToPage(1)} disabled={currentPage === 1}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-foreground px-3">
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
              </span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages}>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-card rounded-lg max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6 border-b sticky top-0 bg-card z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl sm:text-2xl font-bold">
                    {editingId ? 'Edit Work Order' : 'Create New Work Order'}
                  </h2>
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Select Client *</Label>
                    <SearchableSelect
                      className="mt-1"
                      value={formData.clientId}
                      onValueChange={(v) => {
                        setFormData({ ...formData, clientId: v, companyId: '', locationId: '' });
                      }}
                      options={[
                        { value: '', label: 'Choose a client...' },
                        ...clients.map((client) => ({
                          value: client.id,
                          label: `${client.fullName} (${client.email})`,
                        })),
                      ]}
                      placeholder="Choose a client..."
                    />
                  </div>

                  {editingId && workOrders.find(wo => wo.id === editingId)?.appyRequestor && (
                    <div>
                      <Label>APPY Requestor</Label>
                      <Input
                        type="text"
                        value={workOrders.find(wo => wo.id === editingId)?.appyRequestor || ''}
                        disabled
                        className="w-full border border-gray-300 rounded-md p-2 bg-muted"
                        placeholder="N/A"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        This field is set automatically from the maintenance API request
                      </p>
                    </div>
                  )}

                  <div>
                    <Label>Company *</Label>
                    <SearchableSelect
                      className="mt-1"
                      value={formData.companyId}
                      onValueChange={(v) => {
                        handleCompanySelect(v);
                      }}
                      options={[
                        { value: '', label: 'Choose a company...' },
                        ...companies.map((company) => ({ value: company.id, label: company.name })),
                      ]}
                      placeholder="Choose a company..."
                    />
                    {!formData.companyId && companies.length === 0 && (
                      <p className="text-xs text-yellow-600 mt-1">
                        No companies found. Please add companies first.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Select Location *</Label>
                    <SearchableSelect
                      className="mt-1"
                      value={formData.locationId}
                      onValueChange={(v) => handleLocationSelect(v)}
                      disabled={!formData.companyId}
                      options={[
                        { value: '', label: 'Choose a location...' },
                        ...filteredLocationsForForm.map((location) => ({
                          value: location.id,
                          label: location.locationName,
                        })),
                      ]}
                      placeholder="Choose a location..."
                    />
                    {formData.companyId && filteredLocationsForForm.length === 0 && (
                      <p className="text-xs text-yellow-600 mt-1">
                        No locations found for the selected company.
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <Label>Work Order Title *</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., HVAC Repair Needed"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Label>Description *</Label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full border border-gray-300 rounded-md p-2 min-h-[100px]"
                      placeholder="Detailed description of the work needed..."
                    />
                  </div>

                  <div>
                    <Label>Estimate Budget (Optional)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={formData.estimateBudget}
                      onChange={(e) => setFormData({ ...formData, estimateBudget: e.target.value })}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="e.g., 5000"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Estimated budget in USD</p>
                  </div>

                  <div>
                    <Label>Category *</Label>
                    <SearchableSelect
                      className="mt-1"
                      value={formData.category}
                      onValueChange={(v) => setFormData({ ...formData, category: v })}
                      options={[
                        { value: '', label: 'Select category...' },
                        ...categories.map((category) => ({ value: category.name, label: category.name })),
                      ]}
                      placeholder="Select category..."
                    />
                  </div>

                  <div>
                    <Label>Priority *</Label>
                    <SearchableSelect
                      className="mt-1"
                      value={formData.priority}
                      onValueChange={(v) => setFormData({ ...formData, priority: v as WorkOrder['priority'] })}
                      options={workOrderFormPriorityOptions}
                      placeholder="Select priority..."
                    />
                  </div>

                  <div>
                    <Label>Status *</Label>
                    <SearchableSelect
                      className="mt-1"
                      value={formData.status}
                      onValueChange={(v) => setFormData({ ...formData, status: v as WorkOrder['status'] })}
                      options={workOrderFormStatusOptions}
                      placeholder="Select status..."
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isMaintenanceRequestOrder"
                        checked={formData.isMaintenanceRequestOrder}
                        onChange={(e) => {
                          // Only allow unchecking if it's not a maintenance request order
                          // If it's already true (from maintenance request), don't allow changing
                          if (!formData.isMaintenanceRequestOrder) {
                            setFormData({ ...formData, isMaintenanceRequestOrder: e.target.checked });
                          }
                        }}
                        disabled={formData.isMaintenanceRequestOrder}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <Label htmlFor="isMaintenanceRequestOrder" className={formData.isMaintenanceRequestOrder ? 'text-muted-foreground' : ''}>
                        Maintenance Request Order
                      </Label>
                      {formData.isMaintenanceRequestOrder && (
                        <span className="text-xs text-muted-foreground ml-2">(This field cannot be edited)</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    loading={submitting} disabled={submitting}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    loading={submitting} disabled={submitting}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Share for Bidding Modal */}
        {showBiddingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-card rounded-lg max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6 border-b sticky top-0 bg-card z-10">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold">Share for Bidding</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Select subcontractors to share this work order with
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowBiddingModal(false);
                      setSelectedSubcontractors([]);
                      setWorkOrderToShare(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                {workOrderToShare && (
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="font-semibold text-blue-900 mb-1">{workOrderToShare.title}</h3>
                    <p className="text-sm text-blue-700">{workOrderToShare.workOrderNumber}</p>
                  </div>
                )}

                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="selectAll"
                      checked={selectedSubcontractors.length === subcontractors.length && subcontractors.length > 0}
                      onChange={selectAllSubcontractors}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="selectAll" className="text-sm font-medium text-foreground">
                      Select All ({subcontractors.length})
                    </label>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedSubcontractors.length} selected
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-4">
                  {subcontractors.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No approved subcontractors found</p>
                  ) : (
                    subcontractors.map((sub) => (
                      <div
                        key={sub.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                          selectedSubcontractors.includes(sub.id)
                            ? sub.matchesCategory
                              ? 'bg-green-50 border-green-400 ring-2 ring-green-200'
                              : 'bg-blue-50 border-blue-300'
                            : sub.matchesCategory
                            ? 'bg-green-50 border-green-300 hover:border-green-400'
                            : 'bg-card border-border hover:bg-muted'
                        }`}
                        onClick={() => toggleSubcontractorSelection(sub.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSubcontractors.includes(sub.id)}
                          onChange={() => toggleSubcontractorSelection(sub.id)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{sub.fullName}</p>
                            {sub.matchesCategory && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                Matches Category
                              </span>
                            )}
                          </div>
                          {sub.businessName && (
                            <p className="text-sm text-muted-foreground">{sub.businessName}</p>
                          )}
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
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowBiddingModal(false);
                      setSelectedSubcontractors([]);
                      setWorkOrderToShare(null);
                    }}
                    disabled={submitting}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitBidding}
                    disabled={submitting || selectedSubcontractors.length === 0}
                    className="flex-1"
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">
                      {submitting ? 'Sharing...' : `Share with ${selectedSubcontractors.length} Subcontractor(s)`}
                    </span>
                    <span className="sm:hidden">
                      {submitting ? 'Sharing...' : `Share (${selectedSubcontractors.length})`}
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Work Order Type Selection Modal */}
        {showWorkOrderTypeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-card rounded-lg max-w-md w-full">
              <div className="p-4 sm:p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl sm:text-2xl font-bold">Create Work Order</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowWorkOrderTypeModal(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <p className="text-muted-foreground mb-6">Choose the type of work order you want to create:</p>
                
                <div className="space-y-3">
                  <button
                    className="w-full p-4 text-left border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 cursor-pointer"
                    onClick={handleCreateNormalWorkOrder}
                  >
                    <div className="font-semibold text-lg text-foreground">Standard Work Order</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Create a one-time work order for immediate or scheduled work
                    </div>
                  </button>

                  <button
                    className="w-full p-4 text-left border-2 border-gray-300 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-all duration-200 cursor-pointer"
                    onClick={handleCreateMaintenanceWorkOrder}
                  >
                    <div className="font-semibold text-lg text-foreground">Maintenance Request Work Order</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Create a maintenance request work order for facility upkeep and repairs
                    </div>
                  </button>

                  <button
                    className="w-full p-4 text-left border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 cursor-pointer"
                    onClick={handleCreateRecurringWorkOrder}
                  >
                    <div className="font-semibold text-lg text-foreground">Recurring Work Order</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Create a recurring work order that repeats automatically (daily, weekly, monthly, yearly, or custom)
                    </div>
                  </button>

                  <button
                    className="w-full p-4 text-left border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 cursor-pointer"
                    onClick={handleCreateGuidedWorkOrder}
                  >
                    <div className="font-semibold text-lg text-foreground">Guided Work Order</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Step-by-step wizard with location, problem search, duplicate detection, and troubleshooting tips
                    </div>
                  </button>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setShowWorkOrderTypeModal(false)}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reject Reason Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-card rounded-lg max-w-md w-full">
              <div className="p-4 sm:p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl sm:text-2xl font-bold">Reject Work Order</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowRejectModal(false);
                      setRejectingWorkOrderId(null);
                      setRejectionReason('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <div>
                  <Label>Rejection Reason *</Label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 min-h-[100px]"
                    placeholder="Please provide a reason for rejecting this work order..."
                    autoFocus
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    variant="destructive"
                    onClick={confirmReject}
                    disabled={!rejectionReason.trim()}
                  >
                    Reject Work Order
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRejectModal(false);
                      setRejectingWorkOrderId(null);
                      setRejectionReason('');
                    }}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Assign to Subcontractor Modal */}
        {showAssignModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-card rounded-lg max-w-md w-full">
              <div className="p-4 sm:p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl sm:text-2xl font-bold">Assign to Subcontractor</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAssignModal(false);
                      setWorkOrderToAssign(null);
                      setSelectedSubcontractorForAssign('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                {workOrderToAssign && (
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="font-semibold text-blue-900 mb-1">{workOrderToAssign.title}</h3>
                    <p className="text-sm text-blue-700">{workOrderToAssign.workOrderNumber}</p>
                  </div>
                )}

                <div>
                  <Label>Select Subcontractor *</Label>
                  <SearchableSelect
                    className="mt-1"
                    value={selectedSubcontractorForAssign}
                    onValueChange={setSelectedSubcontractorForAssign}
                    options={[
                      { value: '', label: 'Choose a subcontractor...' },
                      ...subcontractors
                        .filter((sub) => sub.status === 'approved')
                        .map((subcontractor) => ({
                          value: subcontractor.id,
                          label: `${subcontractor.fullName} (${subcontractor.email})`,
                        })),
                    ]}
                    placeholder="Choose a subcontractor..."
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={handleSubmitAssignment}
                    disabled={submitting || !selectedSubcontractorForAssign}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    {submitting ? 'Assigning...' : 'Assign Work Order'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAssignModal(false);
                      setWorkOrderToAssign(null);
                      setSelectedSubcontractorForAssign('');
                    }}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import Work Orders Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-card rounded-lg max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6 border-b sticky top-0 bg-card z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl sm:text-2xl font-bold">Import Work Orders</h2>
                  <Button variant="outline" size="sm" onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setImportPreview([]);
                    // Reset file input
                    const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
                    if (fileInput) fileInput.value = '';
                  }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <div>
                  <Label>Upload CSV/XLSX File *</Label>
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    id="import-file-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setImportFile(file);
                        handleFilePreview(file);
                      }
                    }}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Supported formats: CSV, XLSX, XLS
                  </p>
                </div>

                {importPreview.length > 0 && importPreview[0] && Object.keys(importPreview[0]).length > 0 && (
                  <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                    <h3 className="font-semibold mb-2">Preview ({importPreview.length} rows)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-muted">
                            {Object.keys(importPreview[0]).map((key) => (
                              <th key={key} className="border p-2 text-left font-semibold">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.slice(0, 5).map((row, idx) => (
                            <tr key={idx} className="border-b">
                              {Object.keys(importPreview[0]).map((key, valIdx) => (
                                <td key={valIdx} className="border p-2">
                                  {row[key] !== null && row[key] !== undefined ? String(row[key]) : '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importPreview.length > 5 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Showing first 5 of {importPreview.length} rows
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={handleImportWorkOrders}
                    disabled={!importFile || importing || importPreview.length === 0}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {importing ? 'Importing...' : `Import ${importPreview.length} Work Order(s)`}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowImportModal(false);
                      setImportFile(null);
                      setImportPreview([]);
                      // Reset file input
                      const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
                      if (fileInput) fileInput.value = '';
                    }}
                    disabled={importing}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default function WorkOrdersManagement() {
  return (
    <Suspense fallback={<AdminLayout><div /></AdminLayout>}>
      <WorkOrdersContent />
    </Suspense>
  );
}
