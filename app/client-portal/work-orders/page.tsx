'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardList, Plus, Calendar, AlertCircle, Search, Eye } from 'lucide-react';
import Link from 'next/link';

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
  rejectedReason?: string;
  scheduledServiceDate?: any;
  scheduledServiceTime?: string;
  scheduleSharedWithClient?: boolean;
  assignedToName?: string;
}

export default function ClientWorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Fetch client document to get assigned locations
          const clientDoc = await getDoc(doc(db, 'clients', user.uid));
          const clientData = clientDoc.data();
          const assignedLocations = clientData?.assignedLocations || [];

          let workOrdersQuery;

          if (assignedLocations.length > 0) {
            // Filter by assigned locations
            workOrdersQuery = query(
              collection(db, 'workOrders'),
              where('locationId', 'in', assignedLocations),
              orderBy('createdAt', 'desc')
            );
          } else {
            // Fallback to clientId for backward compatibility
            workOrdersQuery = query(
              collection(db, 'workOrders'),
              where('clientId', '==', user.uid),
              orderBy('createdAt', 'desc')
            );
          }

          const unsubscribeSnapshot = onSnapshot(
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

          return () => unsubscribeSnapshot();
        } catch (error) {
          console.error('Error setting up work orders listener:', error);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const getStatusBadge = (status: string) => {
    const normalized = normalizeStatus(status);
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      quotes_received: 'bg-blue-100 text-blue-800',
      bidding: 'bg-purple-100 text-purple-800',
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

  const filteredWorkOrders = workOrders.filter(wo => {
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
    workOrders.filter(wo => normalizeStatus(wo.status) === value).length;

  const filterOptions = [
    { value: 'all', label: 'All', count: workOrders.length },
    { value: 'pending', label: 'Pending', count: getStatusCount('pending') },
    { value: 'approved', label: 'Approved', count: getStatusCount('approved') },
    { value: 'bidding', label: 'Bidding', count: getStatusCount('bidding') },
    { value: 'assigned', label: 'Assigned', count: getStatusCount('assigned') },
    { value: 'accepted_by_subcontractor', label: 'Scheduled', count: getStatusCount('accepted_by_subcontractor') },
    { value: 'completed', label: 'Completed', count: getStatusCount('completed') },
  ];

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Work Orders</h1>
            <p className="text-gray-600 mt-2">Manage your maintenance requests</p>
          </div>
          <Link href="/client-portal/work-orders/create">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Work Order
            </Button>
          </Link>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search work orders by title, description, category, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">
            Filter by Status:
          </label>
          <select
            id="status-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {filterOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </div>

        {filteredWorkOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {filter === 'all' ? 'No work orders yet' : `No ${filter} work orders`}
              </h3>
              <p className="text-gray-600 text-center mb-4">
                {filter === 'all' ? 'Get started by creating your first work order' : 'Try a different filter'}
              </p>
              {filter === 'all' && (
                <Link href="/client-portal/work-orders/create">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Work Order
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredWorkOrders.map((workOrder) => (
              <Card key={workOrder.id} className="h-full flex flex-col hover:shadow-lg transition-shadow">
                <CardHeader className="flex-shrink-0">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg mb-2 line-clamp-2">{workOrder.title}</CardTitle>
                      {workOrder.workOrderNumber && (
                        <p className="text-sm text-gray-600 mb-2">WO: {workOrder.workOrderNumber}</p>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(workOrder.status)}`}>
                          {getStatusLabel(workOrder.status)}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPriorityBadge(workOrder.priority)}`}>
                          {workOrder.priority} priority
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 flex-1 flex flex-col">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Location:</p>
                    <p className="text-sm text-gray-600">{workOrder.locationName}</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Category:</p>
                    <p className="text-sm text-gray-600">{workOrder.category}</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Description:</p>
                    <p className="text-sm text-gray-600 line-clamp-3">{workOrder.description}</p>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="h-4 w-4" />
                    <span>Created {workOrder.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</span>
                  </div>

                  {workOrder.status === 'rejected' && workOrder.rejectedReason && (
                    <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-red-800 mb-1">Rejection Reason:</p>
                          <p className="text-xs text-red-700">{workOrder.rejectedReason}</p>
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

                  <div className="pt-3 mt-auto">
                    <Link href={`/client-portal/work-orders/${workOrder.id}`}>
                      <Button size="sm" className="w-full">
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
