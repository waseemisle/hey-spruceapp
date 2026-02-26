'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, getDocs, updateDoc, serverTimestamp, addDoc, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { notifyBiddingOpportunity } from '@/lib/notifications';
import ClientLayout from '@/components/client-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardList, Plus, Calendar, AlertCircle, Search, Eye, CheckCircle, XCircle, Share2, X, ClipboardCheck, Clock, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import ViewControls from '@/components/view-controls';
import { useViewControls } from '@/contexts/view-controls-context';
import { toast } from 'sonner';

interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
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
  scheduledServiceDate?: any;
  scheduledServiceTime?: string;
  scheduleSharedWithClient?: boolean;
  assignedToName?: string;
  isMaintenanceRequestOrder?: boolean;
}

interface Subcontractor {
  id: string;
  fullName: string;
  email: string;
  businessName?: string;
  status: 'pending' | 'approved' | 'rejected';
  matchesCategory?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  approved: { label: 'Approved', className: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  bidding: { label: 'Bidding', className: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  assigned: { label: 'Assigned', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  accepted_by_subcontractor: { label: 'Scheduled', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  completed: { label: 'Completed', className: 'bg-gray-50 text-gray-700 border-gray-200', dot: 'bg-gray-400' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

const PRIORITY_CONFIG: Record<string, { className: string; dot: string }> = {
  low: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  medium: { className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  high: { className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

function ClientWorkOrdersContent() {
  const { auth, db } = useFirebaseInstance();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workOrderType = searchParams?.get('type') || 'all'; // 'all' or 'maintenance'
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { viewMode } = useViewControls();
  const [hasApproveRejectPermission, setHasApproveRejectPermission] = useState(false);
  const [hasShareForBiddingPermission, setHasShareForBiddingPermission] = useState(false);
  const [processingWorkOrder, setProcessingWorkOrder] = useState<string | null>(null);
  const [showBiddingModal, setShowBiddingModal] = useState(false);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedSubcontractors, setSelectedSubcontractors] = useState<string[]>([]);
  const [workOrderToShare, setWorkOrderToShare] = useState<WorkOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const normalizeStatus = (status: string) => {
    if (status === 'quotes_received') {
      return 'approved';
    }
    return status;
  };

  const getStatusLabel = (status: string) => {
    const normalized = normalizeStatus(status);
    const labels: Record<string, string> = {
      pending: 'Pending',
      approved: 'Approved',
      bidding: 'Bidding',
      assigned: 'Assigned',
      accepted_by_subcontractor: 'Scheduled',
      completed: 'Completed',
      rejected: 'Rejected',
    };

    if (labels[normalized]) {
      return labels[normalized];
    }

    return normalized
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  useEffect(() => {
    let unsubscribeWorkOrders: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // Clean up previous listeners
      unsubscribeWorkOrders?.();

      if (user) {
        try {
          // Fetch client document to get assigned locations and permissions
          const clientDoc = await getDoc(doc(db, 'clients', user.uid));
          const clientData = clientDoc.data();
          const assignedLocations = clientData?.assignedLocations || [];

          // Check for Approve/Reject Order permission
          const hasApprovePermission = clientData?.permissions?.approveRejectOrder === true;
          setHasApproveRejectPermission(hasApprovePermission);

          // Check for Share for Bidding permission
          const hasSharePermission = clientData?.permissions?.shareForBidding === true;
          setHasShareForBiddingPermission(hasSharePermission);

          // If viewing maintenance requests work orders, require permission
          if (workOrderType === 'maintenance' && !clientData?.permissions?.viewMaintenanceRequestsWorkOrders) {
            router.replace('/client-portal/work-orders');
            return;
          }

          // Fetch work orders: by assigned locations (batched) AND by clientId so we don't miss any
          if (assignedLocations.length > 0) {
            // Firestore 'in' query limited to 10 items, so we need to batch
            const batchSize = 10;
            const unsubscribes: (() => void)[] = [];

            const mergeAndSort = (prev: WorkOrder[], incoming: WorkOrder[], removeLocationIds?: string[]) => {
              let base = prev;
              if (removeLocationIds?.length) {
                base = prev.filter(wo => !removeLocationIds.includes(wo.locationId));
              }
              const combined = [...base, ...incoming];
              return Array.from(
                new Map(combined.map(wo => [wo.id, wo])).values()
              ).sort((a, b) => {
                const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
                const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
                return bTime.getTime() - aTime.getTime();
              });
            };

            for (let i = 0; i < assignedLocations.length; i += batchSize) {
              const batch = assignedLocations.slice(i, i + batchSize);
              const workOrdersQuery = query(
                collection(db, 'workOrders'),
                where('locationId', 'in', batch),
                orderBy('createdAt', 'desc')
              );

              const unsubscribe = onSnapshot(
                workOrdersQuery,
                (snapshot) => {
                  const batchWorkOrders = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                  })) as WorkOrder[];

                  setWorkOrders(prev => mergeAndSort(prev, batchWorkOrders, batch));
                  setLoading(false);
                },
                (error) => {
                  console.error('Error fetching work orders:', error);
                  setLoading(false);
                }
              );

              unsubscribes.push(unsubscribe);
            }

            // Also fetch by clientId so work orders linked to client but not in assignedLocations are included
            const clientIdQuery = query(
              collection(db, 'workOrders'),
              where('clientId', '==', user.uid),
              orderBy('createdAt', 'desc')
            );
            const clientIdUnsubscribe = onSnapshot(
              clientIdQuery,
              (snapshot) => {
                const clientIdWorkOrders = snapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data(),
                })) as WorkOrder[];
                setWorkOrders(prev => mergeAndSort(prev, clientIdWorkOrders));
                setLoading(false);
              },
              (error) => {
                console.error('Error fetching work orders by clientId:', error);
                setLoading(false);
              }
            );
            unsubscribes.push(clientIdUnsubscribe);

            unsubscribeWorkOrders = () => {
              unsubscribes.forEach(unsub => unsub());
            };
          } else {
            // Fallback to clientId for backward compatibility
            const workOrdersQuery = query(
              collection(db, 'workOrders'),
              where('clientId', '==', user.uid),
              orderBy('createdAt', 'desc')
            );

            unsubscribeWorkOrders = onSnapshot(
              workOrdersQuery,
              (snapshot) => {
                const workOrdersData = snapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data(),
                })) as WorkOrder[];
                setWorkOrders(workOrdersData);
                setLoading(false);
              },
              (error) => {
                console.error('Error fetching work orders:', error);
                setLoading(false);
              }
            );
          }
        } catch (error) {
          console.error('Error setting up work orders listener:', error);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeWorkOrders?.();
    };
  }, [auth, db, workOrderType, router]);

  const getStatusBadge = (status: string) => {
    const normalized = normalizeStatus(status);
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      quotes_received: 'bg-blue-100 text-blue-800',
      bidding: 'bg-blue-100 text-blue-800',
      assigned: 'bg-green-100 text-green-800',
      accepted_by_subcontractor: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return styles[normalized as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityBadge = (priority: string) => {
    const styles = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800',
    };
    return styles[priority as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const handleApproveWorkOrder = async (workOrderId: string) => {
    if (!hasApproveRejectPermission) {
      toast.error('You do not have permission to approve work orders');
      return;
    }

    setProcessingWorkOrder(workOrderId);
    try {
      await updateDoc(doc(db, 'workOrders', workOrderId), {
        status: 'approved',
        approvedAt: serverTimestamp(),
      });
      toast.success('Work order approved successfully');
    } catch (error: any) {
      console.error('Error approving work order:', error);
      toast.error(error.message || 'Failed to approve work order');
    } finally {
      setProcessingWorkOrder(null);
    }
  };

  const handleRejectWorkOrder = async (workOrderId: string) => {
    if (!hasApproveRejectPermission) {
      toast.error('You do not have permission to reject work orders');
      return;
    }

    const reason = prompt('Please provide a reason for rejection:');
    if (!reason || reason.trim() === '') {
      toast.error('Rejection reason is required');
      return;
    }

    setProcessingWorkOrder(workOrderId);
    try {
      await updateDoc(doc(db, 'workOrders', workOrderId), {
        status: 'rejected',
        rejectionReason: reason.trim(),
        rejectedAt: serverTimestamp(),
      });
      toast.success('Work order rejected');
    } catch (error: any) {
      console.error('Error rejecting work order:', error);
      toast.error(error.message || 'Failed to reject work order');
    } finally {
      setProcessingWorkOrder(null);
    }
  };

  const handleShareForBidding = async (workOrder: WorkOrder) => {
    if (!hasShareForBiddingPermission) {
      toast.error('You do not have permission to share work orders for bidding');
      return;
    }

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

      // Get current user data for timeline
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
      const clientName = clientDoc.exists() ? clientDoc.data().fullName : 'Client';

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
        userName: clientName,
        userRole: 'client',
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
          by: { id: currentUser.uid, name: clientName },
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

      toast.success(`Work order shared with ${selectedSubcontractors.length} subcontractor(s)`);
      setShowBiddingModal(false);
      setSelectedSubcontractors([]);
      setWorkOrderToShare(null);
    } catch (error: any) {
      console.error('Error sharing work order:', error);
      toast.error(error.message || 'Failed to share work order');
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

  // When type=maintenance, only show work orders created from maintenance requests
  const workOrdersToShow = workOrderType === 'maintenance'
    ? workOrders.filter(wo => wo.isMaintenanceRequestOrder === true)
    : workOrders;

  const filteredWorkOrders = workOrdersToShow.filter(wo => {
    const statusMatch = filter === 'all' || normalizeStatus(wo.status) === filter;

    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      wo.title?.toLowerCase().includes(searchLower) ||
      wo.description?.toLowerCase().includes(searchLower) ||
      wo.category?.toLowerCase().includes(searchLower) ||
      wo.locationName?.toLowerCase().includes(searchLower) ||
      wo.workOrderNumber?.toLowerCase().includes(searchLower);

    return statusMatch && searchMatch;
  });

  const getStatusCount = (value: string) =>
    workOrdersToShow.filter(wo => normalizeStatus(wo.status) === value).length;

  const filterOptions = [
    { value: 'all', label: 'All', count: workOrdersToShow.length },
    { value: 'pending', label: 'Pending', count: getStatusCount('pending') },
    { value: 'approved', label: 'Approved', count: getStatusCount('approved') },
    { value: 'bidding', label: 'Bidding', count: getStatusCount('bidding') },
    { value: 'assigned', label: 'Assigned', count: getStatusCount('assigned') },
    { value: 'accepted_by_subcontractor', label: 'Scheduled', count: getStatusCount('accepted_by_subcontractor') },
    { value: 'completed', label: 'Completed', count: getStatusCount('completed') },
  ];

  const stats = {
    total: workOrdersToShow.length,
    open: workOrdersToShow.filter(wo => ['pending', 'approved', 'bidding', 'assigned', 'accepted_by_subcontractor'].includes(normalizeStatus(wo.status))).length,
    completed: getStatusCount('completed'),
    pending: getStatusCount('pending'),
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

  return (
    <ClientLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="h-7 w-7 text-blue-600" />
              {workOrderType === 'maintenance' ? 'Maintenance Requests Work Orders' : 'Work Orders'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {workOrderType === 'maintenance' ? 'Work orders created from maintenance requests' : 'Manage your maintenance requests'}
            </p>
          </div>
          {workOrderType !== 'maintenance' && (
            <Link href="/client-portal/work-orders/create">
              <Button className="gap-2 self-start sm:self-auto">
                <Plus className="h-4 w-4" />
                Create Work Order
              </Button>
            </Link>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, icon: ClipboardList, color: 'text-blue-600 bg-blue-50 border-blue-100' },
            { label: 'Open / Active', value: stats.open, icon: BarChart3, color: 'text-amber-600 bg-amber-50 border-amber-100' },
            { label: 'Completed', value: stats.completed, icon: ClipboardCheck, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-purple-600 bg-purple-50 border-purple-100' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
              <Icon className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="text-xl font-bold leading-none">{value}</p>
                <p className="text-xs mt-0.5 opacity-75">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search work orders by title, description, category, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  filter === option.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {option.label} ({option.count})
              </button>
            ))}
          </div>

          <ViewControls hideSort />
        </div>

        {/* Empty State */}
        {filteredWorkOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <div className="h-14 w-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-gray-900 font-medium">
              {filter === 'all' ? 'No work orders yet' : `No ${filter} work orders`}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              {filter === 'all' ? 'Get started by creating your first work order' : 'Try a different filter'}
            </p>
            {filter === 'all' && workOrderType !== 'maintenance' && (
              <Link href="/client-portal/work-orders/create">
                <Button className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Create Work Order
                </Button>
              </Link>
            )}
          </div>
        ) : viewMode === 'list' ? (
          /* List View */
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Work Order</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Created</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredWorkOrders.map((workOrder) => {
                  const statusCfg = STATUS_CONFIG[normalizeStatus(workOrder.status)] || STATUS_CONFIG.pending;
                  const priorityCfg = PRIORITY_CONFIG[workOrder.priority] || PRIORITY_CONFIG.medium;
                  return (
                    <tr key={workOrder.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900">{workOrder.title}</p>
                        {workOrder.workOrderNumber && (
                          <p className="text-xs text-gray-500">WO: {workOrder.workOrderNumber}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{workOrder.description}</p>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell text-gray-600">{workOrder.locationName}</td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-gray-600">{workOrder.category}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${statusCfg.className}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${priorityCfg.className}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${priorityCfg.dot}`} />
                          {workOrder.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-gray-600">
                        {workOrder.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 justify-end">
                          {hasApproveRejectPermission && workOrder.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 hover:text-green-700 border-green-600 hover:border-green-700"
                                onClick={() => handleApproveWorkOrder(workOrder.id)}
                                disabled={processingWorkOrder === workOrder.id}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700 border-red-600 hover:border-red-700"
                                onClick={() => handleRejectWorkOrder(workOrder.id)}
                                disabled={processingWorkOrder === workOrder.id}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          {hasShareForBiddingPermission && workOrder.status === 'approved' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleShareForBidding(workOrder)}
                            >
                              <Share2 className="h-4 w-4 mr-1" />
                              Share
                            </Button>
                          )}
                          <Link href={`/client-portal/work-orders/${workOrder.id}`}>
                            <Button size="sm" variant="outline">
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkOrders.map((workOrder) => {
              const statusCfg = STATUS_CONFIG[normalizeStatus(workOrder.status)] || STATUS_CONFIG.pending;
              const priorityCfg = PRIORITY_CONFIG[workOrder.priority] || PRIORITY_CONFIG.medium;
              return (
                <div key={workOrder.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                  <div className={`h-1 w-full bg-gradient-to-r ${
                    normalizeStatus(workOrder.status) === 'completed' ? 'from-gray-400 to-gray-500' :
                    normalizeStatus(workOrder.status) === 'rejected' ? 'from-red-500 to-red-600' :
                    normalizeStatus(workOrder.status) === 'assigned' || normalizeStatus(workOrder.status) === 'accepted_by_subcontractor' ? 'from-emerald-500 to-emerald-600' :
                    'from-blue-500 to-blue-600'
                  }`} />

                  <div className="p-5 flex flex-col flex-1">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 text-sm line-clamp-2">{workOrder.title}</p>
                        {workOrder.workOrderNumber && (
                          <p className="text-xs text-gray-500 mt-0.5">WO: {workOrder.workOrderNumber}</p>
                        )}
                      </div>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border flex-shrink-0 ${statusCfg.className}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
                      </span>
                    </div>

                    {/* Priority */}
                    <div className="mb-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${priorityCfg.className}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${priorityCfg.dot}`} />
                        {workOrder.priority} priority
                      </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-sm text-gray-600 flex-1">
                      {workOrder.locationName && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 font-medium w-16 flex-shrink-0">Location</span>
                          <span className="truncate">{workOrder.locationName}</span>
                        </div>
                      )}
                      {workOrder.category && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 font-medium w-16 flex-shrink-0">Category</span>
                          <span className="truncate">{workOrder.category}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-xs">{workOrder.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</span>
                      </div>
                    </div>

                    {workOrder.description && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">{workOrder.description}</p>
                    )}

                    {workOrder.status === 'rejected' && workOrder.rejectionReason && (
                      <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                        <div className="flex gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-red-800 mb-1">Rejection Reason:</p>
                            <p className="text-xs text-red-700">{workOrder.rejectionReason}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {workOrder.scheduleSharedWithClient && workOrder.scheduledServiceDate && workOrder.scheduledServiceTime && (
                      <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex gap-2">
                          <Calendar className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-green-800 mb-1">Scheduled Service:</p>
                            <p className="text-sm text-green-700 font-medium">
                              {workOrder.scheduledServiceDate?.toDate?.().toLocaleDateString() || 'N/A'} at {workOrder.scheduledServiceTime}
                            </p>
                            {workOrder.assignedToName && (
                              <p className="text-xs text-green-600 mt-1">Assigned to: {workOrder.assignedToName}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {workOrder.images && workOrder.images.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto mt-3">
                        {workOrder.images.map((image, idx) => (
                          <img
                            key={idx}
                            src={image}
                            alt={`Work order ${idx + 1}`}
                            className="h-20 w-20 object-cover rounded-lg flex-shrink-0"
                          />
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                      {hasApproveRejectPermission && workOrder.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                            onClick={() => handleApproveWorkOrder(workOrder.id)}
                            disabled={processingWorkOrder === workOrder.id}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-red-600 hover:text-red-700 border-red-600 hover:border-red-700 gap-1"
                            onClick={() => handleRejectWorkOrder(workOrder.id)}
                            disabled={processingWorkOrder === workOrder.id}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      )}
                      {hasShareForBiddingPermission && workOrder.status === 'approved' && (
                        <Button
                          size="sm"
                          className="w-full gap-2"
                          onClick={() => handleShareForBidding(workOrder)}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          Share for Bidding
                        </Button>
                      )}
                      <Link href={`/client-portal/work-orders/${workOrder.id}`} className="block">
                        <Button size="sm" variant="secondary" className="w-full gap-2">
                          <Eye className="h-3.5 w-3.5" />
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Share for Bidding Modal */}
      {showBiddingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Share for Bidding</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Select subcontractors to share this work order with
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowBiddingModal(false);
                    setSelectedSubcontractors([]);
                    setWorkOrderToShare(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {workOrderToShare && (
                <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
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

              <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 rounded-xl p-4">
                {subcontractors.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No approved subcontractors found</p>
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
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{sub.fullName}</p>
                          {sub.matchesCategory && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                              Matches Category
                            </span>
                          )}
                        </div>
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
                  {submitting ? 'Sharing...' : `Share with ${selectedSubcontractors.length} Subcontractor${selectedSubcontractors.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ClientLayout>
  );
}

export default function ClientWorkOrders() {
  return (
    <Suspense fallback={
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    }>
      <ClientWorkOrdersContent />
    </Suspense>
  );
}
