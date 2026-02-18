'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { XCircle, Search, Eye, Calendar, User } from 'lucide-react';
import { toast } from 'sonner';

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  appyRequestor?: string;
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
  status: string;
  images: string[];
  rejectedBy?: string;
  rejectedAt?: any;
  rejectionReason?: string;
  createdAt: any;
}

export default function RejectedWorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRejectedWorkOrders = async () => {
    try {
      const workOrdersQuery = query(
        collection(db, 'workOrders'),
        where('status', '==', 'rejected')
      );
      const snapshot = await getDocs(workOrdersQuery);
      const workOrdersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as WorkOrder[];

      // Sort by rejected date (most recent first)
      workOrdersData.sort((a, b) => {
        const aTime = a.rejectedAt?.toMillis?.() || 0;
        const bTime = b.rejectedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setWorkOrders(workOrdersData);
    } catch (error) {
      console.error('Error fetching rejected work orders:', error);
      toast.error('Failed to load rejected work orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRejectedWorkOrders();
  }, []);

  const filteredWorkOrders = workOrders.filter(wo => {
    const searchLower = searchQuery.toLowerCase();
    return !searchQuery ||
      wo.title?.toLowerCase().includes(searchLower) ||
      wo.description?.toLowerCase().includes(searchLower) ||
      wo.clientName?.toLowerCase().includes(searchLower) ||
      wo.workOrderNumber?.toLowerCase().includes(searchLower) ||
      wo.category?.toLowerCase().includes(searchLower) ||
      wo.rejectionReason?.toLowerCase().includes(searchLower);
  });

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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <XCircle className="h-8 w-8 text-red-600" />
              Rejected Work Orders
            </h1>
            <p className="text-gray-600 mt-2">View all rejected work orders and rejection reasons</p>
          </div>
          <div className="text-sm text-gray-600">
            Total: <span className="font-bold text-gray-900">{workOrders.length}</span> rejected work orders
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search rejected work orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Rejected Work Orders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkOrders.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No rejected work orders found</p>
              </CardContent>
            </Card>
          ) : (
            filteredWorkOrders.map((workOrder) => (
              <Card key={workOrder.id} className="hover:shadow-lg transition-shadow border-l-4 border-l-red-500">
                <CardHeader>
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-lg line-clamp-2 flex-1">{workOrder.title}</CardTitle>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getPriorityColor(workOrder.priority)}`}>
                        {(workOrder.priority || 'medium').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-semibold">
                        REJECTED
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
                    {workOrder.estimateBudget && (
                      <div className="text-sm">
                        <span className="font-semibold">Estimate Budget:</span> <span className="text-gray-700">${workOrder.estimateBudget.toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Rejection Info */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-red-900 text-sm mb-1">Rejection Reason</h3>
                        <p className="text-sm text-red-800">{workOrder.rejectionReason || 'No reason provided'}</p>
                      </div>
                    </div>
                    {workOrder.rejectedAt && (
                      <div className="flex items-center gap-2 text-xs text-red-700 pt-2 border-t border-red-200">
                        <Calendar className="h-3 w-3" />
                        <span>Rejected on {workOrder.rejectedAt?.toDate?.()?.toLocaleDateString() || 'N/A'}</span>
                      </div>
                    )}
                  </div>

                  {/* Timeline */}
                  <div className="pt-3 border-t space-y-1 text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      <span>Created: {workOrder.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A'}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => window.location.href = `/admin-portal/work-orders/${workOrder.id}`}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
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
