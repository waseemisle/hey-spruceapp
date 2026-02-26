'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore';
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

          // Listen to work orders
          const workOrderIds = [...new Set(assignedData.map(job => job.workOrderId))];

          if (workOrderIds.length > 0) {
            const workOrdersQuery = query(
              collection(db, 'workOrders'),
              where('__name__', 'in', workOrderIds)
            );

            onSnapshot(workOrdersQuery, (woSnapshot) => {
              const workOrdersMap = new Map<string, WorkOrder>();
              woSnapshot.docs.forEach(woDoc => {
                workOrdersMap.set(woDoc.id, { id: woDoc.id, ...woDoc.data() } as WorkOrder);
              });
              setWorkOrders(workOrdersMap);
              setLoading(false);
            });
          } else {
            setLoading(false);
          }
        });

        return () => unsubscribeSnapshot();
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
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

      const timelineEvent = createTimelineEvent({
        type: 'completed',
        userId: currentUser?.uid || 'unknown',
        userName: subName,
        userRole: 'subcontractor',
        details: `Work order completed by ${subName}`,
        metadata: { completionDetails: completionDetails.substring(0, 100) },
      });

      await updateDoc(doc(db, 'workOrders', completingWorkOrderId), {
        status: 'completed',
        completedAt: serverTimestamp(),
        completionDetails: completionDetails,
        completionNotes: completionNotes,
        completionImages: completionImageUrls,
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: {
          ...existingSysInfo,
          completion: {
            completedBy: { id: currentUser?.uid || 'unknown', name: subName },
            timestamp: Timestamp.now(),
            notes: completionDetails,
          },
        },
      });

      // Notify client and admin of completion
      if (workOrderData?.clientId) {
        await notifyWorkOrderCompletion(
          workOrderData.clientId,
          completingWorkOrderId,
          workOrderData.workOrderNumber || completingWorkOrderId
        );
      }

      // Send review request email to client
      if (workOrderData?.clientEmail && workOrderData?.clientName) {
        try {
          const emailResponse = await fetch('/api/email/send-review-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toEmail: workOrderData.clientEmail,
              toName: workOrderData.clientName,
              workOrderNumber: workOrderData.workOrderNumber || completingWorkOrderId,
            }),
          });

          if (!emailResponse.ok) {
            console.error('Failed to send review request email');
            // Don't show error to user - email is not critical
          }
        } catch (emailError) {
          console.error('Error sending review request email:', emailError);
          // Don't show error to user - email is not critical
        }
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

      toast.success('Job marked as complete with details!');
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
    if (!workOrder) return false;

    // Filter by status
    let statusMatch = true;
    if (filter === 'pending') statusMatch = job.status === 'pending_acceptance';
    else if (filter === 'in-progress') statusMatch = job.status === 'accepted' && (workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor');
    else if (filter === 'completed') statusMatch = workOrder.status === 'completed';

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      workOrder.title.toLowerCase().includes(searchLower) ||
      workOrder.description.toLowerCase().includes(searchLower) ||
      workOrder.clientName.toLowerCase().includes(searchLower) ||
      workOrder.category.toLowerCase().includes(searchLower) ||
      workOrder.locationName.toLowerCase().includes(searchLower) ||
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
      count: assignedJobs.filter(job => workOrders.get(job.workOrderId)?.status === 'completed').length
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
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="h-7 w-7 text-blue-600" />
              Assigned Jobs
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage your assigned work orders</p>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search assigned jobs by title, description, client, category, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1 flex-shrink-0">
            {filterOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  filter === option.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {option.label} <span className="text-xs opacity-70">({option.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Jobs Grid */}
        {filteredJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {filter === 'all' ? 'No assigned jobs yet' : `No ${filter} jobs`}
            </h3>
            <p className="text-sm text-gray-500">
              {filter === 'all'
                ? 'Jobs will appear here once your quotes are accepted'
                : 'Try a different filter'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredJobs.map((job) => {
              const workOrder = workOrders.get(job.workOrderId);
              if (!workOrder) return null;

              const effectiveStatus = workOrder.status === 'completed' ? 'completed' : job.status;
              const accentGradient = CARD_ACCENTS[effectiveStatus] || 'from-gray-400 to-gray-600';
              const jobStatusCfg = JOB_STATUS_CONFIG[effectiveStatus] || JOB_STATUS_CONFIG['pending_acceptance'];
              const priorityCfg = PRIORITY_CONFIG[workOrder.priority] || { className: 'bg-gray-50 text-gray-700 border-gray-200', dot: 'bg-gray-400' };

              return (
                <div
                  key={job.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                >
                  <div className={`h-1 w-full bg-gradient-to-r ${accentGradient}`} />
                  <div className="p-5 flex flex-col flex-1 space-y-4">
                    {/* Title + Badges */}
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base line-clamp-2 mb-2">{workOrder.title}</h3>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${jobStatusCfg.className}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${jobStatusCfg.dot}`} />
                          {jobStatusCfg.label}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${priorityCfg.className}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
                          {workOrder.priority} priority
                        </span>
                        <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                          {workOrder.category}
                        </span>
                      </div>
                    </div>

                    {/* Client */}
                    <div className="text-sm">
                      <p className="font-medium text-gray-700">Client</p>
                      <p className="text-gray-600">{workOrder.clientName}</p>
                      <p className="text-xs text-gray-400">{workOrder.clientEmail}</p>
                    </div>

                    {/* Location */}
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium text-gray-700">{workOrder.locationName}</div>
                        <div className="text-xs text-gray-400">{formatAddress(workOrder.locationAddress)}</div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-gray-600 line-clamp-2">{workOrder.description}</p>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="flex items-center gap-1.5 text-gray-400 mb-0.5">
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="text-xs">Assigned</span>
                        </div>
                        <p className="font-medium text-gray-800 text-xs">
                          {job.assignedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                        </p>
                      </div>

                      {workOrder.completedAt && (
                        <div>
                          <div className="flex items-center gap-1.5 text-emerald-500 mb-0.5">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span className="text-xs">Completed</span>
                          </div>
                          <p className="font-medium text-gray-800 text-xs">
                            {workOrder.completedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Images */}
                    {workOrder.images && workOrder.images.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {workOrder.images.map((image, idx) => (
                          <img
                            key={idx}
                            src={image}
                            alt={`Work order ${idx + 1}`}
                            className="h-16 w-16 object-cover rounded-lg flex-shrink-0"
                          />
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-auto pt-2 space-y-2">
                      {job.status === 'pending_acceptance' && (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleAcceptAssignment(job.id, workOrder.id)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-9 text-sm"
                          >
                            <CheckCircle className="h-4 w-4 mr-1.5" />
                            Accept
                          </Button>
                          <Button
                            onClick={() => handleRejectAssignment(job.id, workOrder.id)}
                            variant="destructive"
                            className="flex-1 h-9 text-sm"
                          >
                            <X className="h-4 w-4 mr-1.5" />
                            Reject
                          </Button>
                        </div>
                      )}

                      {job.status === 'accepted' && (workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor') && (
                        <Button
                          onClick={() => handleMarkComplete(workOrder.id)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 h-9 text-sm"
                        >
                          <CheckCircle className="h-4 w-4 mr-1.5" />
                          Mark as Complete
                        </Button>
                      )}

                      {workOrder.status === 'completed' && (
                        <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-emerald-800">Job Completed</p>
                              <p className="text-xs text-emerald-600">
                                {workOrder.completedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Accept Assignment Modal with Service Date/Time */}
        {showAcceptModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
              <div className="p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Schedule Service</h2>
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
                <p className="text-sm text-gray-600">
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
                  <p className="text-xs text-gray-500 mt-1">
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
            <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl">
              <div className="p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Complete Work Order</h2>
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
                <p className="text-sm text-gray-600">
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
                        <span className="text-sm text-gray-600">
                          {completionPreviewUrls.length > 0 ? `${completionPreviewUrls.length} file(s) selected — click to add more` : 'Click to upload completion images/files'}
                        </span>
                        <span className="text-xs text-gray-500">
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
