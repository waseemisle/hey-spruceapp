'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Edit2, Play, Pause, XCircle, Trash2, 
  Calendar, Clock, RotateCcw, CheckCircle, XCircle as XCircleIcon, 
  AlertCircle, Download, Mail, ExternalLink, RefreshCw, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { RecurringWorkOrder, RecurringWorkOrderExecution, WorkOrderTimelineEvent, WorkOrderSystemInformation } from '@/types';
import { formatAddress } from '@/lib/utils';
import WorkOrderSystemInfo from '@/components/work-order-system-info';

export default function RecurringWorkOrderDetails({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [recurringWorkOrder, setRecurringWorkOrder] = useState<RecurringWorkOrder | null>(null);
  const [executions, setExecutions] = useState<RecurringWorkOrderExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creatorDisplayName, setCreatorDisplayName] = useState<string | null>(null);

  const fetchRecurringWorkOrder = async () => {
    try {
      const docRef = doc(db, 'recurringWorkOrders', params.id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
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
        
        setRecurringWorkOrder({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
          nextExecution: data.nextExecution?.toDate(),
          lastExecution: data.lastExecution?.toDate(),
          lastServiced: data.lastServiced?.toDate(),
          nextServiceDates: nextServiceDates,
          systemInformation: data.systemInformation,
          timeline: data.timeline,
          createdByName: data.createdByName,
          creationSource: data.creationSource,
        } as RecurringWorkOrder);
      } else {
        toast.error('Recurring work order not found');
        router.push('/admin-portal/recurring-work-orders');
      }
    } catch (error) {
      console.error('Error fetching recurring work order:', error);
      toast.error('Failed to load recurring work order');
    }
  };

  const fetchExecutions = async () => {
    try {
      const executionsQuery = query(
        collection(db, 'recurringWorkOrderExecutions'),
        where('recurringWorkOrderId', '==', params.id)
      );
      const snapshot = await getDocs(executionsQuery);
      const executionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        scheduledDate: doc.data().scheduledDate?.toDate(),
        executedDate: doc.data().executedDate?.toDate(),
        emailSentAt: doc.data().emailSentAt?.toDate(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      })) as RecurringWorkOrderExecution[];
      
      // Sort by execution number descending (most recent first)
      executionsData.sort((a, b) => b.executionNumber - a.executionNumber);
      setExecutions(executionsData);
    } catch (error) {
      console.error('Error fetching executions:', error);
      toast.error('Failed to load executions');
    }
  };

  useEffect(() => {
    fetchRecurringWorkOrder();
    fetchExecutions();
    setLoading(false);
  }, [params.id]);

  // Resolve creator display name when not stored on the document
  useEffect(() => {
    if (!recurringWorkOrder?.createdBy) {
      setCreatorDisplayName(null);
      return;
    }
    const storedName = recurringWorkOrder.createdByName ?? recurringWorkOrder.systemInformation?.createdBy?.name;
    if (storedName) {
      setCreatorDisplayName(storedName);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'adminUsers', recurringWorkOrder.createdBy))
      .then((adminSnap) => {
        if (cancelled) return;
        setCreatorDisplayName(adminSnap.exists() ? (adminSnap.data().fullName ?? 'Admin') : 'Admin');
      })
      .catch(() => {
        if (!cancelled) setCreatorDisplayName('Admin');
      });
    return () => { cancelled = true; };
  }, [recurringWorkOrder?.id, recurringWorkOrder?.createdBy, recurringWorkOrder?.createdByName, recurringWorkOrder?.systemInformation?.createdBy?.name]);

  const getCreationSourceLabel = (rwo: RecurringWorkOrder): string => {
    // Only attribute to a person when explicitly created via Admin Portal UI form.
    // All other recurring work orders (CSV import or unknown) are described as CSV-created to avoid false attribution.
    if (rwo.creationSource === 'admin_portal_ui') {
      const creatorName = rwo.createdByName ?? rwo.systemInformation?.createdBy?.name ?? creatorDisplayName ?? 'Admin';
      return `Recurring work order created by ${creatorName} via Admin Portal`;
    }
    return 'Recurring work order created via CSV import';
  };

  const buildSystemInformation = (rwo: RecurringWorkOrder): WorkOrderSystemInformation => {
    const stored = rwo.systemInformation;
    if (stored?.createdBy) return stored;
    const name = rwo.createdByName ?? rwo.systemInformation?.createdBy?.name ?? creatorDisplayName ?? 'Unknown';
    const createdAt = rwo.createdAt instanceof Date ? rwo.createdAt : new Date(rwo.createdAt);
    return {
      createdBy: {
        id: rwo.createdBy,
        name,
        role: 'admin',
        timestamp: createdAt,
      },
    };
  };

  const buildTimeline = (rwo: RecurringWorkOrder): WorkOrderTimelineEvent[] => {
    const stored = rwo.timeline;
    const createdAt = rwo.createdAt instanceof Date ? rwo.createdAt : new Date(rwo.createdAt);
    const name = rwo.createdByName ?? rwo.systemInformation?.createdBy?.name ?? creatorDisplayName ?? 'Unknown';
    const source = rwo.creationSource === 'admin_portal_ui' ? 'admin_portal_ui' : 'csv_import';
    const createdEvent: WorkOrderTimelineEvent = {
      id: 'created',
      timestamp: createdAt,
      type: 'created',
      userId: rwo.createdBy,
      userName: name,
      userRole: 'admin',
      details: getCreationSourceLabel(rwo),
      metadata: {
        source,
        workOrderNumber: rwo.workOrderNumber,
        priority: rwo.priority,
        clientName: rwo.clientName,
        locationName: rwo.locationName,
      },
    };
    if (stored && stored.length > 0) {
      const hasCreated = stored.some((e: any) => e?.type === 'created');
      if (hasCreated) {
        return stored.map((e: any) =>
          e?.type === 'created'
            ? { ...e, details: createdEvent.details, metadata: { ...(e.metadata || {}), ...createdEvent.metadata } }
            : e
        );
      }
      return [createdEvent, ...stored];
    }
    return [createdEvent];
  };

  const handleToggleStatus = async () => {
    if (!recurringWorkOrder) return;
    
    const newStatus = recurringWorkOrder.status === 'active' ? 'paused' : 'active';
    
    try {
      setSubmitting(true);
      await updateDoc(doc(db, 'recurringWorkOrders', recurringWorkOrder.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      toast.success(`Recurring work order ${newStatus === 'active' ? 'activated' : 'paused'}`);
      fetchRecurringWorkOrder();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!recurringWorkOrder) return;
    
    try {
      setSubmitting(true);
      await updateDoc(doc(db, 'recurringWorkOrders', recurringWorkOrder.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });

      toast.success('Recurring work order cancelled');
      fetchRecurringWorkOrder();
    } catch (error) {
      console.error('Error cancelling recurring work order:', error);
      toast.error('Failed to cancel recurring work order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitializeExecution = async (scheduledDate: Date, executionIndex: number) => {
    if (!recurringWorkOrder) return;

    try {
      setSubmitting(true);
      const response = await fetch('/api/recurring-work-orders/initialize-execution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recurringWorkOrderId: recurringWorkOrder.id,
          scheduledDate: scheduledDate.toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize execution');
      }

      toast.success(`Execution #${data.executionId ? executionIndex + 1 : executionIndex + 1} initialized with work order ${data.workOrderNumber}`);

      // Refresh data
      await fetchExecutions();
      await fetchRecurringWorkOrder();
    } catch (error: any) {
      console.error('Error initializing execution:', error);
      toast.error(error.message || 'Failed to initialize execution');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateWorkOrder = async (executionId: string, executionNumber: number) => {
    try {
      setSubmitting(true);
      const response = await fetch('/api/recurring-work-orders/generate-execution-work-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          executionId: executionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create work order');
      }

      toast.success(`Work order created for Execution #${executionNumber}`);

      // Refresh data
      await fetchExecutions();
      await fetchRecurringWorkOrder();
    } catch (error: any) {
      console.error('Error creating work order:', error);
      toast.error(error.message || 'Failed to create work order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteNow = async () => {
    if (!recurringWorkOrder) return;

    try {
      setSubmitting(true);

      // Try to find next pending execution record first
      const pendingExecutions = executions
        .filter(exec => exec.status === 'pending' && !(exec as any).workOrderId)
        .sort((a, b) => a.executionNumber - b.executionNumber);

      const body: any = { recurringWorkOrderId: recurringWorkOrder.id };
      if (pendingExecutions.length > 0) {
        body.executionId = pendingExecutions[0].id;
      }
      // If no pending execution exists, the execute API will create one

      const response = await fetch('/api/recurring-work-orders/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success('Execution completed! Work order created.');
        await fetchRecurringWorkOrder();
        await fetchExecutions();
      } else {
        toast.error(result.error || 'Failed to execute iteration');
      }
    } catch (error) {
      console.error('Error executing iteration:', error);
      toast.error('Failed to execute iteration');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-50';
      case 'paused': return 'text-yellow-600 bg-yellow-50';
      case 'cancelled': return 'text-red-600 bg-red-50';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getExecutionStatusColor = (status: string) => {
    switch (status) {
      case 'executed': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'skipped': return 'text-muted-foreground bg-muted';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  /**
   * Convert any date-like value (Firestore Timestamp, Date, string) to a JS Date.
   */
  const toSafeDate = (v: any): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000); // Firestore Timestamp-like
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  /**
   * Resolve the interval in months/weeks from the label or pattern fields.
   * Labels: SEMIANNUALLY=6mo, QUARTERLY=3mo, BI-MONTHLY=2mo, MONTHLY=1mo, BI-WEEKLY=2wk, WEEKLY=1wk, DAILY
   */
  const resolveInterval = (rwo: RecurringWorkOrder): { mode: 'daily' | 'weekly' | 'monthly'; interval: number; daysOfWeek?: number[] } => {
    const label = ((rwo as any).recurrencePatternLabel || '').toUpperCase();
    const pattern = rwo.recurrencePattern as any;

    // Resolve from label first (most reliable)
    switch (label) {
      case 'SEMIANNUALLY': return { mode: 'monthly', interval: 6 };
      case 'QUARTERLY':    return { mode: 'monthly', interval: 3 };
      case 'BI-MONTHLY':   return { mode: 'monthly', interval: 2 };
      case 'MONTHLY':      return { mode: 'monthly', interval: 1 };
      case 'BI-WEEKLY':    return { mode: 'weekly', interval: 2 };
      case 'WEEKLY':       return { mode: 'weekly', interval: 1 };
      case 'DAILY':        return { mode: 'daily', interval: 1, daysOfWeek: pattern?.daysOfWeek };
    }

    // Fall back to pattern.type + pattern.interval
    if (pattern?.type === 'weekly') return { mode: 'weekly', interval: pattern.interval || 2 };
    if (pattern?.type === 'monthly') return { mode: 'monthly', interval: pattern.interval || 1 };
    if (pattern?.type === 'daily') return { mode: 'daily', interval: 1, daysOfWeek: pattern?.daysOfWeek };

    // Ultimate fallback: monthly
    return { mode: 'monthly', interval: 1 };
  };

  /**
   * Generate ALL scheduled dates from the recurrence start date forward.
   * Returns dates from the very beginning so we can match against executed records.
   */
  const generateAllScheduledDates = (rwo: RecurringWorkOrder, maxDates: number = 200): Date[] => {
    const pattern = rwo.recurrencePattern as any;
    const { mode, interval, daysOfWeek } = resolveInterval(rwo);

    const startDate = toSafeDate(pattern?.startDate);
    const endDate = toSafeDate(pattern?.endDate);

    // Anchor: pattern startDate > nextServiceDates[0] > createdAt > now
    const firstServiceDate = rwo.nextServiceDates?.[0] ? toSafeDate(rwo.nextServiceDates[0]) : null;
    const anchor = startDate ?? firstServiceDate ?? (rwo.createdAt ? new Date(rwo.createdAt) : new Date());
    anchor.setHours(9, 0, 0, 0);

    const results: Date[] = [];
    const cursor = new Date(anchor);

    if (mode === 'daily') {
      const hasDaysFilter = Array.isArray(daysOfWeek) && daysOfWeek.length > 0;
      let iters = 0;
      while (results.length < maxDates && iters < 730) {
        if (endDate && cursor > endDate) break;
        if (!hasDaysFilter || daysOfWeek!.includes(cursor.getDay())) {
          results.push(new Date(cursor));
        }
        cursor.setDate(cursor.getDate() + 1);
        iters++;
      }
    } else if (mode === 'weekly') {
      let iters = 0;
      while (results.length < maxDates && iters < 200) {
        if (endDate && cursor > endDate) break;
        results.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + interval * 7);
        iters++;
      }
    } else {
      // monthly (covers MONTHLY, BI-MONTHLY, QUARTERLY, SEMIANNUALLY)
      let iters = 0;
      while (results.length < maxDates && iters < 200) {
        if (endDate && cursor > endDate) break;
        results.push(new Date(cursor));
        cursor.setMonth(cursor.getMonth() + interval);
        iters++;
      }
    }

    return results;
  };

  type ExecutionStatus = 'completed' | 'pending' | 'failed' | 'upcoming';

  interface ExecutionSlot {
    executionNumber: number;
    scheduledDate: Date;
    status: ExecutionStatus;
    execution?: RecurringWorkOrderExecution; // actual execution record if exists
  }

  /**
   * Build a full execution timeline: past (completed/failed) + upcoming.
   * Matches generated schedule dates against actual execution records.
   */
  const buildExecutionTimeline = (rwo: RecurringWorkOrder): {
    pastExecutions: ExecutionSlot[];
    upcomingExecutions: ExecutionSlot[];
    totalCompleted: number;
  } => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Build a map of executed dates -> execution records
    const executedDateMap = new Map<string, RecurringWorkOrderExecution>();
    for (const exec of executions) {
      const execDate = toSafeDate(exec.scheduledDate);
      if (execDate) executedDateMap.set(execDate.toDateString(), exec);
    }

    // Also map by approximate date match (within 24h) for robustness
    const getMatchingExecution = (date: Date): RecurringWorkOrderExecution | undefined => {
      const exact = executedDateMap.get(date.toDateString());
      if (exact) return exact;
      // Check within 24h window
      for (const exec of executions) {
        const execDate = toSafeDate(exec.scheduledDate);
        if (execDate && Math.abs(execDate.getTime() - date.getTime()) < 24 * 60 * 60 * 1000) {
          return exec;
        }
      }
      return undefined;
    };

    const allDates = generateAllScheduledDates(rwo);
    const pastExecutions: ExecutionSlot[] = [];
    const upcomingExecutions: ExecutionSlot[] = [];
    let totalCompleted = 0;

    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i];
      const matchingExec = getMatchingExecution(date);
      const isPast = date <= today;

      if (matchingExec) {
        // An execution with a workOrderId is effectively completed even if status is still 'pending'
        const hasWorkOrder = !!(matchingExec as any).workOrderId;
        const status: ExecutionStatus =
          (matchingExec.status === 'executed' || hasWorkOrder) ? 'completed'
          : matchingExec.status === 'failed' ? 'failed'
          : matchingExec.status === 'pending' ? 'pending'
          : 'upcoming';

        const slot: ExecutionSlot = {
          executionNumber: i + 1,
          scheduledDate: date,
          status,
          execution: matchingExec,
        };

        if (status === 'completed' || status === 'failed') {
          pastExecutions.push(slot);
          if (status === 'completed') totalCompleted++;
        } else if (isPast) {
          // Past date with pending execution — treat as missed/pending
          pastExecutions.push({ ...slot, status: 'pending' });
        } else {
          upcomingExecutions.push(slot);
        }
      } else if (isPast) {
        // Past date, no execution record — it was missed or not yet tracked
        // Only show as missed if it's after the first execution or if there are any executions
        if (executions.length > 0 || i === 0) {
          pastExecutions.push({
            executionNumber: i + 1,
            scheduledDate: date,
            status: 'pending',
          });
        }
      } else {
        upcomingExecutions.push({
          executionNumber: i + 1,
          scheduledDate: date,
          status: 'upcoming',
        });
      }
    }

    return { pastExecutions, upcomingExecutions, totalCompleted };
  };

  const formatRecurrencePattern = (rwo: RecurringWorkOrder | null) => {
    if (!rwo) return 'Unknown pattern';
    const label = (rwo as any).recurrencePatternLabel;
    // If any known label is stored (including DAILY), display it directly
    if (label && ['DAILY', 'SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-MONTHLY', 'BI-WEEKLY'].includes(label)) return label;
    // If an unknown label string exists, still display it
    if (label && typeof label === 'string') return label;
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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!recurringWorkOrder) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Recurring work order not found</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{recurringWorkOrder.title}</h1>
              <p className="text-muted-foreground mt-2">{recurringWorkOrder.workOrderNumber}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/admin-portal/recurring-work-orders/${recurringWorkOrder.id}/edit`)}
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            {recurringWorkOrder.status === 'active' && (
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={handleExecuteNow}
                loading={submitting} disabled={submitting}
              >
                <Zap className="h-4 w-4 mr-2" />
                Execute Next Iteration
              </Button>
            )}
            {recurringWorkOrder.status === 'active' && (
              <Button
                variant="outline"
                onClick={handleToggleStatus}
                loading={submitting} disabled={submitting}
              >
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            {recurringWorkOrder.status === 'paused' && (
              <Button
                onClick={handleToggleStatus}
                loading={submitting} disabled={submitting}
              >
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            )}
            {recurringWorkOrder.status !== 'cancelled' && (
              <Button
                variant="destructive"
                onClick={handleCancel}
                loading={submitting} disabled={submitting}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Basic Information */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5" />
                  Recurring Work Order Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-semibold">Status:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${getStatusColor(recurringWorkOrder.status)}`}>
                      {(recurringWorkOrder.status || 'unknown').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold">Priority:</span>
                    <span className="ml-2 px-2 py-1 rounded text-xs font-semibold bg-orange-50 text-orange-600">
                      {(recurringWorkOrder.priority || 'medium').toUpperCase()}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="font-semibold">Client:</span>
                  <span className="ml-2">{recurringWorkOrder.clientName}</span>
                </div>

                <div>
                  <span className="font-semibold">Location:</span>
                  <span className="ml-2">{recurringWorkOrder.locationName}</span>
                  {recurringWorkOrder.locationAddress && (
                    <div className="text-sm text-muted-foreground mt-1">{formatAddress(recurringWorkOrder.locationAddress)}</div>
                  )}
                </div>

                <div>
                  <span className="font-semibold">Category:</span>
                  <span className="ml-2">{recurringWorkOrder.category}</span>
                </div>

                {(recurringWorkOrder as any).subcontractorName && (
                  <div>
                    <span className="font-semibold">Assigned Subcontractor:</span>
                    <span className="ml-2">{(recurringWorkOrder as any).subcontractorName}</span>
                  </div>
                )}

                {recurringWorkOrder.estimateBudget && (
                  <div>
                    <span className="font-semibold">Estimate Budget:</span>
                    <span className="ml-2">${recurringWorkOrder.estimateBudget.toLocaleString()}</span>
                  </div>
                )}

                <div>
                  <span className="font-semibold">Description:</span>
                  <p className="mt-1 text-foreground">{recurringWorkOrder.description}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Recurrence Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="font-semibold">Pattern:</span>
                  <span className="ml-2">{formatRecurrencePattern(recurringWorkOrder)}</span>
                </div>

                {(() => {
                  const p = recurringWorkOrder.recurrencePattern as any;
                  const startDate = toSafeDate(p?.startDate);
                  const endDate = toSafeDate(p?.endDate);
                  return (
                    <>
                      {startDate && (
                        <div>
                          <span className="font-semibold">Starting Date:</span>
                          <span className="ml-2">{startDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                      )}
                      {endDate && (
                        <div>
                          <span className="font-semibold">Ending Date:</span>
                          <span className="ml-2">{endDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Compute stats from actual execution records */}
                {(() => {
                  const doneExecs = executions.filter(e => e.status === 'executed' || !!(e as any).workOrderId);
                  const failedExecs = executions.filter(e => e.status === 'failed');
                  const totalDone = doneExecs.length;
                  const totalFailed = failedExecs.length;

                  // Last execution: most recent completed execution by scheduled date
                  const lastDone = doneExecs
                    .map(e => toSafeDate(e.scheduledDate) || toSafeDate(e.executedDate))
                    .filter(Boolean)
                    .sort((a, b) => b!.getTime() - a!.getTime())[0];

                  // Next execution: compute from pattern
                  const { mode, interval, daysOfWeek } = resolveInterval(recurringWorkOrder);
                  const pattern = recurringWorkOrder.recurrencePattern as any;
                  const patternStartDate = toSafeDate(pattern?.startDate);
                  const patternEndDate = toSafeDate(pattern?.endDate);
                  const firstService = recurringWorkOrder.nextServiceDates?.[0] ? toSafeDate(recurringWorkOrder.nextServiceDates[0]) : null;
                  const anchor = patternStartDate ?? firstService ?? (recurringWorkOrder.createdAt ? new Date(recurringWorkOrder.createdAt) : new Date());
                  anchor.setHours(9, 0, 0, 0);

                  const doneDateSet = new Set(doneExecs.map(e => {
                    const d = toSafeDate(e.scheduledDate);
                    return d ? d.toDateString() : '';
                  }).filter(Boolean));

                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  let nextDate: Date | null = null;
                  const cursor = new Date(anchor);
                  if (mode === 'daily') {
                    const hasDaysFilter = Array.isArray(daysOfWeek) && daysOfWeek.length > 0;
                    for (let i = 0; i < 730; i++) {
                      if (patternEndDate && cursor > patternEndDate) break;
                      if (cursor >= today && (!hasDaysFilter || daysOfWeek!.includes(cursor.getDay())) && !doneDateSet.has(cursor.toDateString())) {
                        nextDate = new Date(cursor); break;
                      }
                      cursor.setDate(cursor.getDate() + 1);
                    }
                  } else if (mode === 'weekly') {
                    for (let i = 0; i < 200; i++) {
                      if (patternEndDate && cursor > patternEndDate) break;
                      if (cursor >= today && !doneDateSet.has(cursor.toDateString())) { nextDate = new Date(cursor); break; }
                      cursor.setDate(cursor.getDate() + interval * 7);
                    }
                  } else {
                    for (let i = 0; i < 200; i++) {
                      if (patternEndDate && cursor > patternEndDate) break;
                      if (cursor >= today && !doneDateSet.has(cursor.toDateString())) { nextDate = new Date(cursor); break; }
                      cursor.setMonth(cursor.getMonth() + interval);
                    }
                  }

                  return (
                    <>
                      <div>
                        <span className="font-semibold">Next Execution:</span>
                        <span className="ml-2">
                          {nextDate ? nextDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled'}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Last Execution:</span>
                        <span className="ml-2">
                          {lastDone ? lastDone.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Total Executions:</span>
                        <span className="ml-2">{totalDone + totalFailed}</span>
                      </div>
                      <div>
                        <span className="font-semibold">Successful Executions:</span>
                        <span className="ml-2 text-green-600">{totalDone}</span>
                      </div>
                      <div>
                        <span className="font-semibold">Failed Executions:</span>
                        <span className="ml-2 text-red-600">{totalFailed}</span>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Execution Progress */}
            {(() => {
              const { pastExecutions, upcomingExecutions, totalCompleted } = buildExecutionTimeline(recurringWorkOrder);
              const totalScheduled = pastExecutions.length + upcomingExecutions.length;
              const progressPercent = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;
              const pattern = recurringWorkOrder.recurrencePattern as any;
              const endDate = toSafeDate(pattern?.endDate);
              const next5Upcoming = upcomingExecutions.slice(0, 5);
              const todayStr = new Date().toDateString();

              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Execution Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">
                          {totalCompleted} of {totalScheduled} executions completed
                        </span>
                        <span className="text-muted-foreground">{progressPercent}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-green-500 to-green-400"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Completed ({totalCompleted})
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Pending ({pastExecutions.filter(e => e.status === 'pending').length})
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Upcoming ({upcomingExecutions.length})
                        </span>
                        {pastExecutions.filter(e => e.status === 'failed').length > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Failed ({pastExecutions.filter(e => e.status === 'failed').length})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Past Executions */}
                    {pastExecutions.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground">Past Executions</h4>
                        {pastExecutions.map((slot) => (
                          <div
                            key={slot.executionNumber}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              slot.status === 'completed'
                                ? 'bg-green-50 border-green-200'
                                : slot.status === 'failed'
                                ? 'bg-red-50 border-red-200'
                                : 'bg-yellow-50 border-yellow-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                slot.status === 'completed' ? 'bg-green-500'
                                : slot.status === 'failed' ? 'bg-red-500'
                                : 'bg-yellow-500'
                              }`} />
                              <div>
                                <div className="font-semibold text-sm flex items-center gap-2">
                                  Execution #{slot.executionNumber}
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                    slot.status === 'completed' ? 'bg-green-100 text-green-700'
                                    : slot.status === 'failed' ? 'bg-red-100 text-red-700'
                                    : 'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {slot.status}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {slot.scheduledDate.toLocaleDateString('en-US', {
                                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                                  })}
                                  {slot.execution?.executedDate && (
                                    <span className="ml-1">
                                      — Executed {new Date(slot.execution.executedDate).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {slot.execution?.workOrderId ? (
                                <Button
                                  variant="link"
                                  size="sm"
                                  onClick={() => window.open(`/admin-portal/work-orders/${slot.execution!.workOrderId}`, '_blank')}
                                  className="text-xs"
                                >
                                  View Work Order <ExternalLink className="h-3 w-3 ml-1" />
                                </Button>
                              ) : slot.execution ? (
                                <Button
                                  size="sm"
                                  onClick={() => handleGenerateWorkOrder(slot.execution!.id, slot.execution!.executionNumber)}
                                  disabled={submitting}
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                                >
                                  Generate Work Order
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleInitializeExecution(slot.scheduledDate, slot.executionNumber - 1)}
                                  disabled={submitting}
                                  className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs"
                                >
                                  Execute Now
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Next 5 Upcoming Executions */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        Upcoming Executions (Next {Math.min(5, next5Upcoming.length)})
                      </h4>
                      {next5Upcoming.length === 0 ? (
                        <div className="text-center py-4">
                          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-muted-foreground text-sm">
                            {endDate && endDate < new Date()
                              ? 'This recurring work order has passed its end date.'
                              : 'No upcoming executions. Check the recurrence pattern and start date.'}
                          </p>
                        </div>
                      ) : (
                        next5Upcoming.map((slot, idx) => {
                          const isToday = slot.scheduledDate.toDateString() === todayStr;
                          const isNext = idx === 0;
                          return (
                            <div
                              key={slot.executionNumber}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                isToday
                                  ? 'bg-blue-50 border-blue-300'
                                  : isNext
                                  ? 'bg-indigo-50 border-indigo-200'
                                  : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  isToday ? 'bg-blue-500' : isNext ? 'bg-indigo-500' : 'bg-gray-400'
                                }`} />
                                <div>
                                  <div className="font-semibold text-sm">
                                    Execution #{slot.executionNumber}
                                    {isToday && <span className="ml-2 text-blue-600 text-xs font-normal">(Today)</span>}
                                    {isNext && !isToday && <span className="ml-2 text-indigo-600 text-xs font-normal">(Next)</span>}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {slot.scheduledDate.toLocaleDateString('en-US', {
                                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                                    })}
                                  </div>
                                </div>
                              </div>
                              {slot.execution ? (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-yellow-100 text-yellow-700`}>
                                  Pending
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Scheduled</span>
                              )}
                            </div>
                          );
                        })
                      )}
                      {upcomingExecutions.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center pt-1">
                          + {upcomingExecutions.length - 5} more upcoming execution(s)
                        </p>
                      )}
                      {endDate && (
                        <p className="text-xs text-muted-foreground pt-1">
                          Recurrence ends on {endDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {recurringWorkOrder.invoiceSchedule && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Invoice Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="font-semibold">Invoice Pattern:</span>
                    <span className="ml-2">
                      Every {recurringWorkOrder.invoiceSchedule.interval} {recurringWorkOrder.invoiceSchedule.type}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold">Invoice Time:</span>
                    <span className="ml-2">{recurringWorkOrder.invoiceSchedule.time} {recurringWorkOrder.invoiceSchedule.timezone}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Timeline – same level of detail as regular work orders */}
          <div className="space-y-4">
            <WorkOrderSystemInfo
              timeline={buildTimeline(recurringWorkOrder)}
              systemInformation={buildSystemInformation(recurringWorkOrder)}
              viewerRole="admin"
              creationSourceLabel={getCreationSourceLabel(recurringWorkOrder)}
            />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  System Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="font-semibold">Last Updated:</span>
                  <div className="text-sm text-muted-foreground mt-1">
                    {new Date(recurringWorkOrder.updatedAt).toLocaleDateString()} at {new Date(recurringWorkOrder.updatedAt).toLocaleTimeString()}
                  </div>
                </div>

                {(() => {
                  const done = executions.filter(e => e.status === 'executed' || !!(e as any).workOrderId).length;
                  const failed = executions.filter(e => e.status === 'failed').length;
                  const total = done + failed;
                  return (
                    <div>
                      <span className="font-semibold">Success Rate:</span>
                      <div className="text-sm text-muted-foreground mt-1">
                        {total > 0 ? Math.round((done / total) * 100) : 0}%
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Execution History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Execution History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {executions.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No executions yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {executions.map((execution) => (
                  <div key={execution.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Execution #{execution.executionNumber}</span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getExecutionStatusColor(execution.status)}`}>
                          {(execution.status || 'unknown').toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Scheduled: {new Date(execution.scheduledDate).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="font-semibold">Executed:</span>
                        <span className="ml-2">
                          {execution.executedDate ? new Date(execution.executedDate).toLocaleDateString() : 'Not executed'}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Email Sent:</span>
                        <span className="ml-2">
                          {execution.emailSent ? 'Yes' : 'No'}
                          {execution.emailSentAt && (
                            <div className="text-xs text-muted-foreground">
                              {new Date(execution.emailSentAt).toLocaleDateString()}
                            </div>
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Work Order:</span>
                        <span className="ml-2">
                          {execution.workOrderId ? (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => window.open(`/admin-portal/work-orders/${execution.workOrderId}`, '_blank')}
                            >
                              View <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleGenerateWorkOrder(execution.id, execution.executionNumber)}
                              disabled={submitting}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                            >
                              Generate Work Order
                            </Button>
                          )}
                        </span>
                      </div>
                    </div>

                    {execution.failureReason && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        <span className="font-semibold">Failure Reason:</span> {execution.failureReason}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      {execution.workOrderPdfUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(execution.workOrderPdfUrl, '_blank')}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Work Order PDF
                        </Button>
                      )}
                      {execution.invoicePdfUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(execution.invoicePdfUrl, '_blank')}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Invoice PDF
                        </Button>
                      )}
                      {execution.stripePaymentLink && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(execution.stripePaymentLink, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Payment Link
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
