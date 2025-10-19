'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Calendar, User, FileText, Image as ImageIcon, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
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
  createdAt: any;
  approvedAt?: any;
  rejectionReason?: string;
}

interface Quote {
  id: string;
  subcontractorName: string;
  totalAmount: number;
  status: string;
  createdAt: any;
}

export default function ViewWorkOrder() {
  const params = useParams();
  const id = params?.id as string;

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

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
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(workOrder.status)}`}>
              {workOrder.status.toUpperCase()}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getPriorityColor(workOrder.priority)}`}>
              {workOrder.priority.toUpperCase()}
            </span>
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
                    {quotes.map((quote) => (
                      <div key={quote.id} className="p-4 border rounded-lg hover:bg-gray-50">
                        <div className="flex justify-between items-start">
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
                            <p className="text-xs text-gray-500 capitalize">{quote.status}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    <Link href={`/admin-portal/quotes?workOrderId=${workOrder.id}`}>
                      <Button className="w-full mt-2">
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
                  <p className="font-semibold">{workOrder.locationAddress}</p>
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
              </CardContent>
            </Card>

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
    </AdminLayout>
  );
}
