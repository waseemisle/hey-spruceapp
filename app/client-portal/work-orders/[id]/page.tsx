'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { createTimelineEvent } from '@/lib/timeline';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, MapPin, Calendar, FileText, Image as ImageIcon, AlertCircle, MessageSquare, CheckCircle, DollarSign, XCircle, GitCompare } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatAddress } from '@/lib/utils';
import { toast } from 'sonner';
import CompareQuotesDialog from '@/components/compare-quotes-dialog';
import WorkOrderSystemInfo from '@/components/work-order-system-info';

interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
  locationAddress?: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  images?: string[];
  createdAt: any;
  approvedAt?: any;
  completedAt?: any;
  rejectionReason?: string;
  estimateBudget?: number;
  completionDetails?: string;
  completionNotes?: string;
  completionImages?: string[];
  assignedSubcontractor?: string;
  assignedSubcontractorName?: string;
  scheduledServiceDate?: any;
  scheduledServiceTime?: string;
  approvedQuoteId?: string;
  approvedQuoteAmount?: number;
  approvedQuoteLaborCost?: number;
  approvedQuoteMaterialCost?: number;
  approvedQuoteTaxAmount?: number;
  approvedQuoteLineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  timeline?: any[];
  systemInformation?: any;
  // Source tracking fields
  isMaintenanceRequestOrder?: boolean;
  isFromRecurringWorkOrder?: boolean;
  importedFromCSV?: boolean;
  createdViaAPI?: boolean;
  createdBy?: string;
  approvedBy?: string;
  recurringWorkOrderNumber?: string;
  maintRequestNumber?: string;
  appyRequestor?: string;
  importFileName?: string;
  assignedToName?: string;
  assignedAt?: any;
  rejectedAt?: any;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Quote {
  id: string;
  workOrderId: string;
  workOrderNumber: string;
  workOrderTitle: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail: string;
  laborCost: number;
  materialCost: number;
  additionalCosts: number;
  discountAmount: number;
  totalAmount: number;
  originalAmount: number;
  clientAmount?: number;
  markupPercentage?: number;
  lineItems: LineItem[];
  notes?: string;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
  estimatedDuration?: string;
  createdAt: any;
}

