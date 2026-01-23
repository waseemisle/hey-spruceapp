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
  Play, Pause, Calendar, Clock, CheckCircle, XCircle, AlertCircle, Upload, MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import { RecurringWorkOrder, RecurringWorkOrderExecution } from '@/types';
import RecurringWorkOrdersImportModal from '@/components/recurring-work-orders-import-modal';
import { Checkbox } from '@/components/ui/checkbox';
import ViewControls from '@/components/view-controls';
import { useViewControls } from '@/contexts/view-controls-context';

export default function RecurringWorkOrdersManagement() {
  const [recurringWorkOrders, setRecurringWorkOrders] = useState<RecurringWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { viewMode, sortOption } = useViewControls();

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

      // Remove from selection if it was selected
      setSelectedIds(prev => prev.filter(id => id !== recurringWorkOrder.id));

      toast.success('Recurring work order and all related data deleted successfully');
      fetchRecurringWorkOrders();
    } catch (error) {
      console.error('Error deleting recurring work order:', error);
      toast.error('Failed to delete recurring work order');
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRecurringWorkOrders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecurringWorkOrders.map(rwo => rwo.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;

    const selectedCount = selectedIds.length;
    toast(`Delete ${selectedCount} recurring work order${selectedCount > 1 ? 's' : ''}?`, {
      description: 'This will also delete all related executions and scheduled emails. This action cannot be undone.',
      action: {
        label: 'Delete',
        onClick: async () => {
          await performBulkDelete();
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const performBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    try {
      setSubmitting(true);
      const deletePromises = selectedIds.map(async (id) => {
        // Delete related executions
        const executionsQuery = query(
          collection(db, 'recurringWorkOrderExecutions'),
          where('recurringWorkOrderId', '==', id)
        );
        const executionsSnapshot = await getDocs(executionsQuery);
        const executionDeletePromises = executionsSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(executionDeletePromises);

        // Delete the recurring work order itself
        await deleteDoc(doc(db, 'recurringWorkOrders', id));
      });

      await Promise.all(deletePromises);

      toast.success(`Successfully deleted ${selectedIds.length} recurring work order${selectedIds.length > 1 ? 's' : ''} and all related data`);
      setSelectedIds([]);
      fetchRecurringWorkOrders();
    } catch (error) {
      console.error('Error deleting recurring work orders:', error);
      toast.error('Failed to delete recurring work orders');
    } finally {
      setSubmitting(false);
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

  // Sort filtered recurring work orders
  const sortedRecurringWorkOrders = [...filteredRecurringWorkOrders].sort((a, b) => {
    if (sortOption === 'createdAt') {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate; // Newest first
    } else {
      const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bDate - aDate; // Most recently modified first
    }
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

  const formatRecurrencePattern = (rwo: RecurringWorkOrder) => {
    const label = (rwo as any).recurrencePatternLabel;
    if (label && ['SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-MONTHLY', 'BI-WEEKLY'].includes(label)) {
      return label;
    }
    const pattern = rwo.recurrencePattern as { type: string; interval: number; customPattern?: string } | undefined;
    if (!pattern) return 'Unknown pattern';
    if (pattern.type === 'daily') return `Every ${pattern.interval} day(s)`;
    if (pattern.type === 'weekly') return `Every ${pattern.interval} week(s)`;
    if (pattern.type === 'monthly') return `Every ${pattern.interval} month(s)`;
    if (pattern.type === 'yearly') return `Every ${pattern.interval} year(s)`;
    if (pattern.type === 'custom') return pattern.customPattern || 'Custom pattern';
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

        {/* Selection Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Checkbox
              id="select-all"
              checked={filteredRecurringWorkOrders.length > 0 && selectedIds.length === filteredRecurringWorkOrders.length}
              onCheckedChange={toggleSelectAll}
            />
            <label htmlFor="select-all" className="text-sm font-medium text-gray-700 cursor-pointer">
              Select All ({filteredRecurringWorkOrders.length})
            </label>
            {selectedIds.length > 0 && (
              <span className="text-sm text-gray-600">
                {selectedIds.length} selected
              </span>
            )}
          </div>
          
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedIds.length})
            </Button>
          )}

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
        </div>

        {/* View Controls */}
        <ViewControls />

        {/* Recurring Work Orders Grid/List */}
        {sortedRecurringWorkOrders.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <RotateCcw className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No recurring work orders found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <Checkbox
                      id="select-all-table"
                      checked={sortedRecurringWorkOrders.length > 0 && selectedIds.length === sortedRecurringWorkOrders.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Work Order #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Recurrence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Next Execution</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedRecurringWorkOrders.map((recurringWorkOrder) => (
                  <tr key={recurringWorkOrder.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Checkbox
                        id={`select-${recurringWorkOrder.id}-table`}
                        checked={selectedIds.includes(recurringWorkOrder.id)}
                        onCheckedChange={() => toggleSelection(recurringWorkOrder.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">{recurringWorkOrder.title}</div>
                      <div className="text-gray-500 text-xs mt-1 line-clamp-1">{recurringWorkOrder.description}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{recurringWorkOrder.workOrderNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{recurringWorkOrder.clientName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{recurringWorkOrder.locationName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{recurringWorkOrder.category}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getPriorityColor(recurringWorkOrder.priority)}`}>
                        {recurringWorkOrder.priority.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(recurringWorkOrder.status)}`}>
                        {recurringWorkOrder.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatRecurrencePattern(recurringWorkOrder)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {recurringWorkOrder.nextExecution ? new Date(recurringWorkOrder.nextExecution).toLocaleDateString() : 'Not scheduled'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.location.href = `/admin-portal/recurring-work-orders/${recurringWorkOrder.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.location.href = `/admin-portal/recurring-work-orders/${recurringWorkOrder.id}/edit`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {recurringWorkOrder.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(recurringWorkOrder)}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        {recurringWorkOrder.status === 'paused' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(recurringWorkOrder)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(recurringWorkOrder)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {sortedRecurringWorkOrders.map((recurringWorkOrder) => (
              <Card key={recurringWorkOrder.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Checkbox
                          id={`select-${recurringWorkOrder.id}`}
                          checked={selectedIds.includes(recurringWorkOrder.id)}
                          onCheckedChange={() => toggleSelection(recurringWorkOrder.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <CardTitle className="text-lg truncate">{recurringWorkOrder.title}</CardTitle>
                      </div>
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
                    {recurringWorkOrder.locationName && (
                      <div className="text-sm">
                        <span className="font-semibold">Location:</span> {recurringWorkOrder.locationName}
                      </div>
                    )}
                    <div className="text-sm">
                      <span className="font-semibold">Category:</span> {recurringWorkOrder.category}
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">Recurrence:</span> {formatRecurrencePattern(recurringWorkOrder)}
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
            ))}
          </div>
        )}

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
