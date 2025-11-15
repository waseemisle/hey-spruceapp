'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Calendar, FileText, Image as ImageIcon, AlertCircle, MessageSquare, CheckCircle, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatAddress } from '@/lib/utils';

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
}

export default function ViewClientWorkOrder() {
  const params = useParams();
  const id = params?.id as string;

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWorkOrder = async () => {
      if (!id) return;

      try {
        const woDoc = await getDoc(doc(db, 'workOrders', id));
        if (woDoc.exists()) {
          setWorkOrder({ id: woDoc.id, ...woDoc.data() } as WorkOrder);
        }
      } catch (error) {
        console.error('Error fetching work order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkOrder();
  }, [id]);

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
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBadge(workOrder.status)}`}>
              {workOrder.status}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getPriorityBadge(workOrder.priority)}`}>
              {workOrder.priority} priority
            </span>
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

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Created</p>
                  <p className="font-semibold">
                    {workOrder.createdAt?.toDate?.().toLocaleString() || 'N/A'}
                  </p>
                </div>
                {workOrder.approvedAt && (
                  <div>
                    <p className="text-sm text-gray-600">Approved</p>
                    <p className="font-semibold">
                      {workOrder.approvedAt?.toDate?.().toLocaleString() || 'N/A'}
                    </p>
                  </div>
                )}
                {workOrder.completedAt && (
                  <div>
                    <p className="text-sm text-gray-600">Completed</p>
                    <p className="font-semibold">
                      {workOrder.completedAt?.toDate?.().toLocaleString() || 'N/A'}
                    </p>
                  </div>
                )}
                {workOrder.scheduledServiceDate && workOrder.scheduledServiceTime && (
                  <div>
                    <p className="text-sm text-gray-600">Scheduled Service</p>
                    <p className="font-semibold">
                      {workOrder.scheduledServiceDate?.toDate?.().toLocaleDateString() || 'N/A'} at {workOrder.scheduledServiceTime}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