export default function ViewClientWorkOrder() {
  const { auth, db } = useFirebaseInstance();
  const params = useParams();
  const id = params?.id as string;

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasApproveRejectPermission, setHasApproveRejectPermission] = useState(false);
  const [hasCompareQuotesPermission, setHasCompareQuotesPermission] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  const [showCompareDialog, setShowCompareDialog] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Fetch client permissions
          const clientDoc = await getDoc(doc(db, 'clients', user.uid));
          const clientData = clientDoc.data();
          const hasApprovePermission = clientData?.permissions?.approveRejectOrder === true;
          const hasComparePermission = clientData?.permissions?.compareQuotes === true;
          setHasApproveRejectPermission(hasApprovePermission);
          setHasCompareQuotesPermission(hasComparePermission);
        } catch (error) {
          console.error('Error fetching client permissions:', error);
        }
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db]);

  useEffect(() => {
    const fetchWorkOrder = async () => {
      if (!id) return;

      try {
        const woDoc = await getDoc(doc(db, 'workOrders', id));
        if (woDoc.exists()) {
          setWorkOrder({ id: woDoc.id, ...woDoc.data() } as WorkOrder);

          // Fetch quotes if client has compareQuotes permission
          if (hasCompareQuotesPermission) {
            const quotesQuery = query(
              collection(db, 'quotes'),
              where('workOrderId', '==', id)
            );
            const quotesSnapshot = await getDocs(quotesQuery);
            const quotesData = quotesSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
            })) as Quote[];
            setQuotes(quotesData);
          }
        }
      } catch (error) {
        console.error('Error fetching work order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkOrder();
  }, [id, db, hasCompareQuotesPermission]);

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      bidding: 'bg-purple-100 text-purple-800',
      assigned: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityBadge = (priority: string) => {
    const styles = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800',
    };
    return styles[priority as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  // Helper: get creation details for every type of work order so Timeline always shows how the WO was created
  const getCreatedDetails = (wo: WorkOrder, existingCreatedEvent?: { details?: string; metadata?: Record<string, unknown> }) => {
    let createdDetails = 'Work order created';
    const creatorName = wo.systemInformation?.createdBy?.name;

    if (wo.createdViaAPI || wo.isMaintenanceRequestOrder) {
      const parts = ['Work order created from Maintenance Request'];
      if (wo.maintRequestNumber) parts.push(` (${wo.maintRequestNumber})`);
      if (wo.appyRequestor) parts.push(` — Requestor: ${wo.appyRequestor}`);
      createdDetails = parts.join('');
    } else if (wo.isFromRecurringWorkOrder) {
      createdDetails = `Work order created from Recurring Work Order${wo.recurringWorkOrderNumber ? ` (${wo.recurringWorkOrderNumber})` : ''}`;
    } else if (wo.importedFromCSV) {
      createdDetails = wo.importFileName ? `Work order created via CSV import (${wo.importFileName})` : 'Work order created via CSV import';
    } else if (wo.systemInformation?.createdBy?.role === 'client') {
      createdDetails = creatorName
        ? `Work order created by ${creatorName} via Client Portal`
        : 'Work order created via Client Portal';
    } else if (wo.systemInformation?.createdBy?.role === 'admin') {
      createdDetails = creatorName
        ? `Work order created by ${creatorName} via Admin Portal`
        : 'Work order created via Admin Portal';
    } else if (wo.systemInformation?.createdBy?.role === 'system') {
      createdDetails = creatorName
        ? `Work order created by ${creatorName} (system)`
        : 'Work order created by system';
    } else if (existingCreatedEvent?.metadata?.source === 'client_portal_ui') {
      createdDetails = existingCreatedEvent.details?.trim() || 'Work order created via Client Portal';
    } else if (existingCreatedEvent?.metadata?.source === 'admin_portal_ui') {
      createdDetails = existingCreatedEvent.details?.trim() || 'Work order created via Admin Portal';
    } else if (existingCreatedEvent?.details?.trim()) {
      createdDetails = existingCreatedEvent.details;
    } else {
      createdDetails = 'Work order created via portal';
    }
    return createdDetails;
  };

  // Build a complete timeline from stored events or synthesize from fields. Always include a "created" event with full details.
  const buildTimeline = (wo: WorkOrder) => {
    const existingCreated = wo.timeline?.find((e: any) => e?.type === 'created');
    const createdDetails = getCreatedDetails(wo, existingCreated);
    const createdEvent = {
      id: 'created',
      timestamp: wo.createdAt ?? null,
      type: 'created',
      userId: 'unknown',
      userName: wo.systemInformation?.createdBy?.name || 'System',
      userRole: 'system' as const,
      details: createdDetails,
    };

    if (wo.timeline && wo.timeline.length > 0) {
      let hasCreated = false;
      const enriched = wo.timeline.map((event: any) => {
        if (event?.type === 'created') {
          hasCreated = true;
          return { ...event, details: createdDetails };
        }
        return event;
      });
      if (!hasCreated) return [createdEvent, ...enriched];
      return enriched;
    }

    const events: any[] = [createdEvent];
    if (wo.approvedAt) {
      events.push({
        id: 'approved', timestamp: wo.approvedAt, type: 'approved',
        userId: 'unknown', userName: wo.systemInformation?.approvedBy?.name || 'Admin',
        userRole: 'admin', details: 'Work order approved',
      });
    }
    if (wo.assignedAt && (wo.assignedToName || wo.assignedSubcontractorName)) {
      events.push({
        id: 'assigned', timestamp: wo.assignedAt, type: 'assigned',
        userId: 'unknown', userName: 'Admin', userRole: 'admin',
        details: `Assigned to ${wo.assignedToName || wo.assignedSubcontractorName}`,
      });
    }
    if (wo.scheduledServiceDate && wo.scheduledServiceTime) {
      const d = wo.scheduledServiceDate?.toDate ? wo.scheduledServiceDate.toDate() : new Date(wo.scheduledServiceDate);
      events.push({
        id: 'schedule_set', timestamp: wo.scheduledServiceDate, type: 'schedule_set',
        userId: 'unknown', userName: wo.assignedToName || wo.assignedSubcontractorName || 'Subcontractor',
        userRole: 'subcontractor', details: `Service scheduled for ${d.toLocaleDateString()} at ${wo.scheduledServiceTime}`,
      });
    }
    if (wo.completedAt) {
      events.push({
        id: 'completed', timestamp: wo.completedAt, type: 'completed',
        userId: 'unknown', userName: wo.assignedToName || wo.assignedSubcontractorName || 'Subcontractor',
        userRole: 'subcontractor', details: 'Work order completed',
      });
    }
    return events;
  };

  const handleQuoteSelection = (quoteId: string, checked: boolean) => {
    if (checked) {
      setSelectedQuoteIds(prev => [...prev, quoteId]);
    } else {
      setSelectedQuoteIds(prev => prev.filter(id => id !== quoteId));
    }
  };

  const handleCompareQuotes = () => {
    if (selectedQuoteIds.length >= 2) {
      setShowCompareDialog(true);
    }
  };

  const selectedQuotes = quotes.filter(q => selectedQuoteIds.includes(q.id));

  const handleApproveWorkOrder = async () => {
    if (!hasApproveRejectPermission) {
      toast.error('You do not have permission to approve work orders');
      return;
    }

    if (!workOrder) return;

    setProcessing(true);
    try {
      const currentUser = auth.currentUser;
      let clientName = workOrder.clientName || 'Client';
      if (currentUser) {
        const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
        if (clientDoc.exists()) {
          clientName = clientDoc.data().fullName || clientName;
        }
      }

      const woDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const woData = woDoc.data();
      const existingTimeline = woData?.timeline || [];
      const existingSysInfo = woData?.systemInformation || {};

      const timelineEvent = createTimelineEvent({
        type: 'approved',
        userId: currentUser?.uid || 'unknown',
        userName: clientName,
        userRole: 'client',
        details: `Work order approved by ${clientName} via Client Portal`,
        metadata: {},
      });

      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: {
          ...existingSysInfo,
          approvedBy: {
            id: currentUser?.uid || 'unknown',
            name: clientName,
            timestamp: Timestamp.now(),
          },
        },
      });
      toast.success('Work order approved successfully');

      // Refresh work order
      const refreshDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      if (refreshDoc.exists()) {
        setWorkOrder({ id: refreshDoc.id, ...refreshDoc.data() } as WorkOrder);
      }
    } catch (error: any) {
      console.error('Error approving work order:', error);
      toast.error(error.message || 'Failed to approve work order');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectWorkOrder = async () => {
    if (!hasApproveRejectPermission) {
      toast.error('You do not have permission to reject work orders');
      return;
    }

    if (!workOrder) return;

    const reason = prompt('Please provide a reason for rejection:');
    if (!reason || reason.trim() === '') {
      toast.error('Rejection reason is required');
      return;
    }

    setProcessing(true);
    try {
      const currentUser = auth.currentUser;
      let clientName = workOrder.clientName || 'Client';
      if (currentUser) {
        const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
        if (clientDoc.exists()) {
          clientName = clientDoc.data().fullName || clientName;
        }
      }

      const woDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      const woData = woDoc.data();
      const existingTimeline = woData?.timeline || [];
      const existingSysInfo = woData?.systemInformation || {};

      const timelineEvent = createTimelineEvent({
        type: 'rejected',
        userId: currentUser?.uid || 'unknown',
        userName: clientName,
        userRole: 'client',
        details: `Work order rejected by ${clientName}. Reason: ${reason.trim()}`,
        metadata: { reason: reason.trim() },
      });

      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'rejected',
        rejectionReason: reason.trim(),
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...existingTimeline, timelineEvent],
        systemInformation: {
          ...existingSysInfo,
          rejectedBy: {
            id: currentUser?.uid || 'unknown',
            name: clientName,
            timestamp: Timestamp.now(),
            reason: reason.trim(),
          },
        },
      });
      toast.success('Work order rejected');

      // Refresh work order
      const refreshDoc = await getDoc(doc(db, 'workOrders', workOrder.id));
      if (refreshDoc.exists()) {
        setWorkOrder({ id: refreshDoc.id, ...refreshDoc.data() } as WorkOrder);
      }
    } catch (error: any) {
      console.error('Error rejecting work order:', error);
      toast.error(error.message || 'Failed to reject work order');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  if (!workOrder) {
    return (
      <ClientLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900">Work Order Not Found</h2>
          <Link href="/client-portal/work-orders">
            <Button className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Work Orders
            </Button>
          </Link>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/client-portal/work-orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{workOrder.title}</h1>
            {workOrder.workOrderNumber && (
              <p className="text-gray-600 mt-1">Work Order: {workOrder.workOrderNumber}</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBadge(workOrder.status)}`}>
              {workOrder.status}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getPriorityBadge(workOrder.priority)}`}>
              {workOrder.priority} priority
            </span>
            {hasApproveRejectPermission && workOrder.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleApproveWorkOrder}
                  disabled={processing}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 border-red-600 hover:border-red-700"
                  onClick={handleRejectWorkOrder}
                  disabled={processing}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </>
            )}
            {(workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor') && workOrder.assignedSubcontractor && (
              <Link href={`/client-portal/messages?workOrderId=${workOrder.id}`}>
                <Button size="sm" variant="outline">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Message Group
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Details */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Work Order Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">Description</h3>
                  <p className="text-gray-600">{workOrder.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-1">Category</h3>
                    <p className="text-gray-600">{workOrder.category}</p>
                  </div>
                  {workOrder.estimateBudget && (
                    <div>
                      <h3 className="font-semibold text-gray-700 mb-1">Estimate Budget</h3>
                      <p className="text-gray-600">${workOrder.estimateBudget.toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {workOrder.status === 'rejected' && workOrder.rejectionReason && (
                  <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-red-800 mb-1">Rejection Reason:</p>
                        <p className="text-xs text-red-700">{workOrder.rejectionReason}</p>
                      </div>
                    </div>
                  </div>
                )}

                {workOrder.status === 'completed' && (workOrder.completionDetails || workOrder.completionNotes) && (
                  <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <h3 className="font-semibold text-green-800">Completion Details</h3>
                    </div>
                    {workOrder.completionDetails && (
                      <div className="mb-3">
                        <h4 className="font-semibold text-gray-700 mb-1 text-sm">Work Completed</h4>
                        <p className="text-gray-600 text-sm whitespace-pre-wrap">{workOrder.completionDetails}</p>
                      </div>
                    )}
                    {workOrder.completionNotes && (
                      <div className="mb-3">
                        <h4 className="font-semibold text-gray-700 mb-1 text-sm">Follow-up Notes</h4>
                        <p className="text-gray-600 text-sm whitespace-pre-wrap">{workOrder.completionNotes}</p>
                      </div>
                    )}
                    {workOrder.assignedSubcontractorName && (
                      <div className="pt-2 border-t border-green-300">
                        <p className="text-xs text-gray-600">Completed by</p>
                        <p className="font-semibold text-sm">{workOrder.assignedSubcontractorName}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Approved Quote Pricing */}
            {workOrder.approvedQuoteAmount && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Approved Quote
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-lg font-semibold text-gray-700">Total Amount</span>
                      <span className="text-3xl font-bold text-green-600">
                        ${workOrder.approvedQuoteAmount.toLocaleString()}
                      </span>
                    </div>

                    {(workOrder.approvedQuoteLaborCost || workOrder.approvedQuoteMaterialCost || workOrder.approvedQuoteTaxAmount) && (
                      <div className="space-y-2 pt-3 border-t border-green-300">
                        {(workOrder.approvedQuoteLaborCost ?? 0) > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Labor Cost</span>
                            <span className="font-medium text-gray-900">
                              ${(workOrder.approvedQuoteLaborCost ?? 0).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {(workOrder.approvedQuoteMaterialCost ?? 0) > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Material Cost</span>
                            <span className="font-medium text-gray-900">
                              ${(workOrder.approvedQuoteMaterialCost ?? 0).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {(workOrder.approvedQuoteTaxAmount ?? 0) > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Tax</span>
                            <span className="font-medium text-gray-900">
                              ${(workOrder.approvedQuoteTaxAmount ?? 0).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {workOrder.approvedQuoteLineItems && workOrder.approvedQuoteLineItems.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-gray-900 mb-3">Line Items</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-gray-700">Description</th>
                              <th className="px-4 py-2 text-center font-semibold text-gray-700">Qty</th>
                              <th className="px-4 py-2 text-right font-semibold text-gray-700">Rate</th>
                              <th className="px-4 py-2 text-right font-semibold text-gray-700">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {workOrder.approvedQuoteLineItems.map((item, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-2">{item.description}</td>
                                <td className="px-4 py-2 text-center">{item.quantity}</td>
                                <td className="px-4 py-2 text-right">${item.unitPrice.toLocaleString()}</td>
                                <td className="px-4 py-2 text-right font-semibold">${item.amount.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {workOrder.assignedSubcontractorName && (
                    <div className="text-sm text-gray-600 pt-3 border-t">
                      <span className="font-semibold">Contractor:</span> {workOrder.assignedSubcontractorName}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Quotes - Only show if client has compareQuotes permission */}
            {hasCompareQuotesPermission && quotes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Quotes
                    </span>
                    <span className="text-sm font-normal text-gray-600">
                      {quotes.length} quote{quotes.length !== 1 ? 's' : ''} received
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {quotes.length >= 2 && (
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          Select 2 or more quotes to compare them side-by-side
                        </p>
                      </div>
                    )}
                    {quotes.map((quote) => (
                      <div key={quote.id} className={`p-4 border rounded-lg hover:bg-gray-50 ${selectedQuoteIds.includes(quote.id) ? 'bg-purple-50 border-purple-300' : ''}`}>
                        <div className="flex items-start gap-3">
                          {quotes.length >= 2 && (
                            <Checkbox
                              checked={selectedQuoteIds.includes(quote.id)}
                              onCheckedChange={(checked) => handleQuoteSelection(quote.id, checked === true)}
                              className="mt-1"
                            />
                          )}
                          <div className="flex-1 flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-gray-900">{quote.subcontractorName}</p>
                              <p className="text-sm text-gray-600">
                                {quote.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-purple-600">
                                ${quote.totalAmount.toLocaleString()}
                              </p>
                              <p className="text-xs text-gray-500 capitalize">{quote.status.replace(/_/g, ' ')}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {quotes.length >= 2 && selectedQuoteIds.length >= 2 && (
                      <Button
                        onClick={handleCompareQuotes}
                        className="w-full"
                      >
                        <GitCompare className="h-4 w-4 mr-2" />
                        Compare {selectedQuoteIds.length} Quotes
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Images */}
            {workOrder.images && workOrder.images.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Images ({workOrder.images.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {workOrder.images.map((image, idx) => (
                      <img
                        key={idx}
                        src={image}
                        alt={`Work order image ${idx + 1}`}
                        className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(image, '_blank')}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Completion Images */}
            {workOrder.status === 'completed' && workOrder.completionImages && workOrder.completionImages.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Completion Images ({workOrder.completionImages.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {workOrder.completionImages.map((image, idx) => (
                      <img
                        key={idx}
                        src={image}
                        alt={`Completion image ${idx + 1}`}
                        className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(image, '_blank')}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Location Name</p>
                  <p className="font-semibold">{workOrder.locationName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Address</p>
                  <p className="font-semibold">{formatAddress(workOrder.locationAddress)}</p>
                </div>
              </CardContent>
            </Card>

            <WorkOrderSystemInfo
              timeline={buildTimeline(workOrder)}
              systemInformation={workOrder.systemInformation}
              viewerRole="client"
              creationSourceLabel={getCreatedDetails(workOrder)}
            />
          </div>
        </div>
      </div>

      {/* Compare Quotes Dialog */}
      <CompareQuotesDialog
        quotes={selectedQuotes}
        isOpen={showCompareDialog}
        onClose={() => setShowCompareDialog(false)}
      />
    </ClientLayout>
  );
}
