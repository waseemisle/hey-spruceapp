'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, serverTimestamp, getDoc, Timestamp, getDocs, addDoc } from 'firebase/firestore';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { notifyWorkOrderCompletion, notifyScheduledService, notifyQuoteSubmission, getAllAdminUserIds } from '@/lib/notifications';
import { createNotification } from '@/lib/notifications';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardList, CheckSquare, Calendar, MapPin, AlertCircle, CheckCircle, Search, X, Clock, Upload, Image as ImageIcon, Loader2, Stethoscope, Wrench, DollarSign, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { formatAddress } from '@/lib/utils';
import { uploadMultipleToCloudinary } from '@/lib/cloudinary-upload';

const DEFAULT_DIAGNOSTIC_FEE = 69;

interface AssignedJob {
  id: string;
  workOrderId: string;
  subcontractorId: string;
  assignedAt: any;
  status: 'pending_acceptance' | 'accepted' | 'rejected';
  acceptedAt?: any;
  rejectedAt?: any;
  scheduledServiceDate?: any;
  scheduledServiceTime?: string;
}

interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  locationName: string;
  locationAddress: string;
  clientId?: string;
  clientName: string;
  clientEmail: string;
  images?: string[];
  status: string;
  createdAt: any;
  completedAt?: any;
  // Diagnostic → Repair workflow
  diagnosticFee?: number;
  diagnosticNotes?: string;
  diagnosticSubmittedAt?: any;
  billingPhase?: 'diagnostic' | 'repair';
}

interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

