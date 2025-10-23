'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckSquare, Calendar, MapPin, AlertCircle, CheckCircle, Search, X } from 'lucide-react';
import { toast } from 'sonner';

interface AssignedJob {
  id: string;
  workOrderId: string;
  subcontractorId: string;
  assignedAt: any;
  status: 'pending_acceptance' | 'accepted' | 'rejected';
  acceptedAt?: any;
  rejectedAt?: any;
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

export default function SubcontractorAssignedJobs() {
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [workOrders, setWorkOrders] = useState<Map<string, WorkOrder>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
  }, []);

  const handleAcceptAssignment = async (assignedJobId: string, workOrderId: string) => {
    const workOrder = workOrders.get(workOrderId);
    toast(`Accept assignment for "${workOrder?.title}"?`, {
      description: 'This will mark the work order as accepted and ready to begin.',
      action: {
        label: 'Accept',
        onClick: async () => {
          try {
            // Update assigned job status
            await updateDoc(doc(db, 'assignedJobs', assignedJobId), {
              status: 'accepted',
              acceptedAt: serverTimestamp(),
            });

            // Update work order status
            await updateDoc(doc(db, 'workOrders', workOrderId), {
              status: 'accepted_by_subcontractor',
              updatedAt: serverTimestamp(),
            });

            toast.success('Assignment accepted successfully!');
          } catch (error) {
            console.error('Error accepting assignment:', error);
            toast.error('Failed to accept assignment');
          }
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
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

            // Update work order status
            await updateDoc(doc(db, 'workOrders', workOrderId), {
              status: 'rejected_by_subcontractor',
              updatedAt: serverTimestamp(),
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

  const handleMarkComplete = async (workOrderId: string) => {
    const workOrder = workOrders.get(workOrderId);
    toast(`Mark "${workOrder?.title}" as complete?`, {
      description: 'This will mark the work order as completed.',
      action: {
        label: 'Mark Complete',
        onClick: async () => {
          try {
            await updateDoc(doc(db, 'workOrders', workOrderId), {
              status: 'completed',
              completedAt: serverTimestamp(),
            });
            toast.success('Job marked as complete successfully!');
          } catch (error) {
            console.error('Error marking job complete:', error);
            toast.error('Failed to mark job as complete');
          }
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const getPriorityBadge = (priority: string) => {
    const styles = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800',
    };
    return styles[priority as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending_acceptance: 'bg-yellow-100 text-yellow-800',
      accepted: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800',
      assigned: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
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
      workOrder.locationAddress.toLowerCase().includes(searchLower);

    return statusMatch && searchMatch;
  });

  const filterOptions = [
    { value: 'all', label: 'All', count: assignedJobs.length },
    {
      value: 'pending',
      label: 'Pending Acceptance',
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

  if (loading) {
    return (
      <SubcontractorLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Assigned Jobs</h1>
          <p className="text-gray-600 mt-2">Manage your assigned work orders</p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search assigned jobs by title, description, client, category, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                filter === option.value
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>

        {filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckSquare className="h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {filter === 'all' ? 'No assigned jobs yet' : `No ${filter} jobs`}
              </h3>
              <p className="text-gray-600 text-center">
                {filter === 'all'
                  ? 'Jobs will appear here once your quotes are accepted'
                  : 'Try a different filter'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredJobs.map((job) => {
              const workOrder = workOrders.get(job.workOrderId);
              if (!workOrder) return null;

              return (
                <Card key={job.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2">{workOrder.title}</CardTitle>
                        <div className="flex gap-2 flex-wrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(job.status)}`}>
                            {job.status.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPriorityBadge(workOrder.priority)}`}>
                            {workOrder.priority} priority
                          </span>
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                            {workOrder.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Client:</p>
                      <p className="text-sm text-gray-600">{workOrder.clientName}</p>
                      <p className="text-xs text-gray-500">{workOrder.clientEmail}</p>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-gray-600">
                        <div className="font-medium">{workOrder.locationName}</div>
                        <div className="text-xs">{workOrder.locationAddress}</div>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Description:</p>
                      <p className="text-sm text-gray-600">{workOrder.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                          <Calendar className="h-4 w-4" />
                          <span>Assigned</span>
                        </div>
                        <p className="font-medium text-gray-900">
                          {job.assignedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                        </p>
                      </div>

                      {workOrder.completedAt && (
                        <div>
                          <div className="flex items-center gap-2 text-green-600 mb-1">
                            <CheckCircle className="h-4 w-4" />
                            <span>Completed</span>
                          </div>
                          <p className="font-medium text-gray-900">
                            {workOrder.completedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                          </p>
                        </div>
                      )}
                    </div>

                    {workOrder.images && workOrder.images.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {workOrder.images.map((image, idx) => (
                          <img
                            key={idx}
                            src={image}
                            alt={`Work order ${idx + 1}`}
                            className="h-20 w-20 object-cover rounded-lg"
                          />
                        ))}
                      </div>
                    )}

                    {job.status === 'pending_acceptance' && (
                      <div className="flex gap-2 mt-4">
                        <Button
                          onClick={() => handleAcceptAssignment(job.id, workOrder.id)}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Accept
                        </Button>
                        <Button
                          onClick={() => handleRejectAssignment(job.id, workOrder.id)}
                          variant="destructive"
                          className="flex-1"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {job.status === 'accepted' && (workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor') && (
                      <Button
                        onClick={() => handleMarkComplete(workOrder.id)}
                        className="w-full mt-4 bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark as Complete
                      </Button>
                    )}

                    {workOrder.status === 'completed' && (
                      <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <div>
                            <p className="font-semibold text-green-800">Job Completed!</p>
                            <p className="text-sm text-green-700">
                              Completed on {workOrder.completedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </SubcontractorLayout>
  );
}
