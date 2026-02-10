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
import { RecurringWorkOrder, RecurringWorkOrderExecution } from '@/types';
import { formatAddress } from '@/lib/utils';

export default function RecurringWorkOrderDetails({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [recurringWorkOrder, setRecurringWorkOrder] = useState<RecurringWorkOrder | null>(null);
  const [executions, setExecutions] = useState<RecurringWorkOrderExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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

  const handleCreateWorkOrders = async () => {
    if (!recurringWorkOrder) return;

    try {
      setSubmitting(true);
      const response = await fetch('/api/recurring-work-orders/create-execution-work-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recurringWorkOrderId: recurringWorkOrder.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create work orders');
      }

      toast.success(data.message || 'Work orders created successfully');

      // Refresh data
      await fetchExecutions();
      await fetchRecurringWorkOrder();
    } catch (error: any) {
      console.error('Error creating work orders:', error);
      toast.error(error.message || 'Failed to create work orders');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteNow = async () => {
    if (!recurringWorkOrder) return;

    try {
      setSubmitting(true);

      // Find the next pending execution (sorted by execution number ascending to get the next one)
      const pendingExecutions = executions
        .filter(exec => exec.status === 'pending')
        .sort((a, b) => a.executionNumber - b.executionNumber);

      if (pendingExecutions.length === 0) {
        toast.error('No pending executions found. Cannot execute next iteration.');
        return;
      }

      const nextExecution = pendingExecutions[0];

      const response = await fetch('/api/recurring-work-orders/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recurringWorkOrderId: recurringWorkOrder.id,
          executionId: nextExecution.id,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success('Next iteration executed successfully! Email sent to client.');
        fetchRecurringWorkOrder();
        fetchExecutions();
      } else {
        toast.error(result.error || 'Failed to execute next iteration');
      }
    } catch (error) {
      console.error('Error executing next iteration:', error);
      toast.error('Failed to execute next iteration');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-50';
      case 'paused': return 'text-yellow-600 bg-yellow-50';
      case 'cancelled': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getExecutionStatusColor = (status: string) => {
    switch (status) {
      case 'executed': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'skipped': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const formatRecurrencePattern = (rwo: RecurringWorkOrder | null) => {
    if (!rwo) return 'Unknown pattern';
    const label = (rwo as any).recurrencePatternLabel;
    if (label && ['SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-MONTHLY', 'BI-WEEKLY'].includes(label)) return label;
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

  if (!recurringWorkOrder) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Recurring work order not found</p>
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
              <h1 className="text-3xl font-bold text-gray-900">{recurringWorkOrder.title}</h1>
              <p className="text-gray-600 mt-2">{recurringWorkOrder.workOrderNumber}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleCreateWorkOrders}
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Create Work Orders for All Executions
            </Button>
            {recurringWorkOrder.status === 'active' && (
              <Button
                onClick={handleExecuteNow}
                disabled={submitting}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Zap className="h-4 w-4 mr-2" />
                Execute Next Iteration Now
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => router.push(`/admin-portal/recurring-work-orders/${recurringWorkOrder.id}/edit`)}
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            {recurringWorkOrder.status === 'active' && (
              <Button
                variant="outline"
                onClick={handleToggleStatus}
                disabled={submitting}
              >
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            {recurringWorkOrder.status === 'paused' && (
              <Button
                onClick={handleToggleStatus}
                disabled={submitting}
              >
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            )}
            {recurringWorkOrder.status !== 'cancelled' && (
              <Button
                variant="destructive"
                onClick={handleCancel}
                disabled={submitting}
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
                      {recurringWorkOrder.status.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold">Priority:</span>
                    <span className="ml-2 px-2 py-1 rounded text-xs font-semibold bg-orange-50 text-orange-600">
                      {recurringWorkOrder.priority.toUpperCase()}
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
                    <div className="text-sm text-gray-600 mt-1">{formatAddress(recurringWorkOrder.locationAddress)}</div>
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
                  <p className="mt-1 text-gray-700">{recurringWorkOrder.description}</p>
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

                <div>
                  <span className="font-semibold">Next Execution:</span>
                  <span className="ml-2">
                    {recurringWorkOrder.nextExecution ? new Date(recurringWorkOrder.nextExecution).toLocaleDateString() : 'Not scheduled'}
                  </span>
                </div>

                <div>
                  <span className="font-semibold">Last Execution:</span>
                  <span className="ml-2">
                    {recurringWorkOrder.lastExecution ? new Date(recurringWorkOrder.lastExecution).toLocaleDateString() : 'Never'}
                  </span>
                </div>

                <div>
                  <span className="font-semibold">Total Executions:</span>
                  <span className="ml-2">{recurringWorkOrder.totalExecutions}</span>
                </div>

                <div>
                  <span className="font-semibold">Successful Executions:</span>
                  <span className="ml-2 text-green-600">{recurringWorkOrder.successfulExecutions}</span>
                </div>

                <div>
                  <span className="font-semibold">Failed Executions:</span>
                  <span className="ml-2 text-red-600">{recurringWorkOrder.failedExecutions}</span>
                </div>
              </CardContent>
            </Card>

            {/* Work Order History Section */}
            {recurringWorkOrder.nextServiceDates && recurringWorkOrder.nextServiceDates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Work Order History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recurringWorkOrder.nextServiceDates
                      .slice(0, 5) // Show next 5 executions
                      .map((date, index) => {
                        const dateObj = date instanceof Date ? date : new Date(date);
                        const isPast = dateObj < new Date();
                        const isToday = dateObj.toDateString() === new Date().toDateString();
                        
                        // Find matching execution for this date
                        const matchingExecution = executions.find(exec => {
                          const execDate = exec.scheduledDate instanceof Date ? exec.scheduledDate : new Date(exec.scheduledDate);
                          return execDate.toDateString() === dateObj.toDateString() || 
                                 Math.abs(execDate.getTime() - dateObj.getTime()) < 24 * 60 * 60 * 1000; // Within 24 hours
                        });
                        
                        return (
                          <div
                            key={index}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              isPast
                                ? 'bg-gray-50 border-gray-200'
                                : isToday
                                ? 'bg-blue-50 border-blue-300'
                                : 'bg-green-50 border-green-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${
                                isPast
                                  ? 'bg-gray-400'
                                  : isToday
                                  ? 'bg-blue-500'
                                  : 'bg-green-500'
                              }`} />
                              <div>
                                <div className="font-semibold text-sm">
                                  Execution #{index + 1}
                                </div>
                                <div className="text-xs text-gray-600">
                                  {dateObj.toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {matchingExecution?.workOrderId ? (
                                <Button
                                  variant="link"
                                  size="sm"
                                  onClick={() => window.open(`/admin-portal/work-orders/${matchingExecution.workOrderId}`, '_blank')}
                                  className="text-xs"
                                >
                                  View Work Order <ExternalLink className="h-3 w-3 ml-1" />
                                </Button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="text-xs text-red-600 font-semibold">
                                    No Work Order
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {isPast
                                      ? '(Past)'
                                      : isToday
                                      ? '(Today)'
                                      : `(${Math.ceil((dateObj.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days away)`}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    {recurringWorkOrder.nextServiceDates.length > 5 && (
                      <div className="text-sm text-gray-500 text-center pt-2">
                        + {recurringWorkOrder.nextServiceDates.length - 5} more execution(s)
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

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
          </div>

          {/* System Information */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  System Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="font-semibold">Created:</span>
                  <div className="text-sm text-gray-600 mt-1">
                    {new Date(recurringWorkOrder.createdAt).toLocaleDateString()} at {new Date(recurringWorkOrder.createdAt).toLocaleTimeString()}
                  </div>
                </div>

                <div>
                  <span className="font-semibold">Last Updated:</span>
                  <div className="text-sm text-gray-600 mt-1">
                    {new Date(recurringWorkOrder.updatedAt).toLocaleDateString()} at {new Date(recurringWorkOrder.updatedAt).toLocaleTimeString()}
                  </div>
                </div>

                <div>
                  <span className="font-semibold">Success Rate:</span>
                  <div className="text-sm text-gray-600 mt-1">
                    {recurringWorkOrder.totalExecutions > 0 
                      ? Math.round((recurringWorkOrder.successfulExecutions / recurringWorkOrder.totalExecutions) * 100)
                      : 0}%
                  </div>
                </div>
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
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No executions yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {executions.map((execution) => (
                  <div key={execution.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Execution #{execution.executionNumber}</span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getExecutionStatusColor(execution.status)}`}>
                          {execution.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
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
                            <div className="text-xs text-gray-500">
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
                          ) : 'Not created'}
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
