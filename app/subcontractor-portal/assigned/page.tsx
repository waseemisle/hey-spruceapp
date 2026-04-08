'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, serverTimestamp, getDoc, Timestamp, documentId } from 'firebase/firestore';
import { createTimelineEvent } from '@/lib/timeline';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { notifyWorkOrderCompletion, notifyScheduledService, getAllAdminUserIds } from '@/lib/notifications';
import { createNotification } from '@/lib/notifications';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardList, CheckSquare, Calendar, MapPin, AlertCircle, CheckCircle, Search, X, Clock, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { formatAddress } from '@/lib/utils';
import { uploadMultipleToCloudinary } from '@/lib/cloudinary-upload';

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
  title: string;
  description: string;
  category: string;
  priority: string;
  locationName: string;
  locationAddress: string;
  clientName: string;
  clientEmail: string;
  images?: string[];
  status: string;
  createdAt: any;
  completedAt?: any;
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
  completed: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Completed' },
};

const CARD_ACCENTS: Record<string, string> = {
  pending_acceptance: 'from-amber-400 to-orange-500',
  accepted: 'from-blue-400 to-blue-600',
  rejected: 'from-red-400 to-red-600',
  completed: 'from-emerald-400 to-emerald-600',
};

export default function SubcontractorAssignedJobs() {
  const { auth, db } = useFirebaseInstance();
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [workOrders, setWorkOrders] = useState<Map<string, WorkOrder>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);
  const [acceptingWorkOrderId, setAcceptingWorkOrderId] = useState<string | null>(null);
  const [serviceDate, setServiceDate] = useState('');
  const [serviceTimeStart, setServiceTimeStart] = useState('09:00');
  const [serviceTimeEnd, setServiceTimeEnd] = useState('17:00');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completingWorkOrderId, setCompletingWorkOrderId] = useState<string | null>(null);
  const [completionDetails, setCompletionDetails] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionFiles, setCompletionFiles] = useState<FileList | null>(null);
  const [completionPreviewUrls, setCompletionPreviewUrls] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

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
            // Fetch work orders individually to handle permission issues gracefully
            // and avoid the Firestore 'in' query limit of 10
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
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setServiceDate(tomorrow.toISOString().split('T')[0]);
    // Set default time range (9 AM - 5 PM)
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

    try {
      // Update assigned job status with scheduled service date/time
      await updateDoc(doc(db, 'assignedJobs', acceptingJobId), {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        scheduledServiceDate: new Date(serviceDate + 'T' + serviceTimeStart),
        scheduledServiceTime: serviceTimeStart,
        scheduledServiceTimeEnd: serviceTimeEnd || null,
      });

      // Get work order data for notifications and timeline
      const workOrderDoc = await getDoc(doc(db, 'workOrders', acceptingWorkOrderId));
      const workOrderData = workOrderDoc.data();
      const existingTimeline = workOrderData?.timeline || [];
      const existingSysInfo = workOrderData?.systemInformation || {};

      // Get subcontractor name
      const currentUser = auth.currentUser;
      let subName = workOrderData?.assignedToName || 'Subcontractor';
      if (currentUser) {
        const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
        if (subDoc.exists()) subName = subDoc.data().fullName || subName;
      }

      const timelineEvent = createTimelineEvent({
        type: 'schedule_set',
        userId: currentUser?.uid || 'unknown',
        userName: subName,
        userRole: 'subcontractor',
        details: `Assignment accepted by ${subName}. Scheduled for ${serviceDate} at ${serviceTimeStart}${serviceTimeEnd ? ` - ${serviceTimeEnd}` : ''}`,
        metadata: { serviceDate, serviceTimeStart, serviceTimeEnd: serviceTimeEnd || null },
      });

      // Update work order status
      await updateDoc(doc(db, 'workOrders', acceptingWorkOrderId), {
        status: 'accepted_by_subcontractor',
        scheduledServiceDate: new Date(serviceDate + 'T' + serviceTimeStart),
        scheduledServiceTime: serviceTimeStart,
        scheduledServiceTimeEnd: serviceTimeEnd || null,
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: {
          ...existingSysInfo,
          scheduledService: {
            date: new Date(serviceDate + 'T' + serviceTimeStart),
            time: serviceTimeStart,
            setBy: { id: currentUser?.uid || 'unknown', name: subName },
          },
        },
      });

      // Notify client of scheduling (in-app notification)
      if (workOrderData?.clientId) {
        const scheduledDateTime = new Date(serviceDate + 'T' + serviceTimeStart);
        const timeRange = serviceTimeEnd
          ? `${serviceTimeStart} - ${serviceTimeEnd}`
          : serviceTimeStart;
        await notifyScheduledService(
          workOrderData.clientId,
          acceptingWorkOrderId,
          workOrderData.title || workOrderData.workOrderNumber || 'Work Order',
          scheduledDateTime.toLocaleDateString(),
          timeRange
        );
      }

      // Send email to client
      if (workOrderData?.clientEmail && workOrderData?.clientName) {
        try {
          const emailResponse = await fetch('/api/email/send-scheduled-service', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toEmail: workOrderData.clientEmail,
              toName: workOrderData.clientName,
              workOrderNumber: workOrderData.workOrderNumber || acceptingWorkOrderId,
              workOrderTitle: workOrderData.title || 'Work Order',
              scheduledDate: serviceDate,
              scheduledTimeStart: serviceTimeStart,
              scheduledTimeEnd: serviceTimeEnd || null,
              locationName: workOrderData.locationName || '',
              locationAddress: workOrderData.locationAddress || workOrderData.location?.address || '',
            }),
          });

          if (!emailResponse.ok) {
            console.error('Failed to send scheduled service email');
            // Don't fail the whole operation if email fails
          }
        } catch (emailError) {
          console.error('Error sending scheduled service email:', emailError);
          // Don't fail the whole operation if email fails
        }
      }

      // Notify all admins
      const adminIds = await getAllAdminUserIds();
      if (adminIds.length > 0) {
        const scheduledDateTime = new Date(serviceDate + 'T' + serviceTimeStart);
        const timeRange = serviceTimeEnd
          ? `${serviceTimeStart} - ${serviceTimeEnd}`
          : serviceTimeStart;
        await createNotification({
          recipientIds: adminIds,
          userRole: 'admin',
          type: 'schedule',
          title: 'Work Order Scheduled',
          message: `Work Order ${workOrderData?.workOrderNumber || acceptingWorkOrderId} scheduled for ${scheduledDateTime.toLocaleDateString()} ${timeRange}`,
          link: `/admin-portal/work-orders/${acceptingWorkOrderId}`,
          referenceId: acceptingWorkOrderId,
          referenceType: 'workOrder',
        });
      }

      toast.success('Assignment accepted successfully with scheduled service date!');
      setShowAcceptModal(false);
      setAcceptingJobId(null);
      setAcceptingWorkOrderId(null);
      setServiceDate('');
      setServiceTimeStart('09:00');
      setServiceTimeEnd('17:00');
    } catch (error) {
      console.error('Error accepting assignment:', error);
      toast.error('Failed to accept assignment');
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
            // Update assigned job status
            await updateDoc(doc(db, 'assignedJobs', assignedJobId), {
              status: 'rejected',
              rejectedAt: serverTimestamp(),
              rejectionReason: reason,
            });

            // Get existing timeline for work order
            const woDoc = await getDoc(doc(db, 'workOrders', workOrderId));
            const woData = woDoc.data();
            const existingTimeline = woData?.timeline || [];

            const currentUser = auth.currentUser;
            let subName = woData?.assignedToName || 'Subcontractor';
            if (currentUser) {
              const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
              if (subDoc.exists()) subName = subDoc.data().fullName || subName;
            }

            // Update work order status
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

  const handleMarkComplete = (workOrderId: string) => {
    setCompletingWorkOrderId(workOrderId);
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
    if (!completionDetails.trim()) {
      toast.error('Please provide details about the work completed');
      return;
    }

    if (!completionFiles || completionFiles.length === 0) {
      toast.error('Please upload at least one completion image or file');
      return;
    }

    if (!completingWorkOrderId) return;

    try {
      // Upload completion images if any
      let completionImageUrls: string[] = [];
      if (completionFiles && completionFiles.length > 0) {
        setUploadingFiles(true);
        try {
          completionImageUrls = await uploadMultipleToCloudinary(completionFiles);
        } catch (error) {
          console.error('Error uploading completion images:', error);
          toast.error('Failed to upload images. Please try again.');
          setUploadingFiles(false);
          return;
        }
        setUploadingFiles(false);
      }

      // Get work order data for notifications and timeline
      const workOrderDoc = await getDoc(doc(db, 'workOrders', completingWorkOrderId));
      const workOrderData = workOrderDoc.data();
      const existingTimeline = workOrderData?.timeline || [];
      const existingSysInfo = workOrderData?.systemInformation || {};

      const currentUser = auth.currentUser;
      let subName = workOrderData?.assignedToName || 'Subcontractor';
      if (currentUser) {
        const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
        if (subDoc.exists()) subName = subDoc.data().fullName || subName;
      }

      // Update work order via API route (server-side) to bypass Firestore client rules
      const idToken = await currentUser?.getIdToken();
      const completeRes = await fetch('/api/work-orders/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          workOrderId: completingWorkOrderId,
          completionDetails,
          completionNotes,
          completionImageUrls,
          subName,
        }),
      });
      if (!completeRes.ok) {
        const err = await completeRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to mark work order complete');
      }

      // Notify client and admin of completion
      if (workOrderData?.clientId) {
        await notifyWorkOrderCompletion(
          workOrderData.clientId,
          completingWorkOrderId,
          workOrderData.workOrderNumber || completingWorkOrderId
        );
      }

      // Send work order completion notification email to client
      if (workOrderData?.clientEmail && workOrderData?.clientName) {
        fetch('/api/email/send-work-order-completion-client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: workOrderData.clientEmail,
            toName: workOrderData.clientName,
            workOrderNumber: workOrderData.workOrderNumber || completingWorkOrderId,
            workOrderTitle: workOrderData.title || 'Work Order',
            completedBy: subName,
            locationName: workOrderData.locationName || '',
          }),
        }).catch(err => console.error('Failed to send client completion email:', err));
      }

      // Send completion email notification to admins
      fetch('/api/email/send-work-order-completed-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: completingWorkOrderId,
          workOrderNumber: workOrderData?.workOrderNumber || completingWorkOrderId,
          title: workOrderData?.title || 'Work Order',
          clientName: workOrderData?.clientName || '',
          locationName: workOrderData?.locationName || '',
          priority: workOrderData?.priority || 'medium',
          completedBy: subName,
          completionDetails: completionDetails,
        }),
      }).catch(err => console.error('Failed to send completion notification emails:', err));

      // Update local work order state so the UI reflects the change immediately
      setWorkOrders(prev => {
        const updated = new Map(prev);
        const wo = updated.get(completingWorkOrderId);
        if (wo) {
          updated.set(completingWorkOrderId, { ...wo, status: 'completed', completedAt: new Date() });
        }
        return updated;
      });

      toast.success('Job marked as complete! The admin will review and process the invoice.');
      setShowCompletionModal(false);
      setCompletingWorkOrderId(null);
      setCompletionDetails('');
      setCompletionNotes('');
      setCompletionFiles(null);
      setCompletionPreviewUrls([]);
    } catch (error) {
      console.error('Error marking job complete:', error);
      toast.error('Failed to mark job as complete');
    }
  };

  const filteredJobs = assignedJobs.filter(job => {
    const workOrder = workOrders.get(job.workOrderId);
    // Show the job even if work order details haven't loaded yet (race condition)
    // Only filter on work order fields when they're available

    // Filter by status
    let statusMatch = true;
    if (filter === 'pending') statusMatch = job.status === 'pending_acceptance';
    else if (filter === 'in-progress') statusMatch = job.status === 'accepted' && (!workOrder || workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor');
    else if (filter === 'completed') statusMatch = !!workOrder && (workOrder.status === 'completed' || workOrder.status === 'pending_invoice');

    // Filter by search query (only when work order data is available)
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
      count: assignedJobs.filter(job => job.status === 'pending_acceptance').length
    },
    {
      value: 'in-progress',
      label: 'In Progress',
      count: assignedJobs.filter(job => job.status === 'accepted' && (workOrders.get(job.workOrderId)?.status === 'assigned' || workOrders.get(job.workOrderId)?.status === 'accepted_by_subcontractor')).length
    },
    {
      value: 'completed',
      label: 'Completed',
      count: assignedJobs.filter(job => {
        const s = workOrders.get(job.workOrderId)?.status;
        return s === 'completed' || s === 'pending_invoice';
      }).length
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

              // Skip jobs where work order couldn't be loaded (permission denied or deleted)
              if (!workOrder) return null;

              const effectiveStatus = (workOrder.status === 'completed' || workOrder.status === 'pending_invoice') ? 'completed' : job.status;
              const jobStatusCfg = JOB_STATUS_CONFIG[effectiveStatus] || JOB_STATUS_CONFIG['pending_acceptance'];
              const priorityCfg = PRIORITY_CONFIG[workOrder.priority] || { className: 'bg-muted text-foreground border-border', dot: 'bg-gray-400' };

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
                    {job.status === 'accepted' && (workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor') && (
                      <Button
                        size="sm"
                        onClick={() => handleMarkComplete(workOrder.id)}
                        className="flex-1 h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Mark Complete
                      </Button>
                    )}
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

        {/* Accept Assignment Modal with Service Date/Time */}
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
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Work Order
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

        {/* Completion Form Modal */}
        {showCompletionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-2xl w-full shadow-2xl">
              <div className="p-6 border-b sticky top-0 bg-card z-10 rounded-t-2xl flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">Complete Work Order</h2>
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
                <p className="text-sm text-muted-foreground">
                  Please provide details about the work you completed. This information will be shared with the admin and client.
                </p>

                <div>
                  <Label htmlFor="completion-details" className="mb-2 font-semibold">
                    Work Completed (Required) *
                  </Label>
                  <textarea
                    id="completion-details"
                    value={completionDetails}
                    onChange={(e) => setCompletionDetails(e.target.value)}
                    placeholder="Describe what work was completed, parts used, issues encountered, etc."
                    className="w-full border border-gray-300 rounded-lg p-3 min-h-32 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                    required
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
                    Completion Images/Files (Required) *
                  </Label>
                  <div className="mt-2">
                    <label htmlFor="completion-images" className={`flex items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-dashed rounded-lg appearance-none cursor-pointer focus:outline-none ${completionPreviewUrls.length > 0 ? 'border-emerald-400' : 'border-red-300 hover:border-red-400'}`}>
                      <div className="flex flex-col items-center space-y-2">
                        <Upload className={`h-8 w-8 ${completionPreviewUrls.length > 0 ? 'text-emerald-500' : 'text-red-400'}`} />
                        <span className="text-sm text-muted-foreground">
                          {completionPreviewUrls.length > 0 ? `${completionPreviewUrls.length} file(s) selected — click to add more` : 'Click to upload completion images/files'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {completionPreviewUrls.length > 0 ? '' : 'At least one photo of completed work is required'}
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
                    loading={uploadingFiles} disabled={uploadingFiles}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {uploadingFiles ? 'Uploading Files...' : 'Mark as Complete'}
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
        )}
      </div>
    </SubcontractorLayout>
  );
}
