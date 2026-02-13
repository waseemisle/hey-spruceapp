'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, MapPin, Calendar, User, FileText, Image as ImageIcon, DollarSign, MessageSquare, CheckCircle, GitCompare, Edit2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatAddress } from '@/lib/utils';
import CompareQuotesDialog from '@/components/compare-quotes-dialog';
import WorkOrderSystemInfo from '@/components/work-order-system-info';

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  appyRequestor?: string; // APPY Requestor field - stores the requestor from maintenance API requests
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
  assignedTo?: string;
  assignedToName?: string;
  assignedSubcontractor?: string;
  assignedSubcontractorName?: string;
  createdAt: any;
  approvedAt?: any;
  completedAt?: any;
  rejectionReason?: string;
  completionDetails?: string;
  completionNotes?: string;
  completionImages?: string[];
  scheduledServiceDate?: any;
  scheduledServiceTime?: string;
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
  importFileName?: string;
  assignedAt?: any;
  rejectedAt?: any;
  scheduleSharedWithClient?: boolean;
  scheduleSharedAt?: any;
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

export default function ViewWorkOrder() {
  const params = useParams();
  const id = params?.id as string;

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  const [showCompareDialog, setShowCompareDialog] = useState(false);

  useEffect(() => {
    const fetchWorkOrder = async () => {
      if (!id) return;

      try {
        const woDoc = await getDoc(doc(db, 'workOrders', id));
        if (woDoc.exists()) {
          setWorkOrder({ id: woDoc.id, ...woDoc.data() } as WorkOrder);

          // Fetch related quotes
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
      } catch (error) {
        console.error('Error fetching work order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkOrder();
  }, [id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'approved': return 'text-green-600 bg-green-50';
      case 'rejected': return 'text-red-600 bg-red-50';
      case 'bidding': return 'text-blue-600 bg-blue-50';
      case 'quotes_received': return 'text-purple-600 bg-purple-50';
      case 'assigned': return 'text-indigo-600 bg-indigo-50';
      case 'completed': return 'text-emerald-600 bg-emerald-50';
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

  // Helper: get creation details from work order (so Timeline always shows how the WO was created)
  const getCreatedDetails = (wo: WorkOrder) => {
    let createdDetails = 'Work order created';
    const metadata: Record<string, any> = {};
    if (wo.createdViaAPI || wo.isMaintenanceRequestOrder) {
      const parts = ['Work order created from Maintenance Request'];
      if (wo.maintRequestNumber) parts.push(` (${wo.maintRequestNumber})`);
      if (wo.appyRequestor) parts.push(` — Requestor: ${wo.appyRequestor}`);
      createdDetails = parts.join('');
      metadata.source = 'maintenance_request_api';
      if (wo.maintRequestNumber) metadata.maintRequestNumber = wo.maintRequestNumber;
      if (wo.appyRequestor) metadata.requestor = wo.appyRequestor;
    } else if (wo.isFromRecurringWorkOrder) {
      createdDetails = `Work order created from Recurring Work Order${wo.recurringWorkOrderNumber ? ` (${wo.recurringWorkOrderNumber})` : ''}`;
      metadata.source = 'recurring_work_order';
    } else if (wo.importedFromCSV) {
      createdDetails = `Work order created via CSV import${wo.importFileName ? ` (${wo.importFileName})` : ''}`;
      metadata.source = 'csv_import';
    } else {
      createdDetails = 'Work order created via portal';
      metadata.source = 'portal_ui';
    }
    return { createdDetails, metadata };
  };

  // Build a complete timeline: use stored timeline events if available,
  // otherwise synthesize from work order fields (for legacy work orders).
  // Always ensure the "created" event shows how the work order was created.
  const buildTimeline = (wo: WorkOrder) => {
    const toDate = (val: any) => {
      if (!val) return null;
      if (val.toDate) return val.toDate();
      if (val instanceof Date) return val;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };
    const { createdDetails, metadata: createdMetadata } = getCreatedDetails(wo);

    if (wo.timeline && wo.timeline.length > 0) {
      // Enrich the stored "created" event so Timeline always shows creation source
      return wo.timeline.map((event: any) => {
        if (event.type === 'created') {
          return {
            ...event,
            details: createdDetails,
            metadata: { ...(event.metadata || {}), ...createdMetadata },
          };
        }
        return event;
      });
    }

    // Synthesize timeline from existing fields
    const events: any[] = [];

    if (wo.createdAt) {
      events.push({
        id: 'created',
        timestamp: wo.createdAt,
        type: 'created',
        userId: wo.createdBy || 'unknown',
        userName: wo.systemInformation?.createdBy?.name || (wo.createdViaAPI ? 'Automated System' : 'Unknown'),
        userRole: wo.createdViaAPI ? 'system' : 'admin',
        details: createdDetails,
        metadata: createdMetadata,
      });
    }

    if (wo.approvedAt) {
      events.push({
        id: 'approved',
        timestamp: wo.approvedAt,
        type: 'approved',
        userId: wo.approvedBy || 'unknown',
        userName: wo.systemInformation?.approvedBy?.name || 'Unknown',
        userRole: 'admin',
        details: 'Work order approved',
      });
    }

    if (wo.rejectedAt) {
      events.push({
        id: 'rejected',
        timestamp: wo.rejectedAt,
        type: 'rejected',
        userId: 'unknown',
        userName: wo.systemInformation?.rejectedBy?.name || 'Unknown',
        userRole: 'admin',
        details: `Work order rejected${wo.rejectionReason ? `. Reason: ${wo.rejectionReason}` : ''}`,
      });
    }

    if (wo.assignedAt && (wo.assignedToName || wo.assignedSubcontractorName)) {
      events.push({
        id: 'assigned',
        timestamp: wo.assignedAt,
        type: 'assigned',
        userId: 'unknown',
        userName: wo.systemInformation?.assignment?.assignedBy?.name || 'Admin',
        userRole: 'admin',
        details: `Assigned to ${wo.assignedToName || wo.assignedSubcontractorName}`,
      });
    }

    if (wo.scheduledServiceDate && wo.scheduledServiceTime) {
      events.push({
        id: 'schedule_set',
        timestamp: wo.scheduledServiceDate,
        type: 'schedule_set',
        userId: 'unknown',
        userName: wo.assignedToName || wo.assignedSubcontractorName || 'Subcontractor',
        userRole: 'subcontractor',
        details: `Service scheduled for ${toDate(wo.scheduledServiceDate)?.toLocaleDateString() || 'N/A'} at ${wo.scheduledServiceTime}`,
      });
    }

    if (wo.scheduleSharedAt) {
      events.push({
        id: 'schedule_shared',
        timestamp: wo.scheduleSharedAt,
        type: 'schedule_shared',
        userId: 'unknown',
        userName: 'Admin',
        userRole: 'admin',
        details: 'Service schedule shared with client',
      });
    }

    if (wo.completedAt) {
      events.push({
        id: 'completed',
        timestamp: wo.completedAt,
        type: 'completed',
        userId: 'unknown',
        userName: wo.assignedToName || wo.assignedSubcontractorName || 'Subcontractor',
        userRole: 'subcontractor',
        details: 'Work order completed',
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

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!workOrder) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900">Work Order Not Found</h2>
          <Link href="/admin-portal/work-orders">
            <Button className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Work Orders
            </Button>
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin-portal/work-orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{workOrder.title}</h1>
            <p className="text-gray-600 mt-1">Work Order: {workOrder.workOrderNumber}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/admin-portal/work-orders?editId=${workOrder.id}`}>
              <Button size="sm" variant="outline">
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </Link>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(workOrder.status)}`}>
              {workOrder.status.toUpperCase()}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getPriorityColor(workOrder.priority)}`}>
              {workOrder.priority.toUpperCase()}
            </span>
            {(workOrder.status === 'assigned' || workOrder.status === 'accepted_by_subcontractor') && workOrder.assignedSubcontractor && (
              <Link href={`/admin-portal/messages?workOrderId=${workOrder.id}`}>
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
                <CardTitle>Work Order Details</CardTitle>
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

                {workOrder.rejectionReason && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <h3 className="font-semibold text-red-800 mb-2">Rejection Reason</h3>
                    <p className="text-red-700 text-sm">{workOrder.rejectionReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>

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

            {/* Quotes */}
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
                {quotes.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No quotes received yet</p>
                ) : (
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
                                ${(quote.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs text-gray-500 capitalize">{quote.status}</p>
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
                    <Link href={`/admin-portal/quotes?workOrderId=${workOrder.id}`}>
                      <Button variant="outline" className="w-full mt-2">
                        View All Quotes
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Client Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Name</p>
                  <p className="font-semibold">{workOrder.clientName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-semibold">{workOrder.clientEmail}</p>
                </div>
                {workOrder.appyRequestor && (
                  <div>
                    <p className="text-sm text-gray-600">APPY Requestor</p>
                    <p className="font-semibold">{workOrder.appyRequestor}</p>
                  </div>
                )}
              </CardContent>
            </Card>

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
              viewerRole="admin"
            />

            {/* Follow-up Notes - Visible after completion */}
            {workOrder.status === 'completed' && (workOrder.completionDetails || workOrder.completionNotes) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Completion Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {workOrder.completionDetails && (
                    <div>
                      <h3 className="font-semibold text-gray-700 mb-2">Work Completed</h3>
                      <p className="text-gray-600 whitespace-pre-wrap">{workOrder.completionDetails}</p>
                    </div>
                  )}
                  {workOrder.completionNotes && (
                    <div>
                      <h3 className="font-semibold text-gray-700 mb-2">Follow-up Notes</h3>
                      <p className="text-gray-600 whitespace-pre-wrap">{workOrder.completionNotes}</p>
                    </div>
                  )}
                  {(workOrder.assignedSubcontractorName || workOrder.assignedToName) && (
                    <div className="pt-3 border-t">
                      <p className="text-sm text-gray-600">Completed by</p>
                      <p className="font-semibold">{workOrder.assignedSubcontractorName || workOrder.assignedToName}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {workOrder.assignedToName && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Assignment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <p className="text-sm text-gray-600">Assigned To</p>
                    <p className="font-semibold">{workOrder.assignedToName}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Compare Quotes Dialog */}
      <CompareQuotesDialog
        quotes={selectedQuotes}
        isOpen={showCompareDialog}
        onClose={() => setShowCompareDialog(false)}
      />
    </AdminLayout>
  );
}
