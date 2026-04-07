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

  // Live countdown to next execution
  const [countdown, setCountdown] = useState('');
  const [nextExecDate, setNextExecDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!recurringWorkOrder || executions === undefined) return;
    // Compute next execution date
    const { upcomingExecutions } = buildExecutionTimeline(recurringWorkOrder);
    const next = upcomingExecutions.length > 0 ? upcomingExecutions[0].scheduledDate : null;
    setNextExecDate(next);
  }, [recurringWorkOrder, executions]);

  useEffect(() => {
    if (!nextExecDate) { setCountdown(''); return; }
    const update = () => {
      const now = new Date();
      const diff = nextExecDate.getTime() - now.getTime();
      if (diff <= 0) { setCountdown('Now'); return; }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);
      setCountdown(parts.join(' '));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [nextExecDate]);

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

      // Compute the actual next upcoming date from the pattern (same as Upcoming Executions display)
      const { upcomingExecutions: upcoming } = buildExecutionTimeline(recurringWorkOrder);
      if (upcoming.length === 0) {
        toast.error('No upcoming executions to execute.');
        return;
      }
      const nextSlot = upcoming[0];

      const response = await fetch('/api/recurring-work-orders/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recurringWorkOrderId: recurringWorkOrder.id,
          scheduledDate: nextSlot.scheduledDate.toISOString(),
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(`Execution #${nextSlot.executionNumber} completed! Work order created.`);
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
   * Labels: SEMIANNUALLY=6mo, QUARTERLY=3mo, BI-MONTHLY=twice/mo, MONTHLY=1mo, BI-WEEKLY=twice/wk, WEEKLY=1wk, DAILY
   */
  const resolveInterval = (rwo: RecurringWorkOrder): { mode: 'daily' | 'weekly' | 'monthly'; interval: number; daysOfWeek?: number[]; daysOfMonth?: number[] } => {
    const label = ((rwo as any).recurrencePatternLabel || '').toUpperCase();
    const pattern = rwo.recurrencePattern as any;
    const daysOfMonth = Array.isArray(pattern?.daysOfMonth) ? pattern.daysOfMonth : (pattern?.dayOfMonth ? [pattern.dayOfMonth] : undefined);

    // Resolve from label first (most reliable)
    switch (label) {
      case 'SEMIANNUALLY': return { mode: 'monthly', interval: 6, daysOfMonth };
      case 'QUARTERLY':    return { mode: 'monthly', interval: 3, daysOfMonth };
      case 'BI-MONTHLY':   return { mode: 'monthly', interval: 1, daysOfMonth }; // twice a month
      case 'MONTHLY':      return { mode: 'monthly', interval: 1, daysOfMonth };
      case 'BI-WEEKLY':    return { mode: 'daily', interval: 1, daysOfWeek: pattern?.daysOfWeek };
      case 'WEEKLY':       return { mode: 'weekly', interval: 1 };
      case 'DAILY':        return { mode: 'daily', interval: 1, daysOfWeek: pattern?.daysOfWeek };
    }

    // Fall back to pattern.type + pattern.interval
    if (pattern?.type === 'weekly') return { mode: 'weekly', interval: pattern.interval || 2 };
    if (pattern?.type === 'monthly') return { mode: 'monthly', interval: pattern.interval || 1, daysOfMonth };
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
    const { mode, interval, daysOfWeek, daysOfMonth } = resolveInterval(rwo);

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
      const hasDaysOfMonth = Array.isArray(daysOfMonth) && daysOfMonth.length > 0;
      const sortedDays = hasDaysOfMonth ? [...daysOfMonth].sort((a, b) => a - b) : [cursor.getDate()];
      let iters = 0;
      // Start from the anchor month
      const monthCursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 9, 0, 0);
      while (results.length < maxDates && iters < 200) {
        for (const dom of sortedDays) {
          const lastDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
          const actualDay = Math.min(dom, lastDay);
          const dt = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), actualDay, 9, 0, 0);
          if (dt < anchor) continue; // skip dates before anchor
          if (endDate && dt > endDate) break;
          if (results.length < maxDates) results.push(dt);
        }
        monthCursor.setMonth(monthCursor.getMonth() + interval);
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
   * Merges pattern-generated dates with actual execution records to handle
   * orphaned executions (created for off-pattern dates by old bugs).
   */
  const buildExecutionTimeline = (rwo: RecurringWorkOrder): {
    pastExecutions: ExecutionSlot[];
    upcomingExecutions: ExecutionSlot[];
    totalCompleted: number;
  } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // Collect ALL completed/done dates from execution records
    const doneExecDates = new Set<string>();
    const allExecByDate = new Map<string, RecurringWorkOrderExecution>();
    for (const exec of executions) {
      const d = toSafeDate(exec.scheduledDate);
      if (!d) continue;
      const key = d.toDateString();
      allExecByDate.set(key, exec);
      const isDone = exec.status === 'executed' || exec.status === 'failed' || !!(exec as any).workOrderId;
      if (isDone) doneExecDates.add(key);
    }

    // Generate pattern dates
    const patternDates = generateAllScheduledDates(rwo);

    // Build a unified set of all relevant dates:
    // 1) Pattern dates
    // 2) Execution record dates not in the pattern (orphaned from old bugs)
    const allDateKeys = new Set<string>();
    const allDates: Date[] = [];
    for (const d of patternDates) {
      const key = d.toDateString();
      if (!allDateKeys.has(key)) { allDateKeys.add(key); allDates.push(d); }
    }
    for (const exec of executions) {
      const d = toSafeDate(exec.scheduledDate);
      if (!d) continue;
      const key = d.toDateString();
      if (!allDateKeys.has(key)) { allDateKeys.add(key); allDates.push(d); }
    }
    // Sort all dates chronologically
    allDates.sort((a, b) => a.getTime() - b.getTime());

    const pastExecutions: ExecutionSlot[] = [];
    const upcomingExecutions: ExecutionSlot[] = [];
    let totalCompleted = 0;
    let seqNum = 0;

    for (const date of allDates) {
      const key = date.toDateString();
      const matchingExec = allExecByDate.get(key);
      const isBeforeToday = date < today; // strictly before today (not including today)
      const isDone = doneExecDates.has(key);

      if (isDone && matchingExec) {
        seqNum++;
        const status: ExecutionStatus = matchingExec.status === 'failed' ? 'failed' : 'completed';
        pastExecutions.push({
          executionNumber: seqNum,
          scheduledDate: date,
          status,
          execution: matchingExec,
        });
        if (status === 'completed') totalCompleted++;
      } else if (isBeforeToday && matchingExec) {
        seqNum++;
        // Past date with a non-done execution record
        pastExecutions.push({
          executionNumber: seqNum,
          scheduledDate: date,
          status: 'completed', // It's in the past with a record — treat as done
          execution: matchingExec,
        });
        totalCompleted++;
      } else if (!isDone && !isBeforeToday) {
        seqNum++;
        // Today or future date, not yet executed — show as upcoming
        upcomingExecutions.push({
          executionNumber: seqNum,
          scheduledDate: date,
          status: 'upcoming',
          ...(matchingExec ? { execution: matchingExec } : {}),
        });
      }
      // Past pattern date with no execution — skip entirely (no seqNum increment)
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

                  const patternEndDate = toSafeDate((recurringWorkOrder.recurrencePattern as any)?.endDate);

                  // Use buildExecutionTimeline for next date (handles orphaned executions)
                  const { upcomingExecutions: statsUpcoming } = buildExecutionTimeline(recurringWorkOrder);
                  const nextDate = statsUpcoming.length > 0 ? statsUpcoming[0].scheduledDate : null;

                  return (
                    <>
                      <div>
                        <span className="font-semibold">Next Execution:</span>
                        <span className="ml-2">
                          {nextDate ? nextDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled'}
                        </span>
                      </div>
                      {countdown && (
                        <div>
                          <span className="font-semibold">Time Left for Next Execution:</span>
                          <span className={`ml-2 font-mono text-sm px-2 py-0.5 rounded ${
                            countdown === 'Now'
                              ? 'bg-green-100 text-green-700 animate-pulse'
                              : 'bg-blue-50 text-blue-700'
                          }`}>
                            {countdown}
                          </span>
                          {patternEndDate && (
                            <span className="text-xs text-muted-foreground ml-2">
                              (ends {patternEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                            </span>
                          )}
                        </div>
                      )}
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
              const next5Upcoming = upcomingExecutions.slice(0, 10);
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
                                  {(slot.execution as any)?.triggeredBy && (
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      (slot.execution as any).triggeredBy === 'cron'
                                        ? 'bg-blue-50 text-blue-600 border border-blue-200'
                                        : 'bg-purple-50 text-purple-600 border border-purple-200'
                                    }`}>
                                      {(slot.execution as any).triggeredBy === 'cron' ? 'Cron' : 'Manual'}
                                    </span>
                                  )}
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
                        Upcoming Executions (Next {Math.min(10, next5Upcoming.length)})
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
                      {upcomingExecutions.length > 10 && (
                        <p className="text-xs text-muted-foreground text-center pt-1">
                          + {upcomingExecutions.length - 10} more upcoming execution(s)
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
                {[...executions]
                  .sort((a, b) => {
                    const aDate = toSafeDate(a.scheduledDate)?.getTime() || 0;
                    const bDate = toSafeDate(b.scheduledDate)?.getTime() || 0;
                    return bDate - aDate; // Most recent first
                  })
                  .map((execution, idx, arr) => {
                  const seqNumber = arr.length - idx; // Sequential: oldest=1, newest=N
                  const hasWorkOrder = !!(execution as any).workOrderId;
                  const displayStatus = (execution.status === 'executed' || hasWorkOrder) ? 'executed'
                    : execution.status === 'failed' ? 'failed'
                    : 'executed'; // If it's in history at all, treat as executed
                  return (
                  <div key={execution.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Execution #{seqNumber}</span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getExecutionStatusColor(displayStatus)}`}>
                          {displayStatus.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Scheduled: {toSafeDate(execution.scheduledDate)?.toLocaleDateString() || 'N/A'}
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
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
