'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, addDoc, where, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  RotateCcw, Plus, Edit2, Save, X, Search, Trash2, Eye, 
  Play, Pause, Calendar, Clock, CheckCircle, XCircle, AlertCircle, Zap, Upload, MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import { RecurringWorkOrder, RecurringWorkOrderExecution } from '@/types';
import RecurringWorkOrdersImportModal from '@/components/recurring-work-orders-import-modal';

export default function RecurringWorkOrdersManagement() {
  const [recurringWorkOrders, setRecurringWorkOrders] = useState<RecurringWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    clientId: '',
    locationId: '',
    title: '',
    description: '',
    category: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    estimateBudget: '',
    recurrenceType: 'monthly' as 'monthly',
    recurrenceInterval: 1,
    invoiceScheduleType: 'monthly' as 'monthly',
    invoiceScheduleInterval: 1,
    invoiceTime: '09:00',
    timezone: 'America/New_York',
  });

  const fetchRecurringWorkOrders = async () => {
    try {
      const recurringWorkOrdersQuery = query(collection(db, 'recurringWorkOrders'));
      const snapshot = await getDocs(recurringWorkOrdersQuery);
      const recurringWorkOrdersData = snapshot.docs.map(doc => {
        const data = doc.data();
        // Parse nextServiceDates array if it exists
        const nextServiceDates = data.nextServiceDates
          ? (Array.isArray(data.nextServiceDates)
              ? data.nextServiceDates.map((d: any) => {
                  if (d instanceof Date) return d;
                  if (d?.toDate) return d.toDate();
                  return new Date(d);
                })
              : [])
          : undefined;
        
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
          nextExecution: data.nextExecution?.toDate(),
          lastExecution: data.lastExecution?.toDate(),
          lastServiced: data.lastServiced?.toDate(),
          nextServiceDates: nextServiceDates,
        } as RecurringWorkOrder;
      });
      setRecurringWorkOrders(recurringWorkOrdersData);
    } catch (error) {
      console.error('Error fetching recurring work orders:', error);
      toast.error('Failed to load recurring work orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecurringWorkOrders();
  }, []);

  const handleToggleStatus = async (recurringWorkOrder: RecurringWorkOrder) => {
    const newStatus = recurringWorkOrder.status === 'active' ? 'paused' : 'active';
    
    try {
      await updateDoc(doc(db, 'recurringWorkOrders', recurringWorkOrder.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      toast.success(`Recurring work order ${newStatus === 'active' ? 'activated' : 'paused'}`);
      fetchRecurringWorkOrders();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleCancel = async (recurringWorkOrder: RecurringWorkOrder) => {
    try {
      await updateDoc(doc(db, 'recurringWorkOrders', recurringWorkOrder.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });

      toast.success('Recurring work order cancelled');
      fetchRecurringWorkOrders();
    } catch (error) {
      console.error('Error cancelling recurring work order:', error);
      toast.error('Failed to cancel recurring work order');
    }
  };

  const handleExecuteNow = async (recurringWorkOrder: RecurringWorkOrder) => {
    try {
      setSubmitting(true);
      
      const response = await fetch('/api/recurring-work-orders/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recurringWorkOrderId: recurringWorkOrder.id,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success('Recurring work order executed successfully! Email sent to client.');
        fetchRecurringWorkOrders();
      } else {
        toast.error(result.error || 'Failed to execute recurring work order');
      }
    } catch (error) {
      console.error('Error executing recurring work order:', error);
      toast.error('Failed to execute recurring work order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (recurringWorkOrder: RecurringWorkOrder) => {
    toast(`Delete recurring work order "${recurringWorkOrder.title}"?`, {
      description: 'This will also delete all related executions and scheduled emails. This action cannot be undone.',
      action: {
        label: 'Delete',
        onClick: async () => {
          await performDeleteRecurringWorkOrder(recurringWorkOrder);
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const performDeleteRecurringWorkOrder = async (recurringWorkOrder: RecurringWorkOrder) => {
    try {
      // Delete related executions
      const executionsQuery = query(
        collection(db, 'recurringWorkOrderExecutions'),
        where('recurringWorkOrderId', '==', recurringWorkOrder.id)
      );
      const executionsSnapshot = await getDocs(executionsQuery);
      const executionDeletePromises = executionsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(executionDeletePromises);

      // Delete the recurring work order itself
      await deleteDoc(doc(db, 'recurringWorkOrders', recurringWorkOrder.id));

      toast.success('Recurring work order and all related data deleted successfully');
      fetchRecurringWorkOrders();
    } catch (error) {
      console.error('Error deleting recurring work order:', error);
      toast.error('Failed to delete recurring work order');
    }
  };

  const filteredRecurringWorkOrders = recurringWorkOrders.filter(rwo => {
    // Filter by status
    const statusMatch = filter === 'all' || rwo.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      rwo.title.toLowerCase().includes(searchLower) ||
      rwo.description.toLowerCase().includes(searchLower) ||
      rwo.clientName.toLowerCase().includes(searchLower) ||
      rwo.workOrderNumber.toLowerCase().includes(searchLower) ||
      rwo.category.toLowerCase().includes(searchLower);

    return statusMatch && searchMatch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-50';
      case 'paused': return 'text-yellow-600 bg-yellow-50';
      case 'cancelled': return 'text-red-600 bg-red-50';
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

  const formatRecurrencePattern = (pattern: any) => {
    if (pattern.type === 'daily') {
      return `Every ${pattern.interval} day(s)`;
    } else if (pattern.type === 'weekly') {
      return `Every ${pattern.interval} week(s)`;
    } else if (pattern.type === 'monthly') {
      return `Every ${pattern.interval} month(s)`;
    } else if (pattern.type === 'yearly') {
      return `Every ${pattern.interval} year(s)`;
    } else if (pattern.type === 'custom') {
      return pattern.customPattern || 'Custom pattern';
    }
    return 'Unknown pattern';
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
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Recurring Work Orders</h1>
            <p className="text-gray-600 mt-2 text-sm sm:text-base">Manage recurring work orders and their schedules</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => window.location.href = '/admin-portal/recurring-work-orders/location-map'}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <MapPin className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Location Map</span>
              <span className="sm:hidden">Map</span>
            </Button>
            <Button 
              onClick={() => setShowImportModal(true)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Upload className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Import from CSV/Excel</span>
              <span className="sm:hidden">Import</span>
            </Button>
            <Button 
              onClick={() => window.location.href = '/admin-portal/recurring-work-orders/create'}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Create Recurring Work Order</span>
              <span className="sm:hidden">Create</span>
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search recurring work orders by title, description, client, number, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter Dropdown */}
        <div className="flex items-center gap-3">
          <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">
            Filter by Status:
          </label>
          <select
            id="status-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 capitalize"
          >
            {['all', 'active', 'paused', 'cancelled'].map((filterOption) => (
              <option key={filterOption} value={filterOption} className="capitalize">
                {filterOption} ({recurringWorkOrders.filter(rwo => filterOption === 'all' || rwo.status === filterOption).length})
              </option>
            ))}
          </select>
        </div>

        {/* Recurring Work Orders Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredRecurringWorkOrders.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <RotateCcw className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No recurring work orders found</p>
              </CardContent>
            </Card>
          ) : (
            filteredRecurringWorkOrders.map((recurringWorkOrder) => (
              <Card key={recurringWorkOrder.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{recurringWorkOrder.title}</CardTitle>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(recurringWorkOrder.status)}`}>
                        {recurringWorkOrder.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getPriorityColor(recurringWorkOrder.priority)}`}>
                        {recurringWorkOrder.priority.toUpperCase()}
                      </span>
                      <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-semibold">
                        {recurringWorkOrder.workOrderNumber}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-4 sm:p-6">
                  <p className="text-sm text-gray-600 line-clamp-2">{recurringWorkOrder.description}</p>

                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-semibold">Client:</span> {recurringWorkOrder.clientName}
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">Category:</span> {recurringWorkOrder.category}
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">Recurrence:</span> {formatRecurrencePattern(recurringWorkOrder.recurrencePattern)}
                    </div>
                    {recurringWorkOrder.estimateBudget && (
                      <div className="text-sm">
                        <span className="font-semibold">Estimate Budget:</span> ${recurringWorkOrder.estimateBudget.toLocaleString()}
                      </div>
                    )}
                    <div className="text-sm">
                      <span className="font-semibold">Next Execution:</span> {recurringWorkOrder.nextExecution ? new Date(recurringWorkOrder.nextExecution).toLocaleDateString() : 'Not scheduled'}
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">Executions:</span> {recurringWorkOrder.successfulExecutions}/{recurringWorkOrder.totalExecutions}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-w-0"
                        onClick={() => window.location.href = `/admin-portal/recurring-work-orders/${recurringWorkOrder.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">View</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-w-0"
                        onClick={() => window.location.href = `/admin-portal/recurring-work-orders/${recurringWorkOrder.id}/edit`}
                      >
                        <Edit2 className="h-4 w-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="px-2 sm:px-3"
                        onClick={() => handleDelete(recurringWorkOrder)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {recurringWorkOrder.status === 'active' && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="flex-1 min-w-0 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleExecuteNow(recurringWorkOrder)}
                          disabled={submitting}
                        >
                          <Zap className="h-4 w-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Execute Now</span>
                          <span className="sm:hidden">Execute</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 min-w-0"
                          onClick={() => handleToggleStatus(recurringWorkOrder)}
                        >
                          <Pause className="h-4 w-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Pause</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1 min-w-0"
                          onClick={() => handleCancel(recurringWorkOrder)}
                        >
                          <XCircle className="h-4 w-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Cancel</span>
                        </Button>
                      </div>
                    )}

                    {recurringWorkOrder.status === 'paused' && (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleToggleStatus(recurringWorkOrder)}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Resume
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Import Modal */}
        <RecurringWorkOrdersImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            fetchRecurringWorkOrders();
            setShowImportModal(false);
          }}
        />
      </div>
    </AdminLayout>
  );
}
