'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, addDoc, where, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
  const [executionsByRWO, setExecutionsByRWO] = useState<Record<string, RecurringWorkOrderExecution[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'cancelled'>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
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

  const fetchAllExecutions = async () => {
    try {
      const executionsQuery = query(collection(db, 'recurringWorkOrderExecutions'));
      const snapshot = await getDocs(executionsQuery);
      const grouped: Record<string, RecurringWorkOrderExecution[]> = {};
      snapshot.docs.forEach(d => {
        const data = d.data();
        const exec: RecurringWorkOrderExecution = {
          id: d.id,
          ...data,
          scheduledDate: data.scheduledDate?.toDate(),
          executedDate: data.executedDate?.toDate(),
          emailSentAt: data.emailSentAt?.toDate(),
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        } as RecurringWorkOrderExecution;
        const rwoId = data.recurringWorkOrderId;
        if (!grouped[rwoId]) grouped[rwoId] = [];
        grouped[rwoId].push(exec);
      });
      setExecutionsByRWO(grouped);
    } catch (error) {
      console.error('Error fetching executions:', error);
    }
  };

  /** Compute next upcoming execution date from the recurrence pattern, skipping past completed dates */
  const toSafeDate = (v: any): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  /** Resolve recurrence interval from label or pattern */
  const resolveInterval = (rwo: RecurringWorkOrder): { mode: 'daily' | 'weekly' | 'monthly'; interval: number; daysOfWeek?: number[]; daysOfMonth?: number[] } => {
    const label = ((rwo as any).recurrencePatternLabel || '').toUpperCase();
    const pattern = rwo.recurrencePattern as any;
    const daysOfMonth = Array.isArray(pattern?.daysOfMonth) ? pattern.daysOfMonth : (pattern?.dayOfMonth ? [pattern.dayOfMonth] : undefined);
    switch (label) {
      case 'SEMIANNUALLY': return { mode: 'monthly', interval: 6, daysOfMonth };
      case 'QUARTERLY':    return { mode: 'monthly', interval: 3, daysOfMonth };
      case 'BI-MONTHLY':   return { mode: 'monthly', interval: 1, daysOfMonth }; // twice a month
      case 'MONTHLY':      return { mode: 'monthly', interval: 1, daysOfMonth };
      case 'BI-WEEKLY':    return { mode: 'daily', interval: 1, daysOfWeek: pattern?.daysOfWeek };
      case 'WEEKLY':       return { mode: 'weekly', interval: 1 };
      case 'DAILY':        return { mode: 'daily', interval: 1, daysOfWeek: pattern?.daysOfWeek };
    }
    if (pattern?.type === 'weekly') return { mode: 'weekly', interval: pattern.interval || 2 };
    if (pattern?.type === 'monthly') return { mode: 'monthly', interval: pattern.interval || 1, daysOfMonth };
    if (pattern?.type === 'daily') return { mode: 'daily', interval: 1, daysOfWeek: pattern?.daysOfWeek };
    return { mode: 'monthly', interval: 1 };
  };

  /** Check if an execution is effectively "done" (has work order or status executed) */
  const isExecutionDone = (e: RecurringWorkOrderExecution) =>
    e.status === 'executed' || !!(e as any).workOrderId;

  /** Compute next upcoming execution date from the recurrence pattern */
  const computeNextUpcomingDate = (rwo: RecurringWorkOrder): Date | null => {
    const pattern = rwo.recurrencePattern as any;
    const { mode, interval, daysOfWeek, daysOfMonth } = resolveInterval(rwo);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = toSafeDate(pattern?.startDate);
    const endDate = toSafeDate(pattern?.endDate);
    const firstService = rwo.nextServiceDates?.[0] ? toSafeDate(rwo.nextServiceDates[0]) : null;
    const anchor = startDate ?? firstService ?? (rwo.createdAt ? new Date(rwo.createdAt) : new Date());
    anchor.setHours(9, 0, 0, 0);

    // Build set of completed dates and find the latest completed date
    const rwoExecutions = executionsByRWO[rwo.id] || [];
    const doneDates = new Set<string>();
    let latestDoneTime = 0;
    for (const e of rwoExecutions) {
      if (!isExecutionDone(e)) continue;
      const d = toSafeDate(e.scheduledDate);
      if (d) {
        doneDates.add(d.toDateString());
        if (d.getTime() > latestDoneTime) latestDoneTime = d.getTime();
      }
    }

    // The next execution must be after both today AND the latest completed date
    const minDate = new Date(Math.max(today.getTime(), latestDoneTime));
    minDate.setHours(0, 0, 0, 0);

    const cursor = new Date(anchor);
    if (mode === 'daily') {
      const hasDaysFilter = Array.isArray(daysOfWeek) && daysOfWeek.length > 0;
      for (let i = 0; i < 730; i++) {
        if (endDate && cursor > endDate) break;
        if (cursor >= minDate && (!hasDaysFilter || daysOfWeek!.includes(cursor.getDay()))) {
          if (!doneDates.has(cursor.toDateString())) return new Date(cursor);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (mode === 'weekly') {
      for (let i = 0; i < 200; i++) {
        if (endDate && cursor > endDate) break;
        if (cursor >= minDate && !doneDates.has(cursor.toDateString())) return new Date(cursor);
        cursor.setDate(cursor.getDate() + interval * 7);
      }
    } else {
      // monthly — iterate month by month, checking each daysOfMonth entry
      const hasDaysOfMonth = Array.isArray(daysOfMonth) && daysOfMonth.length > 0;
      const sortedDays = hasDaysOfMonth ? [...daysOfMonth].sort((a, b) => a - b) : [anchor.getDate()];
      const monthCursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 9, 0, 0);
      for (let i = 0; i < 200; i++) {
        for (const dom of sortedDays) {
          const lastDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
          const actualDay = Math.min(dom, lastDay);
          const dt = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), actualDay, 9, 0, 0);
          if (dt < anchor) continue;
          if (endDate && dt > endDate) return null;
          if (dt >= minDate && !doneDates.has(dt.toDateString())) return dt;
        }
        monthCursor.setMonth(monthCursor.getMonth() + interval);
      }
    }
    return null;
  };

  useEffect(() => {
    fetchRecurringWorkOrders();
    fetchAllExecutions();
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

  const performBulkPause = async () => {
    const activeIds = selectedIds.filter(id =>
      recurringWorkOrders.find(r => r.id === id)?.status === 'active'
    );
    if (activeIds.length === 0) return;

    try {
      setSubmitting(true);
      await Promise.all(
        activeIds.map(id =>
          updateDoc(doc(db, 'recurringWorkOrders', id), {
            status: 'paused',
            updatedAt: serverTimestamp(),
          })
        )
      );
      toast.success(`Paused ${activeIds.length} recurring work order${activeIds.length > 1 ? 's' : ''}`);
      setSelectedIds([]);
      fetchRecurringWorkOrders();
    } catch (error) {
      console.error('Error pausing recurring work orders:', error);
      toast.error('Failed to pause recurring work orders');
    } finally {
      setSubmitting(false);
    }
  };

  const performBulkResume = async () => {
    const pausedIds = selectedIds.filter(id =>
      recurringWorkOrders.find(r => r.id === id)?.status === 'paused'
    );
    if (pausedIds.length === 0) return;

    try {
      setSubmitting(true);
      await Promise.all(
        pausedIds.map(id =>
          updateDoc(doc(db, 'recurringWorkOrders', id), {
            status: 'active',
            updatedAt: serverTimestamp(),
          })
        )
      );
      toast.success(`Resumed ${pausedIds.length} recurring work order${pausedIds.length > 1 ? 's' : ''}`);
      setSelectedIds([]);
      fetchRecurringWorkOrders();
    } catch (error) {
      console.error('Error resuming recurring work orders:', error);
      toast.error('Failed to resume recurring work orders');
    } finally {
      setSubmitting(false);
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

  // Compute unique locations sorted alphabetically
  const uniqueLocations = Array.from(
    new Set(recurringWorkOrders.map(rwo => rwo.locationName).filter((name): name is string => !!name))
  ).sort((a, b) => a.localeCompare(b));

  const filteredRecurringWorkOrders = recurringWorkOrders.filter(rwo => {
    // Filter by status
    const statusMatch = filter === 'all' || rwo.status === filter;

    // Filter by location
    const locationMatch = locationFilter === 'all' || rwo.locationName === locationFilter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      (rwo.title || '').toLowerCase().includes(searchLower) ||
      (rwo.description || '').toLowerCase().includes(searchLower) ||
      (rwo.clientName || '').toLowerCase().includes(searchLower) ||
      (rwo.workOrderNumber || '').toLowerCase().includes(searchLower) ||
      (rwo.category || '').toLowerCase().includes(searchLower);

    return statusMatch && locationMatch && searchMatch;
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
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const formatRecurrencePattern = (rwo: RecurringWorkOrder) => {
    const label = (rwo as any).recurrencePatternLabel;
    if (label && typeof label === 'string') {
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Recurring Work Orders</h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">Manage recurring work orders and their schedules</p>
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
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
            <label htmlFor="select-all" className="text-sm font-medium text-foreground cursor-pointer">
              Select All ({filteredRecurringWorkOrders.length})
            </label>
            {selectedIds.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} selected
              </span>
            )}
          </div>
          
          {selectedIds.length > 0 && (() => {
            const selectedActiveCount = selectedIds.filter(id =>
              recurringWorkOrders.find(r => r.id === id)?.status === 'active'
            ).length;
            const selectedPausedCount = selectedIds.filter(id =>
              recurringWorkOrders.find(r => r.id === id)?.status === 'paused'
            ).length;
            return (
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {selectedActiveCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={performBulkPause}
                    loading={submitting} disabled={submitting}
                    className="flex-1 sm:flex-none"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Pause {selectedActiveCount} Active
                  </Button>
                )}
                {selectedPausedCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={performBulkResume}
                    loading={submitting} disabled={submitting}
                    className="flex-1 sm:flex-none"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Resume {selectedPausedCount} Paused
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleBulkDelete}
                  loading={submitting} disabled={submitting}
                  className="flex-1 sm:flex-none border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete {selectedIds.length}
                </Button>
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="location-filter" className="text-sm font-medium text-foreground">
              Location:
            </label>
            <SearchableSelect
              id="location-filter"
              className="w-full max-w-[220px]"
              value={locationFilter}
              onValueChange={setLocationFilter}
              options={[
                { value: 'all', label: `All Locations (${recurringWorkOrders.length})` },
                ...uniqueLocations.map((loc) => ({
                  value: loc,
                  label: `${loc} (${recurringWorkOrders.filter((rwo) => rwo.locationName === loc).length})`,
                })),
              ]}
              placeholder="All locations"
              aria-label="Filter by location"
            />

            <label htmlFor="status-filter" className="text-sm font-medium text-foreground">
              Status:
            </label>
            <SearchableSelect
              id="status-filter"
              className="w-full max-w-[220px]"
              value={filter}
              onValueChange={(v) => setFilter(v as typeof filter)}
              options={['all', 'active', 'paused', 'cancelled'].map((filterOption) => ({
                value: filterOption,
                label: `${filterOption} (${recurringWorkOrders.filter((rwo) => filterOption === 'all' || rwo.status === filterOption).length})`,
              }))}
              placeholder="Status"
              aria-label="Filter by status"
            />
          </div>
        </div>

        {/* View Controls */}
        <ViewControls />

        {/* Recurring Work Orders Grid/List */}
        {sortedRecurringWorkOrders.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <RotateCcw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No recurring work orders found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <Checkbox
                      id="select-all-table"
                      checked={sortedRecurringWorkOrders.length > 0 && selectedIds.length === sortedRecurringWorkOrders.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work Order #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recurrence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Next Execution</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-gray-200">
                {sortedRecurringWorkOrders.map((recurringWorkOrder) => (
                  <tr key={recurringWorkOrder.id} className="hover:bg-muted transition-colors">
                    <td className="px-4 py-3">
                      <Checkbox
                        id={`select-${recurringWorkOrder.id}-table`}
                        checked={selectedIds.includes(recurringWorkOrder.id)}
                        onCheckedChange={() => toggleSelection(recurringWorkOrder.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-foreground">{recurringWorkOrder.title}</div>
                      <div className="text-muted-foreground text-xs mt-1 line-clamp-1">{recurringWorkOrder.description}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{recurringWorkOrder.workOrderNumber}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{recurringWorkOrder.clientName}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{recurringWorkOrder.locationName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{recurringWorkOrder.category}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getPriorityColor(recurringWorkOrder.priority || '')}`}>
                        {(recurringWorkOrder.priority || 'N/A').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(recurringWorkOrder.status || '')}`}>
                        {(recurringWorkOrder.status || 'N/A').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatRecurrencePattern(recurringWorkOrder)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {(() => {
                        const rwoExecs = executionsByRWO[recurringWorkOrder.id] || [];
                        const completed = rwoExecs.filter(isExecutionDone).length;
                        const pending = rwoExecs.filter(e => e.status === 'pending').length;
                        const total = completed + pending;
                        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                        return (
                          <div className="min-w-[80px] space-y-0.5">
                            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-green-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              <span className="text-green-600 font-semibold">{completed}</span> / {total}{pending > 0 && <span className="text-yellow-600 ml-1">({pending} pending)</span>}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {(() => {
                        const nextDate = computeNextUpcomingDate(recurringWorkOrder);
                        if (!nextDate) return 'Not scheduled';
                        const isToday = nextDate.toDateString() === new Date().toDateString();
                        return (
                          <span className={isToday ? 'text-blue-600 font-medium' : ''}>
                            {nextDate.toLocaleDateString()}
                            {isToday && <span className="ml-1 text-xs">(Today)</span>}
                          </span>
                        );
                      })()}
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
                            title="Pause Executions"
                            onClick={() => handleToggleStatus(recurringWorkOrder)}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        {recurringWorkOrder.status === 'paused' && (
                          <Button
                            size="sm"
                            variant="outline"
                            title="Resume Executions"
                            onClick={() => handleToggleStatus(recurringWorkOrder)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(recurringWorkOrder)}
                          className="text-red-400 hover:text-red-600 hover:bg-red-50"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedRecurringWorkOrders.map((recurringWorkOrder) => (
              <div key={recurringWorkOrder.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                {/* Row 0: checkbox + title/location + status badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <Checkbox
                      id={`select-${recurringWorkOrder.id}`}
                      checked={selectedIds.includes(recurringWorkOrder.id)}
                      onCheckedChange={() => toggleSelection(recurringWorkOrder.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{recurringWorkOrder.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{recurringWorkOrder.locationName || recurringWorkOrder.clientName || '—'}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(recurringWorkOrder.status || '')}`}>
                    {(recurringWorkOrder.status || 'N/A').toUpperCase()}
                  </span>
                </div>
                {/* Row 1: client */}
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground truncate">{recurringWorkOrder.clientName || '—'}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-semibold ${getPriorityColor(recurringWorkOrder.priority || '')}`}>
                    {(recurringWorkOrder.priority || 'N/A').toUpperCase()}
                  </span>
                </div>
                {/* Row 2: recurrence + next execution */}
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground truncate">{formatRecurrencePattern(recurringWorkOrder)}</span>
                  <span className="text-foreground font-medium shrink-0 text-xs">
                    {(() => {
                      const nextDate = computeNextUpcomingDate(recurringWorkOrder);
                      if (!nextDate) return 'Not scheduled';
                      const isToday = nextDate.toDateString() === new Date().toDateString();
                      return (
                        <span className={isToday ? 'text-blue-600' : ''}>
                          {nextDate.toLocaleDateString()}{isToday && ' (Today)'}
                        </span>
                      );
                    })()}
                  </span>
                </div>
                {/* Row 2.5: mini progress bar */}
                {(() => {
                  const rwoExecs = executionsByRWO[recurringWorkOrder.id] || [];
                  const completed = rwoExecs.filter(isExecutionDone).length;
                  const pending = rwoExecs.filter(e => e.status === 'pending').length;
                  const total = completed + pending;
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                  return (
                    <div className="space-y-1">
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span><span className="text-green-600 font-semibold">{completed}</span> done{pending > 0 && <>, <span className="text-yellow-600 font-semibold">{pending}</span> pending</>}</span>
                        {total > 0 && <span>{pct}%</span>}
                      </div>
                    </div>
                  );
                })()}
                {/* Row 3: actions */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs gap-1"
                    onClick={() => window.location.href = `/admin-portal/recurring-work-orders/${recurringWorkOrder.id}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2"
                    title="Edit"
                    onClick={() => window.location.href = `/admin-portal/recurring-work-orders/${recurringWorkOrder.id}/edit`}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  {recurringWorkOrder.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      title="Pause Executions"
                      onClick={() => handleToggleStatus(recurringWorkOrder)}
                    >
                      <Pause className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {recurringWorkOrder.status === 'paused' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      title="Resume Executions"
                      onClick={() => handleToggleStatus(recurringWorkOrder)}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50"
                    title="Delete"
                    onClick={() => handleDelete(recurringWorkOrder)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
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
