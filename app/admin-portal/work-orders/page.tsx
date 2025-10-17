'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, addDoc, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Share2, UserPlus, ClipboardList, Image as ImageIcon } from 'lucide-react';

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  locationId: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'bidding' | 'quotes_received' | 'assigned' | 'completed';
  images: string[];
  assignedTo?: string;
  assignedToName?: string;
  createdAt: any;
}

export default function WorkOrdersManagement() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'bidding' | 'assigned' | 'completed'>('all');

  const fetchWorkOrders = async () => {
    try {
      const workOrdersQuery = query(collection(db, 'workOrders'));
      const snapshot = await getDocs(workOrdersQuery);
      const workOrdersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as WorkOrder[];
      setWorkOrders(workOrdersData);
    } catch (error) {
      console.error('Error fetching work orders:', error);
      alert('Failed to load work orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  const handleApprove = async (workOrderId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await updateDoc(doc(db, 'workOrders', workOrderId), {
        status: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert('Work order approved successfully');
      fetchWorkOrders();
    } catch (error) {
      console.error('Error approving work order:', error);
      alert('Failed to approve work order');
    }
  };

  const handleReject = async (workOrderId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const reason = prompt('Enter rejection reason:');
      if (!reason) return;

      await updateDoc(doc(db, 'workOrders', workOrderId), {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason,
        updatedAt: serverTimestamp(),
      });

      alert('Work order rejected');
      fetchWorkOrders();
    } catch (error) {
      console.error('Error rejecting work order:', error);
      alert('Failed to reject work order');
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
        alert('No approved subcontractors found');
        return;
      }

      // Create bidding work order for each subcontractor
      const promises = subsSnapshot.docs.map(async (subDoc) => {
        const sub = subDoc.data();
        await addDoc(collection(db, 'biddingWorkOrders'), {
          workOrderId: workOrder.id,
          workOrderNumber: workOrder.workOrderNumber,
          subcontractorId: subDoc.id,
          subcontractorName: sub.fullName,
          subcontractorEmail: sub.email,
          workOrderTitle: workOrder.title,
          workOrderDescription: workOrder.description,
          clientId: workOrder.clientId,
          clientName: workOrder.clientName,
          status: 'pending',
          sharedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      });

      await Promise.all(promises);

      // Update work order status
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'bidding',
        sharedForBiddingAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert(`Work order shared with ${subsSnapshot.size} subcontractors for bidding`);
      fetchWorkOrders();
    } catch (error) {
      console.error('Error sharing for bidding:', error);
      alert('Failed to share work order for bidding');
    }
  };

  const filteredWorkOrders = workOrders.filter(wo => {
    if (filter === 'all') return true;
    return wo.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'approved': return 'text-green-600 bg-green-50';
      case 'rejected': return 'text-red-600 bg-red-50';
      case 'bidding': return 'text-blue-600 bg-blue-50';
      case 'quotes_received': return 'text-purple-600 bg-purple-50';
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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Work Orders</h1>
            <p className="text-gray-600 mt-2">Manage work orders and assignments</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'approved', 'bidding', 'assigned', 'completed'].map((filterOption) => (
            <Button
              key={filterOption}
              variant={filter === filterOption ? 'default' : 'outline'}
              onClick={() => setFilter(filterOption as typeof filter)}
              className="capitalize"
              size="sm"
            >
              {filterOption} ({workOrders.filter(w => filterOption === 'all' || w.status === filterOption).length})
            </Button>
          ))}
        </div>

        {/* Work Orders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkOrders.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No work orders found</p>
              </CardContent>
            </Card>
          ) : (
            filteredWorkOrders.map((workOrder) => (
              <Card key={workOrder.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{workOrder.title}</CardTitle>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(workOrder.status)}`}>
                        {workOrder.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getPriorityColor(workOrder.priority)}`}>
                        {workOrder.priority.toUpperCase()}
                      </span>
                      <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-semibold">
                        {workOrder.workOrderNumber}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-600 line-clamp-2">{workOrder.description}</p>

                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-semibold">Client:</span> {workOrder.clientName}
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">Category:</span> {workOrder.category}
                    </div>
                    {workOrder.assignedToName && (
                      <div className="text-sm">
                        <span className="font-semibold">Assigned to:</span> {workOrder.assignedToName}
                      </div>
                    )}
                  </div>

                  {workOrder.images && workOrder.images.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <ImageIcon className="h-4 w-4" />
                      <span>{workOrder.images.length} image(s)</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-4 space-y-2">
                    {workOrder.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleApprove(workOrder.id)}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          onClick={() => handleReject(workOrder.id)}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {workOrder.status === 'approved' && (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleShareForBidding(workOrder)}
                      >
                        <Share2 className="h-4 w-4 mr-2" />
                        Share for Bidding
                      </Button>
                    )}

                    {workOrder.status === 'quotes_received' && (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => window.location.href = `/admin-portal/quotes?workOrderId=${workOrder.id}`}
                      >
                        View Quotes
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
