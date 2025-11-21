'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, addDoc, where, deleteDoc, getDoc, Timestamp, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { notifyClientOfWorkOrderApproval, notifyBiddingOpportunity, notifyClientOfInvoice, notifyScheduledService } from '@/lib/notifications';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Share2, UserPlus, ClipboardList, Image as ImageIcon, Plus, Edit2, Save, X, Search, Trash2, Eye, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useViewControls } from '@/contexts/view-controls-context';

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
  status: 'pending' | 'approved' | 'rejected' | 'bidding' | 'quotes_received' | 'to_be_started' | 'assigned' | 'completed' | 'accepted_by_subcontractor' | 'rejected_by_subcontractor';
  images: string[];
  assignedTo?: string;
  assignedToName?: string;
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
  status: 'pending' | 'approved' | 'rejected';
}

interface Category {
  id: string;
  name: string;
}

export default function WorkOrdersManagement() {
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
  
  // Work order type selection modal
  const [showWorkOrderTypeModal, setShowWorkOrderTypeModal] = useState(false);
  
  // Assign to subcontractor modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [workOrderToAssign, setWorkOrderToAssign] = useState<WorkOrder | null>(null);
  const [selectedSubcontractorForAssign, setSelectedSubcontractorForAssign] = useState<string>('');


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

  const fetchWorkOrders = async () => {
    try {
      const workOrdersQuery = query(collection(db, 'workOrders'));
      const snapshot = await getDocs(workOrdersQuery);
      const workOrdersData = await Promise.all(
        snapshot.docs.map(async (woDoc) => {
          const woData = { id: woDoc.id, ...woDoc.data() } as WorkOrder;

          // Fetch quote count for this work order
          const quotesQuery = query(
            collection(db, 'quotes'),
            where('workOrderId', '==', woDoc.id)
          );
          const quotesSnapshot = await getDocs(quotesQuery);
          woData.quoteCount = quotesSnapshot.size;

          // Check if invoice exists for this work order
          const invoicesQuery = query(
            collection(db, 'invoices'),
            where('workOrderId', '==', woDoc.id)
          );
          const invoicesSnapshot = await getDocs(invoicesQuery);
          woData.hasInvoice = !invoicesSnapshot.empty;

          return woData;
        })
      );
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
  }, []);


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

      // Notify client about work order approval
      await notifyClientOfWorkOrderApproval(
        workOrderData.clientId,
        workOrderId,
        workOrderData.workOrderNumber || workOrderId
      );

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

      await updateDoc(doc(db, 'workOrders', rejectingWorkOrderId), {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedAt: serverTimestamp(),
        rejectionReason: rejectionReason,
        updatedAt: serverTimestamp(),
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
    setShowWorkOrderTypeModal(false);
    setShowModal(true);
  };

  const handleCreateRecurringWorkOrder = () => {
    setShowWorkOrderTypeModal(false);
    window.location.href = '/admin-portal/recurring-work-orders/create';
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
    if (workOrder.status !== 'completed') {
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
        const quoteAmount = acceptedQuote.clientAmount || acceptedQuote.totalAmount || 0;
        
        // Only use quote amount if it's valid (> 0)
        if (quoteAmount > 0) {
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
        invoiceAmount = workOrder.estimateBudget || 0;
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

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now().toString().slice(-8).toUpperCase()}`;
      
      // Create invoice data
      const invoiceData: any = {
        invoiceNumber,
        workOrderId: workOrder.id,
        workOrderTitle: workOrder.title,
        clientId: workOrder.clientId,
        clientName: workOrder.clientName,
        clientEmail: workOrder.clientEmail,
        status: 'draft' as const,
        totalAmount: invoiceAmount,
        lineItems: lineItems,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        notes: `Invoice for completed work order: ${workOrder.workOrderNumber}`,
        createdAt: serverTimestamp(),
      };

      // Only add subcontractor fields if they exist
      if (workOrder.assignedTo) {
        invoiceData.subcontractorId = workOrder.assignedTo;
      }
      if (workOrder.assignedToName) {
        invoiceData.subcontractorName = workOrder.assignedToName;
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

      // Generate PDF
      const { generateInvoicePDF } = await import('@/lib/pdf-generator');
      const pdf = generateInvoicePDF({
        invoiceNumber: invoiceData.invoiceNumber,
        clientName: invoiceData.clientName,
        clientEmail: invoiceData.clientEmail,
        workOrderName: workOrder.title,
        vendorName: workOrder.assignedToName || undefined,
        serviceDescription: workOrder.description,
        lineItems: invoiceData.lineItems,
        subtotal: invoiceData.totalAmount,
        taxRate: 0,
        taxAmount: 0,
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
          clientName: workOrder.clientName || invoiceData.clientName,
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

      // Update invoice with payment link
      await updateDoc(invoiceRef, {
        stripePaymentLink,
        status: 'sent',
        sentAt: serverTimestamp(),
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
          toName: workOrder.clientName,
          invoiceNumber,
          workOrderTitle: workOrder.title,
          totalAmount: invoiceData.totalAmount,
          dueDate: formattedDueDate,
          lineItems: invoiceData.lineItems,
          notes: invoiceData.notes,
          stripePaymentLink,
          pdfBase64,
        }),
      });

      const emailResult = await emailResponse.json();

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
      // Update work order to mark schedule as shared
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        scheduleSharedWithClient: true,
        scheduleSharedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Notify client about scheduled service
      const serviceDate = workOrder.scheduledServiceDate?.toDate?.() || new Date(workOrder.scheduledServiceDate);
      const formattedDate = serviceDate.toLocaleDateString();
      const formattedTime = workOrder.scheduledServiceTime || 'N/A';

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
        console.log('Subcontractor data:', { id: doc.id, data });
        return {
          id: doc.id,
          uid: data.uid || doc.id, // Use uid if exists, otherwise use doc.id
          fullName: data.fullName,
          email: data.email,
          businessName: data.businessName,
          status: data.status,
        };
      }) as Subcontractor[];

      console.log('Mapped subcontractors:', subsData);

      setSubcontractors(subsData);
      setWorkOrderToAssign(workOrder);
      setSelectedSubcontractorForAssign('');
      setShowAssignModal(true);
    } catch (error) {
      console.error('Error loading subcontractors:', error);
      toast.error('Failed to load subcontractors');
    }
  };

  const handleSubmitAssignment = async () => {
    if (!workOrderToAssign || !selectedSubcontractorForAssign) {
      toast.error('Please select a subcontractor');
      return;
    }

    setSubmitting(true);

    try {
      console.log('Selected subcontractor UID:', selectedSubcontractorForAssign);
      console.log('Available subcontractors:', subcontractors.map(s => ({ id: s.id, uid: s.uid, fullName: s.fullName })));
      
      const subcontractor = subcontractors.find(s => s.id === selectedSubcontractorForAssign);
      console.log('Found subcontractor:', subcontractor);
      
      if (!subcontractor) {
        toast.error('Invalid subcontractor selected');
        return;
      }

      // Update work order status and assignment
      await updateDoc(doc(db, 'workOrders', workOrderToAssign.id), {
        status: 'assigned',
        assignedTo: subcontractor.uid || subcontractor.id,
        assignedToName: subcontractor.fullName,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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

      // Preserve isMaintenanceRequestOrder if editing and it was already true
      if (editingId && formData.isMaintenanceRequestOrder) {
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
        const workOrderNumber = `WO-${Date.now().toString().slice(-8).toUpperCase()}`;
        await addDoc(collection(db, 'workOrders'), {
          ...workOrderData,
          workOrderNumber,
          images: [],
          createdAt: serverTimestamp(),
        });
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

      // Map subcontractors data and filter by category
      const allSubsData = subsSnapshot.docs.map(doc => ({
        id: doc.id,
        fullName: doc.data().fullName,
        email: doc.data().email,
        businessName: doc.data().businessName,
        skills: doc.data().skills || [],
      })) as (Subcontractor & { skills: string[] })[];

      // Filter by work order category (if category exists)
      let filteredSubs = allSubsData;
      if (workOrder.category) {
        const categoryLower = workOrder.category.toLowerCase();
        filteredSubs = allSubsData.filter(sub => {
          // Check if subcontractor has matching skill/category
          if (!sub.skills || sub.skills.length === 0) {
            // If no skills specified, include all (backward compatibility)
            return true;
          }
          return sub.skills.some(skill => 
            skill.toLowerCase().includes(categoryLower) || 
            categoryLower.includes(skill.toLowerCase())
          );
        });

        // If no matches found, show all (with warning)
        if (filteredSubs.length === 0) {
          toast.warning(`No subcontractors found matching category "${workOrder.category}". Showing all subcontractors.`);
          filteredSubs = allSubsData;
        } else {
          toast.success(`Found ${filteredSubs.length} subcontractor(s) matching category "${workOrder.category}"`);
        }
      }

      // Map to Subcontractor type (remove skills for display)
      const subsData = filteredSubs.map(sub => ({
        id: sub.id,
        fullName: sub.fullName,
        email: sub.email,
        businessName: sub.businessName,
      })) as Subcontractor[];

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
      const promises = selectedSubcontractors.map(async (subId) => {
        const sub = subcontractors.find(s => s.id === subId);
        if (!sub) return;

        await addDoc(collection(db, 'biddingWorkOrders'), {
          workOrderId: workOrderToShare.id,
          workOrderNumber: workOrderNumber,
          subcontractorId: subId,
          subcontractorName: sub.fullName,
          subcontractorEmail: sub.email,
          workOrderTitle: workOrderToShare.title,
          workOrderDescription: workOrderToShare.description,
          clientId: workOrderToShare.clientId,
          clientName: workOrderToShare.clientName,
          status: 'pending',
          sharedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });

        // Notify will be done after all bidding work orders are created
      });

      await Promise.all(promises);

      // Notify all selected subcontractors about bidding opportunity
      await notifyBiddingOpportunity(
        selectedSubcontractors,
        workOrderToShare.id,
        workOrderNumber,
        workOrderToShare.title
      );

      // Send email notifications to all selected subcontractors
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
        }
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
      await updateDoc(doc(db, 'workOrders', workOrderToShare.id), {
        status: 'bidding',
        workOrderNumber: workOrderNumber,
        sharedForBiddingAt: serverTimestamp(),
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
      fetchWorkOrders();
    } catch (error) {
      console.error('Error deleting work order:', error);
      toast.error('Failed to delete work order');
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
    // Filter by status
    const statusMatch = filter === 'all' || wo.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      wo.title?.toLowerCase().includes(searchLower) ||
      wo.description?.toLowerCase().includes(searchLower) ||
      wo.clientName?.toLowerCase().includes(searchLower) ||
      wo.workOrderNumber?.toLowerCase().includes(searchLower) ||
      wo.category?.toLowerCase().includes(searchLower);

    return statusMatch && searchMatch;
  });

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'approved': return 'text-green-600 bg-green-50';
      case 'rejected': return 'text-red-600 bg-red-50';
      case 'bidding': return 'text-blue-600 bg-blue-50';
      case 'quotes_received': return 'text-purple-600 bg-purple-50';
      case 'to_be_started': return 'text-orange-600 bg-orange-50';
      case 'assigned': return 'text-indigo-600 bg-indigo-50';
      case 'completed': return 'text-emerald-600 bg-emerald-50';
      case 'accepted_by_subcontractor': return 'text-green-600 bg-green-50';
      case 'rejected_by_subcontractor': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
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
      completed: 'Completed',
      accepted_by_subcontractor: 'Accepted by Subcontractor',
      rejected_by_subcontractor: 'Rejected by Subcontractor',
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
      default: return 'text-gray-600 bg-gray-50';
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

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Work Orders</h1>
            <p className="text-gray-600 mt-2 text-sm sm:text-base">Manage work orders and assignments</p>
          </div>
          <Button 
            onClick={handleOpenCreate}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Create Work Order</span>
            <span className="sm:hidden">Create</span>
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search work orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div>
            <Label className="text-sm text-gray-600 mb-1">Filter by Status</Label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="w-full border border-gray-300 rounded-md p-2 bg-white"
            >
              <option value="all">All ({workOrders.length})</option>
              <option value="pending">Pending ({workOrders.filter(w => w.status === 'pending').length})</option>
              <option value="approved">Approved ({workOrders.filter(w => w.status === 'approved').length})</option>
              <option value="bidding">Bidding ({workOrders.filter(w => w.status === 'bidding').length})</option>
              <option value="quotes_received">Quotes Received ({workOrders.filter(w => w.status === 'quotes_received').length})</option>
              <option value="to_be_started">To Be Started ({workOrders.filter(w => w.status === 'to_be_started').length})</option>
              <option value="assigned">Assigned ({workOrders.filter(w => w.status === 'assigned').length})</option>
              <option value="completed">Completed ({workOrders.filter(w => w.status === 'completed').length})</option>
              <option value="accepted_by_subcontractor">Accepted by Subcontractor ({workOrders.filter(w => w.status === 'accepted_by_subcontractor').length})</option>
              <option value="rejected_by_subcontractor">Rejected by Subcontractor ({workOrders.filter(w => w.status === 'rejected_by_subcontractor').length})</option>
            </select>
          </div>
        </div>

        {/* Work Orders Grid/List */}
        {sortedWorkOrders.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No work orders found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Work Order #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Budget</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedWorkOrders.map((workOrder) => (
                  <tr key={workOrder.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">{workOrder.title}</div>
                      <div className="text-gray-500 text-xs mt-1 line-clamp-1">{workOrder.description}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{workOrder.workOrderNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{workOrder.clientName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{workOrder.category}</td>
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
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {workOrder.estimateBudget ? `$${workOrder.estimateBudget.toLocaleString()}` : '-'}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {sortedWorkOrders.map((workOrder) => (
              <Card
                key={workOrder.id}
                className="h-full flex flex-col min-h-[500px] hover:shadow-lg transition-shadow"
              >
                <CardHeader className="flex-shrink-0 pb-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-lg line-clamp-2 flex-1 min-w-0">{workOrder.title}</CardTitle>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusColor(workOrder.status)}`}>
                        {getStatusLabel(workOrder.status)}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${getPriorityColor(workOrder.priority)}`}>
                        {(workOrder.priority || 'medium').toUpperCase()}
                      </span>
                      <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-semibold whitespace-nowrap">
                        {workOrder.workOrderNumber}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col space-y-3 pb-4">
                  <p className="text-sm text-gray-600 line-clamp-2 min-h-[2.5rem]">{workOrder.description}</p>

                  <div className="space-y-2 flex-shrink-0">
                    <div className="text-sm">
                      <span className="font-semibold">Client:</span> <span className="text-gray-700">{workOrder.clientName}</span>
                    </div>
                    {workOrder.appyRequestor && (
                      <div className="text-sm">
                        <span className="font-semibold">APPY Requestor:</span> <span className="text-gray-700">{workOrder.appyRequestor}</span>
                      </div>
                    )}
                    <div className="text-sm">
                      <span className="font-semibold">Category:</span> <span className="text-gray-700">{workOrder.category}</span>
                    </div>
                    <div className="text-sm min-h-[1.25rem]">
                      {workOrder.estimateBudget ? (
                        <>
                          <span className="font-semibold">Estimate Budget:</span> <span className="text-gray-700">${workOrder.estimateBudget.toLocaleString()}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">No budget estimate</span>
                      )}
                    </div>
                    <div className="text-sm min-h-[1.25rem]">
                      {workOrder.assignedToName ? (
                        <>
                          <span className="font-semibold">Assigned to:</span> <span className="text-gray-700">{workOrder.assignedToName}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">Not assigned</span>
                      )}
                    </div>
                    <div className="text-sm min-h-[1.25rem]">
                      {workOrder.quoteCount !== undefined && workOrder.quoteCount > 0 ? (
                        <>
                          <span className="font-semibold">Quotes Received:</span> <span className="text-gray-700">{workOrder.quoteCount}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">No quotes yet</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-600 min-h-[1.5rem] flex-shrink-0">
                    {workOrder.images && workOrder.images.length > 0 ? (
                      <>
                        <ImageIcon className="h-4 w-4" />
                        <span>{workOrder.images.length} image(s)</span>
                      </>
                    ) : (
                      <span className="text-gray-400">No images</span>
                    )}
                  </div>

                  {/* Status-specific content area - always reserves space */}
                  <div className="flex-1 min-h-[120px] flex flex-col justify-end">
                    {workOrder.status === 'accepted_by_subcontractor' && (
                      <div className="space-y-2 mb-2">
                        {workOrder.scheduledServiceDate && workOrder.scheduledServiceTime ? (
                          <div className="space-y-2">
                            <div className="text-sm bg-green-50 p-3 rounded-md">
                              <p className="font-semibold text-green-800">Scheduled Service:</p>
                              <p className="text-green-700">
                                {workOrder.scheduledServiceDate?.toDate?.().toLocaleDateString() || 'N/A'} at {workOrder.scheduledServiceTime}
                              </p>
                            </div>
                            <div className="text-sm bg-blue-50 p-3 rounded-md flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              <p className="text-blue-800 text-xs">Schedule automatically shared with client</p>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm bg-green-50 p-3 rounded-md min-h-[60px] flex items-center">
                            <span className="text-green-700">No schedule set</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons - Always at bottom */}
                  <div className="pt-4 space-y-2 border-t border-gray-200 flex-shrink-0">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-w-0"
                        onClick={() => window.location.href = `/admin-portal/work-orders/${workOrder.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">View</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-w-0"
                        onClick={() => handleOpenEdit(workOrder)}
                      >
                        <Edit2 className="h-4 w-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="px-2 sm:px-3"
                        onClick={() => handleDeleteWorkOrder(workOrder)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Status-specific action buttons - always reserve same space */}
                    <div className="min-h-[36px] flex items-center">
                      {workOrder.status === 'pending' && (
                        <div className="flex flex-wrap gap-2 w-full">
                          <Button
                            size="sm"
                            className="flex-1 min-w-0"
                            onClick={() => handleApprove(workOrder.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1 sm:mr-2" />
                            <span className="hidden sm:inline">Approve</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1 min-w-0"
                            onClick={() => handleReject(workOrder.id)}
                          >
                            <XCircle className="h-4 w-4 mr-1 sm:mr-2" />
                            <span className="hidden sm:inline">Reject</span>
                          </Button>
                        </div>
                      )}

                      {workOrder.status === 'approved' && (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleShareForBidding(workOrder)}
                        >
                          <Share2 className="h-4 w-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Share for Bidding</span>
                          <span className="sm:hidden">Share</span>
                        </Button>
                      )}

                      {workOrder.status === 'quotes_received' && (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => window.location.href = `/admin-portal/quotes?workOrderId=${workOrder.id}`}
                        >
                          <span className="hidden sm:inline">View Quotes</span>
                          <span className="sm:hidden">Quotes</span>
                        </Button>
                      )}

                      {workOrder.status === 'to_be_started' && (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleAssignToSubcontractor(workOrder)}
                        >
                          <UserPlus className="h-4 w-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Assign to Subcontractor</span>
                          <span className="sm:hidden">Assign</span>
                        </Button>
                      )}

                      {workOrder.status === 'rejected_by_subcontractor' && (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleAssignToSubcontractor(workOrder)}
                        >
                          <UserPlus className="h-4 w-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Reassign to Subcontractor</span>
                          <span className="sm:hidden">Reassign</span>
                        </Button>
                      )}

                      {workOrder.status === 'completed' && !workOrder.hasInvoice && (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleSendInvoice(workOrder)}
                        >
                          <Receipt className="h-4 w-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Generate & Send Invoice</span>
                          <span className="sm:hidden">Generate & Send</span>
                        </Button>
                      )}

                      {workOrder.status === 'completed' && workOrder.hasInvoice && (
                        <div className="w-full text-center text-sm text-green-600 bg-green-50 py-2 px-3 rounded-md flex items-center justify-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          <span>Invoice Sent</span>
                        </div>
                      )}

                      {!['pending', 'approved', 'quotes_received', 'to_be_started', 'rejected_by_subcontractor', 'completed', 'accepted_by_subcontractor'].includes(workOrder.status) && (
                        <div className="w-full h-[36px]"></div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10">
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
                    <select
                      value={formData.clientId}
                      onChange={(e) => {
                        setFormData({ ...formData, clientId: e.target.value, companyId: '', locationId: '' });
                      }}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="">Choose a client...</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>
                          {client.fullName} ({client.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  {editingId && workOrders.find(wo => wo.id === editingId)?.appyRequestor && (
                    <div>
                      <Label>APPY Requestor</Label>
                      <Input
                        type="text"
                        value={workOrders.find(wo => wo.id === editingId)?.appyRequestor || ''}
                        disabled
                        className="w-full border border-gray-300 rounded-md p-2 bg-gray-50"
                        placeholder="N/A"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        This field is set automatically from the maintenance API request
                      </p>
                    </div>
                  )}

                  <div>
                    <Label>Company *</Label>
                    <select
                      value={formData.companyId}
                      onChange={(e) => {
                        handleCompanySelect(e.target.value);
                      }}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="">Choose a company...</option>
                      {companies.map(company => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                    {!formData.companyId && companies.length === 0 && (
                      <p className="text-xs text-yellow-600 mt-1">
                        No companies found. Please add companies first.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Select Location *</Label>
                    <select
                      value={formData.locationId}
                      onChange={(e) => handleLocationSelect(e.target.value)}
                      className="w-full border border-gray-300 rounded-md p-2"
                      disabled={!formData.companyId}
                    >
                      <option value="">Choose a location...</option>
                      {filteredLocationsForForm.map(location => (
                        <option key={location.id} value={location.id}>
                          {location.locationName}
                        </option>
                      ))}
                    </select>
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
                    <p className="text-xs text-gray-500 mt-1">Estimated budget in USD</p>
                  </div>

                  <div>
                    <Label>Category *</Label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="">Select category...</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label>Priority *</Label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div>
                    <Label>Status *</Label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="bidding">Bidding</option>
                      <option value="quotes_received">Quotes Received</option>
                      <option value="assigned">Assigned</option>
                      <option value="completed">Completed</option>
                    </select>
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
                      <Label htmlFor="isMaintenanceRequestOrder" className={formData.isMaintenanceRequestOrder ? 'text-gray-500' : ''}>
                        Maintenance Request Order
                      </Label>
                      {formData.isMaintenanceRequestOrder && (
                        <span className="text-xs text-gray-500 ml-2">(This field cannot be edited)</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    disabled={submitting}
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold">Share for Bidding</h2>
                    <p className="text-sm text-gray-600 mt-1">
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
                    <label htmlFor="selectAll" className="text-sm font-medium text-gray-700">
                      Select All ({subcontractors.length})
                    </label>
                  </div>
                  <div className="text-sm text-gray-600">
                    {selectedSubcontractors.length} selected
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-4">
                  {subcontractors.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No approved subcontractors found</p>
                  ) : (
                    subcontractors.map((sub) => (
                      <div
                        key={sub.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                          selectedSubcontractors.includes(sub.id)
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
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
                          <p className="font-medium text-gray-900">{sub.fullName}</p>
                          {sub.businessName && (
                            <p className="text-sm text-gray-600">{sub.businessName}</p>
                          )}
                          <p className="text-sm text-gray-500">{sub.email}</p>
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg max-w-md w-full">
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
                <p className="text-gray-600 mb-6">Choose the type of work order you want to create:</p>
                
                <div className="space-y-3">
                  <button
                    className="w-full p-4 text-left border-2 border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all duration-200 cursor-pointer"
                    onClick={handleCreateNormalWorkOrder}
                  >
                    <div className="font-semibold text-lg text-gray-900">Normal Work Order</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Create a one-time work order for immediate or scheduled work
                    </div>
                  </button>

                  <button
                    className="w-full p-4 text-left border-2 border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all duration-200 cursor-pointer"
                    onClick={handleCreateRecurringWorkOrder}
                  >
                    <div className="font-semibold text-lg text-gray-900">Recurring Work Order</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Create a recurring work order that repeats automatically (daily, weekly, monthly, yearly, or custom)
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg max-w-md w-full">
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg max-w-md w-full">
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
                  <select
                    value={selectedSubcontractorForAssign}
                    onChange={(e) => setSelectedSubcontractorForAssign(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2"
                  >
                    <option value="">Choose a subcontractor...</option>
                    {subcontractors
                      .filter(sub => sub.status === 'approved')
                      .map(subcontractor => (
                        <option key={subcontractor.id} value={subcontractor.id}>
                          {subcontractor.fullName} ({subcontractor.email})
                        </option>
                      ))}
                  </select>
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
      </div>
    </AdminLayout>
  );
}
