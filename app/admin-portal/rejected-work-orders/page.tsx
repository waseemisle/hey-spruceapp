'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
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
      default: return 'text-muted-foreground bg-muted';
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <XCircle className="h-8 w-8 text-red-600" />
              Rejected Work Orders
            </h1>
            <p className="text-muted-foreground mt-2">View all rejected work orders and rejection reasons</p>
          </div>
          <div className="text-sm text-muted-foreground">
            Total: <span className="font-bold text-foreground">{workOrders.length}</span> rejected work orders
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rejected work orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Rejected Work Orders Grid */}
        {filteredWorkOrders.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p>No rejected work orders found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkOrders.map((workOrder) => (
              <div
                key={workOrder.id}
                className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                {/* Row 1: title + priority badge */}
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-foreground text-sm leading-snug line-clamp-2 flex-1">{workOrder.title}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getPriorityColor(workOrder.priority)}`}>
                    {(workOrder.priority || 'medium').toUpperCase()}
                  </span>
                </div>

                {/* Row 2: secondary info */}
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">REJECTED</span>
                    <span className="font-mono text-xs">{workOrder.workOrderNumber}</span>
                  </div>
                  <div>Client: <span className="text-foreground">{workOrder.clientName}</span></div>
                  {workOrder.appyRequestor && (
                    <div>APPY Requestor: <span className="text-foreground">{workOrder.appyRequestor}</span></div>
                  )}
                  <div>Category: <span className="text-foreground">{workOrder.category}</span></div>
                  {workOrder.estimateBudget != null && (
                    <div>Budget: <span className="text-foreground">${workOrder.estimateBudget.toLocaleString()}</span></div>
                  )}
                  <div className="bg-red-50 border border-red-200 rounded p-2 mt-1">
                    <div className="flex items-start gap-1.5">
                      <XCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                      <span className="text-red-800 text-xs line-clamp-2">{workOrder.rejectionReason || 'No reason provided'}</span>
                    </div>
                    {workOrder.rejectedAt && (
                      <div className="flex items-center gap-1 text-xs text-red-700 mt-1">
                        <Calendar className="h-3 w-3" />
                        <span>Rejected {workOrder.rejectedAt?.toDate?.()?.toLocaleDateString() || 'N/A'}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <Calendar className="h-3 w-3" />
                    <span>Created: {workOrder.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="border-t border-border pt-1 flex items-center gap-1">
                  <Button
                    className="flex-1 h-8 text-xs gap-1"
                    variant="outline"
                    onClick={() => window.location.href = `/admin-portal/work-orders/${workOrder.id}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