const PRIORITY_CONFIG: Record<string, { className: string; dot: string }> = {
  low: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  medium: { className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  high: { className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

const JOB_STATUS_CONFIG: Record<string, { className: string; dot: string; label: string }> = {
  pending_acceptance: { className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'Pending Acceptance' },
  accepted: { className: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', label: 'Accepted' },
  rejected: { className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500', label: 'Rejected' },
  diagnostic_submitted: { className: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500', label: 'Awaiting Admin Decision' },
  repair_approved: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Repair Approved' },
  repair_declined: { className: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500', label: 'Repair Declined' },
  completed: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Completed' },
};

export default function SubcontractorAssignedJobs() {
  const { auth, db } = useFirebaseInstance();
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [workOrders, setWorkOrders] = useState<Map<string, WorkOrder>>(new Map());
  /** Set of workOrderIds for which this sub has already submitted a non-diagnostic (repair) quote. */
  const [repairQuoteSubmittedWoIds, setRepairQuoteSubmittedWoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Accept assignment modal
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [acceptSubmitting, setAcceptSubmitting] = useState(false);
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);
  const [acceptingWorkOrderId, setAcceptingWorkOrderId] = useState<string | null>(null);
  const [serviceDate, setServiceDate] = useState('');
  const [serviceTimeStart, setServiceTimeStart] = useState('09:00');
  const [serviceTimeEnd, setServiceTimeEnd] = useState('17:00');

  // Completion modal (used only for repair-approved and repair-declined flows)
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionSubmitting, setCompletionSubmitting] = useState(false);
  const [completingWorkOrderId, setCompletingWorkOrderId] = useState<string | null>(null);
  const [completionDetails, setCompletionDetails] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionFiles, setCompletionFiles] = useState<FileList | null>(null);
  const [completionPreviewUrls, setCompletionPreviewUrls] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Diagnostic submission modal
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [diagnosticSubmitting, setDiagnosticSubmitting] = useState(false);
  const [diagnosticWorkOrderId, setDiagnosticWorkOrderId] = useState<string | null>(null);
  const [diagnosticFee, setDiagnosticFee] = useState<string>(String(DEFAULT_DIAGNOSTIC_FEE.toFixed(2)));
  const [diagnosticTimeSpent, setDiagnosticTimeSpent] = useState<string>('');
  const [diagnosticNotes, setDiagnosticNotes] = useState<string>('');

  // Repair quote modal
  const [showRepairQuoteModal, setShowRepairQuoteModal] = useState(false);
  const [repairQuoteSubmitting, setRepairQuoteSubmitting] = useState(false);
  const [repairQuoteWorkOrderId, setRepairQuoteWorkOrderId] = useState<string | null>(null);
  const [repairLineItems, setRepairLineItems] = useState<QuoteLineItem[]>([
    { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
    { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
  ]);
  const [repairTaxRate, setRepairTaxRate] = useState<string>('0');
  const [repairNotes, setRepairNotes] = useState<string>('');

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const assignedQuery = query(
          collection(db, 'assignedJobs'),
          where('subcontractorId', '==', user.uid),
          orderBy('assignedAt', 'desc')
        );

        const unsubscribeSnapshot = onSnapshot(assignedQuery, async (snapshot) => {
          const assignedData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as AssignedJob[];

          setAssignedJobs(assignedData);

          const workOrderIds = [...new Set(assignedData.map(job => job.workOrderId).filter(Boolean))];

          if (workOrderIds.length > 0) {
            const workOrdersMap = new Map<string, WorkOrder>();
            const fetchPromises = workOrderIds.map(async (woId) => {
              try {
                const woDoc = await getDoc(doc(db, 'workOrders', woId));
                if (woDoc.exists()) {
                  workOrdersMap.set(woDoc.id, { id: woDoc.id, ...woDoc.data() } as WorkOrder);
                }
              } catch (err) {
                console.warn(`Could not fetch work order ${woId}:`, err);
              }
            });
            await Promise.all(fetchPromises);
            setWorkOrders(workOrdersMap);

            // Load which WOs this sub already submitted a repair quote for
            try {
              const quotesSnap = await getDocs(query(
                collection(db, 'quotes'),
                where('subcontractorId', '==', user.uid),
              ));
              const repairSet = new Set<string>();
              quotesSnap.docs.forEach(d => {
                const q = d.data() as any;
                if (q.workOrderId && q.isDiagnosticQuote !== true) {
                  repairSet.add(q.workOrderId);
                }
              });
              setRepairQuoteSubmittedWoIds(repairSet);
            } catch (err) {
              console.warn('Could not load repair quotes for sub:', err);
            }

            setLoading(false);
          } else {
            setLoading(false);
          }
        }, (error) => {
          console.error('Assigned jobs listener error:', error);
          setLoading(false);
        });

        return () => {
          unsubscribeSnapshot();
        };
      } else {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, [auth, db]);

  const handleAcceptAssignment = (assignedJobId: string, workOrderId: string) => {
    setAcceptingJobId(assignedJobId);
    setAcceptingWorkOrderId(workOrderId);
    setShowAcceptModal(true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setServiceDate(tomorrow.toISOString().split('T')[0]);
    setServiceTimeStart('09:00');
    setServiceTimeEnd('17:00');
  };

  const handleConfirmAccept = async () => {
    if (!serviceDate || !serviceTimeStart) {
      toast.error('Please select service date and arrival time');
      return;
    }
    if (serviceTimeEnd && serviceTimeEnd <= serviceTimeStart) {
      toast.error('End time must be after start time');
      return;
    }
    if (!acceptingJobId || !acceptingWorkOrderId) return;

    setAcceptSubmitting(true);
    const jobId = acceptingJobId;
    const woId = acceptingWorkOrderId;
    const currentUser = auth.currentUser;

    try {
      await updateDoc(doc(db, 'assignedJobs', jobId), {
        status: 'accepted', acceptedAt: serverTimestamp(),
        scheduledServiceDate: new Date(serviceDate + 'T' + serviceTimeStart),
        scheduledServiceTime: serviceTimeStart,
        scheduledServiceTimeEnd: serviceTimeEnd || null,
      });

      await updateDoc(doc(db, 'workOrders', woId), {
        status: 'accepted_by_subcontractor',
        scheduledServiceDate: new Date(serviceDate + 'T' + serviceTimeStart),
        scheduledServiceTime: serviceTimeStart,
        scheduledServiceTimeEnd: serviceTimeEnd || null,
        updatedAt: serverTimestamp(),
      });

      toast.success('Assignment accepted successfully!');
      setShowAcceptModal(false);
      setAcceptingJobId(null);
      setAcceptingWorkOrderId(null);
      setServiceDate('');
      setServiceTimeStart('09:00');
      setServiceTimeEnd('17:00');
      setAcceptSubmitting(false);

      // Background: timeline, notifications, emails
      (async () => {
        try {
          const woSnap = await getDoc(doc(db, 'workOrders', woId));
          const woData = woSnap.data();
          let subName = woData?.assignedToName || 'Subcontractor';
          if (currentUser) {
            const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
            if (subDoc.exists()) subName = subDoc.data().fullName || subName;
          }

          const timelineEvent = createTimelineEvent({
            type: 'schedule_set', userId: currentUser?.uid || 'unknown', userName: subName, userRole: 'subcontractor',
            details: `Assignment accepted by ${subName}. Scheduled for ${serviceDate} at ${serviceTimeStart}${serviceTimeEnd ? ` - ${serviceTimeEnd}` : ''}`,
            metadata: { serviceDate, serviceTimeStart, serviceTimeEnd: serviceTimeEnd || null },
          });
          await updateDoc(doc(db, 'workOrders', woId), {
            timeline: [...(woData?.timeline || []), timelineEvent],
            systemInformation: {
              ...(woData?.systemInformation || {}),
              scheduledService: {
                date: new Date(serviceDate + 'T' + serviceTimeStart), time: serviceTimeStart,
                setBy: { id: currentUser?.uid || 'unknown', name: subName },
              },
            },
          });

          if (woData?.clientId) {
            const timeRange = serviceTimeEnd ? `${serviceTimeStart} - ${serviceTimeEnd}` : serviceTimeStart;
            notifyScheduledService(woData.clientId, woId, woData.title || woData.workOrderNumber || 'Work Order', new Date(serviceDate + 'T' + serviceTimeStart).toLocaleDateString(), timeRange).catch(console.error);
          }

          if (woData?.clientEmail && woData?.clientName) {
            fetch('/api/email/send-scheduled-service', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
              body: JSON.stringify({
                toEmail: woData.clientEmail, toName: woData.clientName,
                workOrderNumber: woData.workOrderNumber || woId, workOrderTitle: woData.title || 'Work Order',
                scheduledDate: serviceDate, scheduledTimeStart: serviceTimeStart, scheduledTimeEnd: serviceTimeEnd || null,
                locationName: woData.locationName || '', locationAddress: woData.locationAddress || '',
              }),
            }).catch(console.error);
          }

          const adminIds = await getAllAdminUserIds();
          if (adminIds.length > 0) {
            const timeRange = serviceTimeEnd ? `${serviceTimeStart} - ${serviceTimeEnd}` : serviceTimeStart;
            createNotification({
              recipientIds: adminIds, userRole: 'admin', type: 'schedule', title: 'Work Order Scheduled',
              message: `Work Order ${woData?.workOrderNumber || woId} scheduled for ${new Date(serviceDate + 'T' + serviceTimeStart).toLocaleDateString()} ${timeRange}`,
              link: `/admin-portal/work-orders/${woId}`, referenceId: woId, referenceType: 'workOrder',
            }).catch(console.error);
          }
        } catch (e) { console.error('Background accept tasks failed:', e); }
      })();

    } catch (error) {
      console.error('Error accepting assignment:', error);
      toast.error('Failed to accept assignment');
      setAcceptSubmitting(false);
    }
  };

  const handleRejectAssignment = async (assignedJobId: string, workOrderId: string) => {
    const workOrder = workOrders.get(workOrderId);
    toast(`Reject assignment for "${workOrder?.title}"?`, {
      description: 'Please provide a reason for rejection (optional).',
      action: {
        label: 'Reject',
        onClick: async () => {
          const reason = prompt('Please provide a reason for rejection (optional):');
          if (reason === null) return;

          try {
            await updateDoc(doc(db, 'assignedJobs', assignedJobId), {
              status: 'rejected',
              rejectedAt: serverTimestamp(),
              rejectionReason: reason,
            });

            const woDoc = await getDoc(doc(db, 'workOrders', workOrderId));
            const woData = woDoc.data();
            const existingTimeline = woData?.timeline || [];

            const currentUser = auth.currentUser;
            let subName = woData?.assignedToName || 'Subcontractor';
            if (currentUser) {
              const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
              if (subDoc.exists()) subName = subDoc.data().fullName || subName;
            }

            await updateDoc(doc(db, 'workOrders', workOrderId), {
              status: 'rejected_by_subcontractor',
              updatedAt: serverTimestamp(),
              timeline: [...existingTimeline, createTimelineEvent({
                type: 'rejected',
                userId: currentUser?.uid || 'unknown',
                userName: subName,
                userRole: 'subcontractor',
                details: `Assignment rejected by ${subName}${reason ? `. Reason: ${reason}` : ''}`,
                metadata: { context: 'assignment_rejection', reason: reason || '' },
              })],
            });

            toast.success('Assignment rejected. The work order will be available for reassignment.');
          } catch (error) {
            console.error('Error rejecting assignment:', error);
            toast.error('Failed to reject assignment');
          }
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  // ─────────── Diagnostic Submission ───────────

  const openDiagnosticModal = (workOrderId: string) => {
    setDiagnosticWorkOrderId(workOrderId);
    setDiagnosticFee(String(DEFAULT_DIAGNOSTIC_FEE.toFixed(2)));
    setDiagnosticTimeSpent('');
    setDiagnosticNotes('');
    setShowDiagnosticModal(true);
  };

  const handleSubmitDiagnostic = async () => {
    if (!diagnosticWorkOrderId) return;
    const feeNum = Number(diagnosticFee);
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      toast.error('Please enter a valid diagnostic fee');
      return;
    }
    if (!diagnosticNotes.trim()) {
      toast.error('Please enter diagnostic notes describing what you found');
      return;
    }

    setDiagnosticSubmitting(true);
    const woId = diagnosticWorkOrderId;
    const currentUser = auth.currentUser;

    try {
      let subName = 'Subcontractor';
      if (currentUser) {
        try {
          const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
          if (subDoc.exists()) subName = subDoc.data().fullName || subName;
        } catch {}
      }

      const combinedNotes = diagnosticTimeSpent.trim()
        ? `Time Spent: ${diagnosticTimeSpent.trim()}\n\n${diagnosticNotes.trim()}`
        : diagnosticNotes.trim();

      const idToken = await currentUser?.getIdToken();
      const res = await fetch('/api/work-orders/submit-diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({
          workOrderId: woId,
          diagnosticFee: feeNum,
          diagnosticNotes: combinedNotes,
          subName,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to submit diagnostic');
      }

      setWorkOrders(prev => {
        const next = new Map(prev);
        const wo = next.get(woId);
        if (wo) next.set(woId, { ...wo, status: 'diagnostic_submitted', diagnosticFee: feeNum, diagnosticNotes: combinedNotes });
        return next;
      });

      toast.success('Diagnostic submitted. Awaiting admin decision on repair.');
      setShowDiagnosticModal(false);
      setDiagnosticWorkOrderId(null);
      setDiagnosticFee(String(DEFAULT_DIAGNOSTIC_FEE.toFixed(2)));
      setDiagnosticTimeSpent('');
      setDiagnosticNotes('');
      setDiagnosticSubmitting(false);

      // Background: notify admins (fire-and-forget)
      (async () => {
        try {
          const adminIds = await getAllAdminUserIds();
          if (adminIds.length > 0) {
            const woSnap = await getDoc(doc(db, 'workOrders', woId));
            const woData = woSnap.data();
            createNotification({
              recipientIds: adminIds,
              userRole: 'admin',
              type: 'work_order',
              title: 'Diagnostic Submitted',
              message: `Diagnostic submitted for Work Order ${woData?.workOrderNumber || woId}. Awaiting repair decision.`,
              link: `/admin-portal/work-orders/${woId}`,
              referenceId: woId,
              referenceType: 'workOrder',
            }).catch(console.error);
          }
        } catch (e) { console.error('Background diagnostic notify failed:', e); }
      })();

    } catch (error: any) {
      console.error('Error submitting diagnostic:', error);
      toast.error(error.message || 'Failed to submit diagnostic');
      setDiagnosticSubmitting(false);
    }
  };

  // ─────────── Repair Quote ───────────

  const openRepairQuoteModal = (workOrderId: string) => {
    setRepairQuoteWorkOrderId(workOrderId);
    setRepairLineItems([
      { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
      { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
    ]);
    setRepairTaxRate('0');
    setRepairNotes('');
    setShowRepairQuoteModal(true);
  };

  const handleRepairLineItemChange = (index: number, field: keyof QuoteLineItem, value: string | number) => {
    setRepairLineItems(prev => {
      const next = [...prev];
      const item = { ...next[index], [field]: field === 'description' ? String(value) : Number(value) || 0 };
      if (field === 'quantity' || field === 'unitPrice') {
        item.amount = Number(item.quantity) * Number(item.unitPrice);
      }
      next[index] = item;
      return next;
    });
  };

  const addRepairLineItem = () => {
    setRepairLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const removeRepairLineItem = (index: number) => {
    setRepairLineItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  };

  const repairSubtotal = repairLineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0);
  const repairTaxAmount = repairSubtotal * ((Number(repairTaxRate) || 0) / 100);
  const repairTotal = repairSubtotal + repairTaxAmount;

  const handleSubmitRepairQuote = async () => {
    if (!repairQuoteWorkOrderId) return;
    const validItems = repairLineItems.filter(li => li.description.trim() && Number(li.amount) > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one line item with a description and amount');
      return;
    }

    setRepairQuoteSubmitting(true);
    const woId = repairQuoteWorkOrderId;
    const currentUser = auth.currentUser;

    try {
      if (!currentUser) {
        toast.error('You must be signed in');
        setRepairQuoteSubmitting(false);
        return;
      }

      const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
      const subData = subDoc.exists() ? subDoc.data() : {};
      const subName = subData.fullName || subData.businessName || 'Subcontractor';

      const woSnap = await getDoc(doc(db, 'workOrders', woId));
      if (!woSnap.exists()) {
        toast.error('Work order not found');
        setRepairQuoteSubmitting(false);
        return;
      }
      const woData = woSnap.data();

      const labor = validItems
        .filter(li => li.description.toLowerCase().includes('labor'))
        .reduce((s, li) => s + Number(li.amount), 0);
      const material = validItems
        .filter(li => li.description.toLowerCase().includes('material'))
        .reduce((s, li) => s + Number(li.amount), 0);

      const timelineEvent = createQuoteTimelineEvent({
        type: 'created',
        userId: currentUser.uid,
        userName: subName,
        userRole: 'subcontractor',
        details: `Repair quote submitted (diagnostic fee waived) — total $${repairTotal.toFixed(2)}`,
        metadata: { source: 'repair_quote', workOrderNumber: woData.workOrderNumber },
      });

      const quoteRef = await addDoc(collection(db, 'quotes'), {
        workOrderId: woId,
        workOrderNumber: woData.workOrderNumber || '',
        workOrderTitle: woData.title || '',
        workOrderDescription: woData.description || '',
        subcontractorId: currentUser.uid,
        subcontractorName: subName,
        subcontractorEmail: subData.email || '',
        clientId: woData.clientId || '',
        clientName: woData.clientName || '',
        clientEmail: woData.clientEmail || '',
        laborCost: labor,
        materialCost: material,
        additionalCosts: repairTaxAmount,
        discountAmount: 0,
        totalAmount: repairTotal,
        originalAmount: repairTotal,
        lineItems: validItems,
        notes: repairNotes,
        taxRate: Number(repairTaxRate) || 0,
        status: 'pending',
        isDiagnosticQuote: false,
        creationSource: 'repair_quote',
        createdBy: currentUser.uid,
        timeline: [timelineEvent],
        systemInformation: {
          createdBy: {
            id: currentUser.uid,
            name: subName,
            role: 'subcontractor',
            timestamp: Timestamp.now(),
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setRepairQuoteSubmittedWoIds(prev => {
        const next = new Set(prev);
        next.add(woId);
        return next;
      });

      toast.success('Repair quote submitted');
      setShowRepairQuoteModal(false);
      setRepairQuoteWorkOrderId(null);
      setRepairQuoteSubmitting(false);

      // Background: notify client + admins (fire-and-forget)
      (async () => {
        try {
          if (woData.clientId) {
            notifyQuoteSubmission(
              woData.clientId,
              woId,
              woData.workOrderNumber || woId,
              subName,
              repairTotal,
            ).catch(console.error);
          }
          fetch('/api/email/send-quote-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
              notifyAdmins: true,
              workOrderNumber: woData.workOrderNumber || woId,
              workOrderTitle: woData.title || 'Work Order',
              subcontractorName: subName,
              quoteAmount: repairTotal,
            }),
          }).catch(console.error);
        } catch (e) { console.error('Background repair-quote notify failed:', e); }
      })();

    } catch (error: any) {
      console.error('Error submitting repair quote:', error);
      toast.error(error.message || 'Failed to submit repair quote');
      setRepairQuoteSubmitting(false);
    }
  };

  // ─────────── Complete ───────────

  const handleMarkComplete = (workOrderId: string) => {
    setCompletingWorkOrderId(workOrderId);
    setCompletionDetails('');
    setCompletionNotes('');
    setCompletionFiles(null);
    setCompletionPreviewUrls([]);
    setShowCompletionModal(true);
  };

  const handleCompletionFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setCompletionFiles(files);
      const urls = Array.from(files).map(file => URL.createObjectURL(file));
      setCompletionPreviewUrls(urls);
    }
  };

  const removeCompletionImage = (index: number) => {
    if (completionFiles) {
      const dt = new DataTransfer();
      const filesArray = Array.from(completionFiles);
      filesArray.splice(index, 1);
      filesArray.forEach(file => dt.items.add(file));
      setCompletionFiles(dt.files);

      const newUrls = [...completionPreviewUrls];
      URL.revokeObjectURL(newUrls[index]);
      newUrls.splice(index, 1);
      setCompletionPreviewUrls(newUrls);
    }
  };

  const handleConfirmComplete = async () => {
    if (!completingWorkOrderId) return;
    const wo = workOrders.get(completingWorkOrderId);

    // For the decline flow, keep details optional — otherwise require them
    const isDeclinedFlow = wo?.status === 'repair_declined';

    if (!isDeclinedFlow && !completionDetails.trim()) {
      toast.error('Please provide details about the work completed');
      return;
    }
    if (!isDeclinedFlow && (!completionFiles || completionFiles.length === 0)) {
      toast.error('Please upload at least one completion image or file');
      return;
    }

    setCompletionSubmitting(true);
    const woId = completingWorkOrderId;
    const details = completionDetails;
    const notes = completionNotes;
    const currentUser = auth.currentUser;

    // Billing phase: 'diagnostic' on decline, 'repair' on approve, else unspecified (legacy)
    const billingPhase: 'diagnostic' | 'repair' | undefined =
      wo?.status === 'repair_declined' ? 'diagnostic' :
      wo?.status === 'repair_approved' ? 'repair' :
      wo?.billingPhase === 'diagnostic' || wo?.billingPhase === 'repair' ? wo.billingPhase :
      undefined;

    try {
      let completionImageUrls: string[] = [];
      if (completionFiles && completionFiles.length > 0) {
        setUploadingFiles(true);
        try {
          completionImageUrls = await uploadMultipleToCloudinary(completionFiles);
        } catch (error) {
          toast.error('Failed to upload images. Please try again.');
          setUploadingFiles(false);
          setCompletionSubmitting(false);
          return;
        }
        setUploadingFiles(false);
      }

      let subName = 'Subcontractor';
      if (currentUser) {
        try {
          const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
          if (subDoc.exists()) subName = subDoc.data().fullName || subName;
        } catch {}
      }

      const defaultDetails = isDeclinedFlow
        ? `Client declined repair. Diagnostic fee of $${Number(wo?.diagnosticFee || DEFAULT_DIAGNOSTIC_FEE).toFixed(2)} to be billed.`
        : '';

      const idToken = await currentUser?.getIdToken();
      const completeRes = await fetch('/api/work-orders/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({
          workOrderId: woId,
          completionDetails: details.trim() || defaultDetails,
          completionNotes: notes,
          completionImageUrls,
          subName,
          billingPhase,
        }),
      });
      if (!completeRes.ok) {
        const err = await completeRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to mark work order complete');
      }

      setWorkOrders(prev => {
        const updated = new Map(prev);
        const cur = updated.get(woId);
        if (cur) updated.set(woId, { ...cur, status: 'completed', completedAt: new Date(), billingPhase: billingPhase ?? cur.billingPhase });
        return updated;
      });
      toast.success('Job marked as complete!');
      setShowCompletionModal(false);
      setCompletingWorkOrderId(null);
      setCompletionDetails('');
      setCompletionNotes('');
      setCompletionFiles(null);
      setCompletionPreviewUrls([]);
      setCompletionSubmitting(false);

      (async () => {
        try {
          const woSnap = await getDoc(doc(db, 'workOrders', woId));
          const woData = woSnap.data();
          if (woData?.clientId) {
            notifyWorkOrderCompletion(woData.clientId, woId, woData.workOrderNumber || woId).catch(console.error);
          }
          if (woData?.clientEmail && woData?.clientName) {
            fetch('/api/email/send-work-order-completion-client', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
              body: JSON.stringify({ toEmail: woData.clientEmail, toName: woData.clientName, workOrderNumber: woData.workOrderNumber || woId, workOrderTitle: woData.title || 'Work Order', completedBy: subName, locationName: woData.locationName || '' }),
            }).catch(console.error);
          }
          fetch('/api/email/send-work-order-completed-notification', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
            body: JSON.stringify({ workOrderId: woId, workOrderNumber: woData?.workOrderNumber || woId, title: woData?.title || 'Work Order', clientName: woData?.clientName || '', locationName: woData?.locationName || '', priority: woData?.priority || 'medium', completedBy: subName, completionDetails: details || defaultDetails }),
          }).catch(console.error);
        } catch (e) { console.error('Background complete tasks failed:', e); }
      })();

    } catch (error) {
      console.error('Error marking job complete:', error);
      toast.error('Failed to mark job as complete');
      setCompletionSubmitting(false);
    }
  };

  // ─────────── Derived display helpers ───────────

  /**
   * Collapse the (job, workOrder) state pair into a single status used for display
   * and for deciding which action button to render.
   */
  const effectiveStatusFor = (job: AssignedJob, wo: WorkOrder | undefined): string => {
    if (!wo) return job.status;
    if (wo.status === 'completed' || wo.status === 'pending_invoice') return 'completed';
    if (wo.status === 'diagnostic_submitted') return 'diagnostic_submitted';
    if (wo.status === 'repair_approved') return 'repair_approved';
    if (wo.status === 'repair_declined') return 'repair_declined';
    return job.status;
  };

  const filteredJobs = assignedJobs.filter(job => {
    const workOrder = workOrders.get(job.workOrderId);
    const eff = effectiveStatusFor(job, workOrder);

    let statusMatch = true;
    if (filter === 'pending') statusMatch = eff === 'pending_acceptance';
    else if (filter === 'in-progress') statusMatch = eff === 'accepted' || eff === 'diagnostic_submitted' || eff === 'repair_approved' || eff === 'repair_declined';
    else if (filter === 'completed') statusMatch = eff === 'completed';

    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery || !workOrder ||
      (workOrder.title || '').toLowerCase().includes(searchLower) ||
      (workOrder.description || '').toLowerCase().includes(searchLower) ||
      (workOrder.clientName || '').toLowerCase().includes(searchLower) ||
      (workOrder.category || '').toLowerCase().includes(searchLower) ||
      (workOrder.locationName || '').toLowerCase().includes(searchLower) ||
      formatAddress(workOrder.locationAddress).toLowerCase().includes(searchLower);

    return statusMatch && searchMatch;
  });

  const filterOptions = [
    { value: 'all', label: 'All', count: assignedJobs.length },
    {
      value: 'pending',
      label: 'Pending',
      count: assignedJobs.filter(job => effectiveStatusFor(job, workOrders.get(job.workOrderId)) === 'pending_acceptance').length
    },
    {
      value: 'in-progress',
      label: 'In Progress',
      count: assignedJobs.filter(job => {
        const e = effectiveStatusFor(job, workOrders.get(job.workOrderId));
        return e === 'accepted' || e === 'diagnostic_submitted' || e === 'repair_approved' || e === 'repair_declined';
      }).length
    },
    {
      value: 'completed',
      label: 'Completed',
      count: assignedJobs.filter(job => effectiveStatusFor(job, workOrders.get(job.workOrderId)) === 'completed').length
    },
  ];

  const statsData = [
    { label: 'Total Jobs', value: assignedJobs.length, color: 'border-blue-200 bg-blue-50', textColor: 'text-blue-700', icon: <ClipboardList className="h-5 w-5 text-blue-500" /> },
    { label: 'Pending', value: filterOptions[1].count, color: 'border-amber-200 bg-amber-50', textColor: 'text-amber-700', icon: <Clock className="h-5 w-5 text-amber-500" /> },
    { label: 'In Progress', value: filterOptions[2].count, color: 'border-blue-200 bg-blue-50', textColor: 'text-blue-700', icon: <CheckSquare className="h-5 w-5 text-blue-500" /> },
    { label: 'Completed', value: filterOptions[3].count, color: 'border-emerald-200 bg-emerald-50', textColor: 'text-emerald-700', icon: <CheckCircle className="h-5 w-5 text-emerald-500" /> },
  ];

  if (loading) {
    return (
      <SubcontractorLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-7 w-7 text-blue-600" />
              Assigned Jobs
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your assigned work orders</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statsData.map((stat) => (
            <div key={stat.label} className={`rounded-xl border p-4 flex items-center gap-3 ${stat.color}`}>
              <div className="flex-shrink-0">{stat.icon}</div>
              <div>
                <div className={`text-xl font-bold leading-none ${stat.textColor}`}>{stat.value}</div>
                <div className="text-xs mt-0.5 opacity-75">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assigned jobs by title, description, client, category, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex bg-muted rounded-lg p-1 gap-1 flex-shrink-0">
            {filterOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  filter === option.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {option.label} <span className="text-xs opacity-70">({option.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Jobs Grid */}
        {filteredJobs.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-16 text-center">
            <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {filter === 'all' ? 'No assigned jobs yet' : `No ${filter} jobs`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {filter === 'all'
                ? 'Jobs will appear here once your quotes are accepted'
                : 'Try a different filter'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredJobs.map((job) => {
              const workOrder = workOrders.get(job.workOrderId);
              if (!workOrder) return null;

              const eff = effectiveStatusFor(job, workOrder);
              const jobStatusCfg = JOB_STATUS_CONFIG[eff] || JOB_STATUS_CONFIG['pending_acceptance'];
              const priorityCfg = PRIORITY_CONFIG[workOrder.priority] || { className: 'bg-muted text-foreground border-border', dot: 'bg-gray-400' };
              const hasRepairQuote = repairQuoteSubmittedWoIds.has(workOrder.id);

              return (
                <div key={job.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                  {/* Row 1: title + status badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{workOrder.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{workOrder.locationName || workOrder.clientName}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${jobStatusCfg.className}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${jobStatusCfg.dot}`} />
                      {jobStatusCfg.label}
                    </span>
                  </div>
                  {/* Row 2: category + priority */}
                  <div className="flex items-center justify-between text-sm gap-2">
                    <span className="text-muted-foreground truncate">{workOrder.category || '—'}</span>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${priorityCfg.className}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
                      {workOrder.priority}
                    </span>
                  </div>
                  {/* Row 3: actions */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                    {/* Pending acceptance */}
                    {job.status === 'pending_acceptance' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleAcceptAssignment(job.id, workOrder.id)}
                          className="flex-1 h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRejectAssignment(job.id, workOrder.id)}
                          className="h-8 px-2"
                          title="Reject"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}

                    {/* Accepted — show "Submit Diagnostic" */}
                    {job.status === 'accepted' && (workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor') && (
                      <Button
                        size="sm"
                        onClick={() => openDiagnosticModal(workOrder.id)}
                        className="flex-1 h-8 text-xs gap-1 bg-indigo-600 hover:bg-indigo-700"
                      >
                        <Stethoscope className="h-3.5 w-3.5" />
                        Submit Diagnostic
                      </Button>
                    )}

                    {/* Diagnostic submitted — awaiting admin */}
                    {workOrder.status === 'diagnostic_submitted' && (
                      <span className="flex-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700">
                        <Clock className="h-3.5 w-3.5" />
                        Awaiting admin decision
                      </span>
                    )}

                    {/* Repair approved — submit repair quote OR mark complete */}
                    {workOrder.status === 'repair_approved' && !hasRepairQuote && (
                      <Button
                        size="sm"
                        onClick={() => openRepairQuoteModal(workOrder.id)}
                        className="flex-1 h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        Submit Repair Quote
                      </Button>
                    )}
                    {workOrder.status === 'repair_approved' && hasRepairQuote && (
                      <Button
                        size="sm"
                        onClick={() => handleMarkComplete(workOrder.id)}
                        className="flex-1 h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Mark Complete
                      </Button>
                    )}

                    {/* Repair declined — mark complete, bill diagnostic */}
                    {workOrder.status === 'repair_declined' && (
                      <Button
                        size="sm"
                        onClick={() => handleMarkComplete(workOrder.id)}
                        className="flex-1 h-8 text-xs gap-1 bg-orange-600 hover:bg-orange-700"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Mark Complete (bill ${Number(workOrder.diagnosticFee || DEFAULT_DIAGNOSTIC_FEE).toFixed(2)})
                      </Button>
                    )}

                    {/* Completed */}
                    {(workOrder.status === 'completed' || workOrder.status === 'pending_invoice') && (
                      <span className="flex-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Completed {workOrder.completedAt?.toDate?.().toLocaleDateString() || ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Accept Assignment Modal */}
        {showAcceptModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-md w-full shadow-2xl">
              <div className="p-6 border-b sticky top-0 bg-card z-10 rounded-t-2xl flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">Schedule Service</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAcceptModal(false);
                    setAcceptingJobId(null);
                    setAcceptingWorkOrderId(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Please select the scheduled date and arrival time window for this job:
                </p>

                <div>
                  <Label htmlFor="service-date" className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4" />
                    Scheduled Date *
                  </Label>
                  <Input
                    id="service-date"
                    type="date"
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="service-time-start" className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4" />
                    Arrival Time Window (Start) *
                  </Label>
                  <Input
                    id="service-time-start"
                    type="time"
                    value={serviceTimeStart}
                    onChange={(e) => setServiceTimeStart(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="service-time-end" className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4" />
                    Arrival Time Window (End) *
                  </Label>
                  <Input
                    id="service-time-end"
                    type="time"
                    value={serviceTimeEnd}
                    onChange={(e) => setServiceTimeEnd(e.target.value)}
                    min={serviceTimeStart}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Client will be notified that service will arrive between these times
                  </p>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleConfirmAccept}
                    disabled={acceptSubmitting}
                  >
                    {acceptSubmitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                    ) : (
                      <><CheckCircle className="h-4 w-4 mr-2" />Approve Work Order</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAcceptModal(false);
                      setAcceptingJobId(null);
                      setAcceptingWorkOrderId(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Diagnostic Submission Modal */}
        {showDiagnosticModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-lg w-full shadow-2xl">
              <div className="p-6 border-b sticky top-0 bg-card z-10 rounded-t-2xl flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-indigo-600" />
                  Submit Diagnostic
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDiagnosticModal(false)}
                  disabled={diagnosticSubmitting}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="p-6 space-y-4">
                <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-900">
                  Submit your diagnostic findings. The admin will review and decide whether to approve a repair.
                  If the client approves the repair, the diagnostic fee will be waived. If the repair is declined,
                  the diagnostic fee will be billed.
                </div>

                <div>
                  <Label htmlFor="diagnostic-fee" className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4" />
                    Diagnostic Fee *
                  </Label>
                  <Input
                    id="diagnostic-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={diagnosticFee}
                    onChange={(e) => setDiagnosticFee(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">Default is ${DEFAULT_DIAGNOSTIC_FEE.toFixed(2)}. Override if different.</p>
                </div>

                <div>
                  <Label htmlFor="diagnostic-time" className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4" />
                    Time Spent
                  </Label>
                  <Input
                    id="diagnostic-time"
                    type="text"
                    placeholder="e.g., 1.5 hours"
                    value={diagnosticTimeSpent}
                    onChange={(e) => setDiagnosticTimeSpent(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="diagnostic-notes" className="mb-2 font-semibold">
                    Diagnostic Notes *
                  </Label>
                  <textarea
                    id="diagnostic-notes"
                    value={diagnosticNotes}
                    onChange={(e) => setDiagnosticNotes(e.target.value)}
                    placeholder="Describe what you found, the root cause, and recommended repair..."
                    className="w-full border border-gray-300 rounded-lg p-3 min-h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                    onClick={handleSubmitDiagnostic}
                    disabled={diagnosticSubmitting}
                  >
                    {diagnosticSubmitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
                    ) : (
                      <><Stethoscope className="h-4 w-4 mr-2" />Submit Diagnostic</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowDiagnosticModal(false)}
                    disabled={diagnosticSubmitting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Repair Quote Modal */}
        {showRepairQuoteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-card z-10 rounded-t-2xl flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-emerald-600" />
                  Submit Repair Quote
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRepairQuoteModal(false)}
                  disabled={repairQuoteSubmitting}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="p-6 space-y-4">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Diagnostic fee waived.</strong> The client will only pay the repair cost you quote below.
                  </span>
                </div>

                <div>
                  <Label className="mb-2 block">Line Items</Label>
                  <div className="space-y-2">
                    {repairLineItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-12 md:col-span-5">
                          <Input
                            placeholder="Description (e.g., Labor, Materials)"
                            value={item.description}
                            onChange={(e) => handleRepairLineItemChange(index, 'description', e.target.value)}
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => handleRepairLineItemChange(index, 'quantity', e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Unit $"
                            value={item.unitPrice}
                            onChange={(e) => handleRepairLineItemChange(index, 'unitPrice', e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                        </div>
                        <div className="col-span-3 md:col-span-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Amount"
                            value={item.amount}
                            onChange={(e) => handleRepairLineItemChange(index, 'amount', e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            readOnly
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {repairLineItems.length > 1 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 p-1 h-auto"
                              onClick={() => removeRepairLineItem(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addRepairLineItem}>
                    <Plus className="h-4 w-4 mr-1" /> Add Line Item
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="repair-tax" className="mb-2 block">Tax Rate (%)</Label>
                    <Input
                      id="repair-tax"
                      type="number"
                      min="0"
                      step="0.01"
                      value={repairTaxRate}
                      onChange={(e) => setRepairTaxRate(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                    />
                  </div>
                  <div className="rounded-lg border border-border p-3 bg-muted/30">
                    <div className="text-xs text-muted-foreground">Quote Total</div>
                    <div className="text-lg font-bold">${repairTotal.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Subtotal ${repairSubtotal.toFixed(2)} + Tax ${repairTaxAmount.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="repair-notes" className="mb-2 block">Notes (optional)</Label>
                  <textarea
                    id="repair-notes"
                    value={repairNotes}
                    onChange={(e) => setRepairNotes(e.target.value)}
                    placeholder="Any additional context for the admin / client..."
                    className="w-full border border-gray-300 rounded-lg p-3 min-h-24 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleSubmitRepairQuote}
                    disabled={repairQuoteSubmitting}
                  >
                    {repairQuoteSubmitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
                    ) : (
                      <><Wrench className="h-4 w-4 mr-2" />Submit Repair Quote</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowRepairQuoteModal(false)}
                    disabled={repairQuoteSubmitting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Completion Form Modal */}
        {showCompletionModal && (() => {
          const currentWo = completingWorkOrderId ? workOrders.get(completingWorkOrderId) : undefined;
          const isDeclinedFlow = currentWo?.status === 'repair_declined';
          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b sticky top-0 bg-card z-10 rounded-t-2xl flex items-center justify-between">
                  <h2 className="text-xl font-bold text-foreground">
                    {isDeclinedFlow ? 'Close Out Declined Repair' : 'Complete Work Order'}
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowCompletionModal(false);
                      setCompletingWorkOrderId(null);
                      setCompletionDetails('');
                      setCompletionNotes('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="p-6 space-y-4">
                  {isDeclinedFlow ? (
                    <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-900 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>
                        Client declined the repair. The $
                        {Number(currentWo?.diagnosticFee || DEFAULT_DIAGNOSTIC_FEE).toFixed(2)} diagnostic fee will be billed.
                        No repair work required.
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Please provide details about the work you completed. This information will be shared with the admin and client.
                    </p>
                  )}

                  <div>
                    <Label htmlFor="completion-details" className="mb-2 font-semibold">
                      {isDeclinedFlow ? 'Closing Notes (Optional)' : 'Work Completed (Required) *'}
                    </Label>
                    <textarea
                      id="completion-details"
                      value={completionDetails}
                      onChange={(e) => setCompletionDetails(e.target.value)}
                      placeholder={
                        isDeclinedFlow
                          ? 'Optional notes about the diagnostic visit...'
                          : 'Describe what work was completed, parts used, issues encountered, etc.'
                      }
                      className="w-full border border-gray-300 rounded-lg p-3 min-h-32 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                      required={!isDeclinedFlow}
                    />
                  </div>

                  <div>
                    <Label htmlFor="completion-notes" className="mb-2">
                      Additional Notes (Optional)
                    </Label>
                    <textarea
                      id="completion-notes"
                      value={completionNotes}
                      onChange={(e) => setCompletionNotes(e.target.value)}
                      placeholder="Any additional information, recommendations, or follow-up needed"
                      className="w-full border border-gray-300 rounded-lg p-3 min-h-24 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="completion-images" className="mb-2 flex items-center gap-2 font-semibold">
                      <ImageIcon className="h-4 w-4" />
                      {isDeclinedFlow ? 'Images (Optional)' : 'Completion Images/Files (Required) *'}
                    </Label>
                    <div className="mt-2">
                      <label htmlFor="completion-images" className={`flex items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-dashed rounded-lg appearance-none cursor-pointer focus:outline-none ${completionPreviewUrls.length > 0 ? 'border-emerald-400' : isDeclinedFlow ? 'border-gray-300 hover:border-gray-400' : 'border-red-300 hover:border-red-400'}`}>
                        <div className="flex flex-col items-center space-y-2">
                          <Upload className={`h-8 w-8 ${completionPreviewUrls.length > 0 ? 'text-emerald-500' : isDeclinedFlow ? 'text-gray-400' : 'text-red-400'}`} />
                          <span className="text-sm text-muted-foreground">
                            {completionPreviewUrls.length > 0 ? `${completionPreviewUrls.length} file(s) selected — click to add more` : 'Click to upload images/files'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {completionPreviewUrls.length > 0 ? '' : isDeclinedFlow ? 'Optional' : 'At least one photo of completed work is required'}
                          </span>
                        </div>
                        <input
                          id="completion-images"
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleCompletionFileSelect}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {completionPreviewUrls.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        {completionPreviewUrls.map((url, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={url}
                              alt={`Completion ${index + 1}`}
                              className="w-full h-24 object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => removeCompletionImage(index)}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={handleConfirmComplete}
                      disabled={completionSubmitting || uploadingFiles}
                    >
                      {completionSubmitting || uploadingFiles ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{uploadingFiles ? 'Uploading Files...' : 'Saving...'}</>
                      ) : (
                        <><CheckCircle className="h-4 w-4 mr-2" />Mark as Complete</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCompletionModal(false);
                        setCompletingWorkOrderId(null);
                        setCompletionDetails('');
                        setCompletionNotes('');
                        setCompletionFiles(null);
                        setCompletionPreviewUrls([]);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </SubcontractorLayout>
  );
}
