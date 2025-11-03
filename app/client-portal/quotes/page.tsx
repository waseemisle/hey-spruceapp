'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, serverTimestamp, addDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { notifySubcontractorAssignment } from '@/lib/notifications';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Check, X, Calendar, DollarSign, Search, Eye, GitCompare } from 'lucide-react';
import QuoteComparison from '@/components/quote-comparison';
import { toast } from 'sonner';
import Link from 'next/link';

interface Quote {
  id: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  laborCost: number;
  materialCost: number;
  additionalCosts: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  originalAmount: number;
  clientAmount?: number;
  markupPercentage?: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  notes?: string;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
  createdAt: any;
  sentToClientAt?: any;
  acceptedAt?: any;
  rejectedAt?: any;
}

export default function ClientQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'comparison'>('list');
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const quotesQuery = query(
      collection(db, 'quotes'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(quotesQuery, (snapshot) => {
      const quotesData = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter(quote =>
          (quote as Quote).clientId === currentUser.uid &&
          ((quote as Quote).status === 'sent_to_client' || (quote as Quote).status === 'accepted' || (quote as Quote).status === 'rejected')
        ) as Quote[];
      setQuotes(quotesData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleApprove = async (quoteId: string) => {
    toast(`Approve quote for "${quotes.find(q => q.id === quoteId)?.workOrderTitle}"?`, {
      description: 'This will automatically assign the work order to the subcontractor.',
      action: {
        label: 'Approve',
        onClick: async () => {
          try {
            const quote = quotes.find(q => q.id === quoteId);
            if (!quote || !quote.workOrderId) {
              toast.error('Quote does not have an associated work order');
              return;
            }

            // Get work order details
            const workOrderDoc = await getDoc(doc(db, 'workOrders', quote.workOrderId));
            if (!workOrderDoc.exists()) {
              toast.error('Work order not found');
              return;
            }
            const workOrderData = workOrderDoc.data();

            // Update quote status
            await updateDoc(doc(db, 'quotes', quoteId), {
              status: 'accepted',
              acceptedAt: serverTimestamp(),
            });

            // AUTO-ASSIGN: Create assigned job record
            await addDoc(collection(db, 'assignedJobs'), {
              workOrderId: quote.workOrderId,
              subcontractorId: quote.subcontractorId,
              assignedAt: serverTimestamp(),
              status: 'pending_acceptance',
            });

            // Update work order status and assignment
            await updateDoc(doc(db, 'workOrders', quote.workOrderId), {
              status: 'assigned',
              assignedSubcontractor: quote.subcontractorId,
              assignedSubcontractorName: quote.subcontractorName,
              assignedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            // Notify subcontractor of assignment
            await notifySubcontractorAssignment(
              quote.subcontractorId,
              quote.workOrderId,
              workOrderData.workOrderNumber || quote.workOrderId
            );

            toast.success('Quote accepted! Work order automatically assigned to subcontractor.');
          } catch (error) {
            console.error('Error approving quote:', error);
            toast.error('Failed to approve quote');
          }
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const handleReject = async (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    toast(`Reject quote for "${quotes.find(q => q.id === quoteId)?.workOrderTitle}"?`, {
      description: 'Please provide a reason for rejection (optional).',
      action: {
        label: 'Reject',
        onClick: async () => {
          const reason = prompt('Please provide a reason for rejection (optional):');
          if (reason === null) return;

          try {
            await updateDoc(doc(db, 'quotes', quoteId), {
              status: 'rejected',
              rejectedAt: serverTimestamp(),
              rejectionReason: reason || 'No reason provided',
            });
            toast.success('Quote rejected successfully!');
          } catch (error) {
            console.error('Error rejecting quote:', error);
            toast.error('Failed to reject quote');
          }
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      sent_to_client: 'bg-blue-100 text-blue-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      sent_to_client: 'Pending Review',
      accepted: 'Accepted',
      rejected: 'Rejected',
    };
    return labels[status as keyof typeof labels] || status;
  };

  const filteredQuotes = quotes.filter(quote => {
    if (filter === 'all') return true;
    return quote.status === filter;
  });

  const filterOptions = [
    { value: 'all', label: 'All', count: quotes.length },
    { value: 'sent_to_client', label: 'Pending Review', count: quotes.filter(q => q.status === 'sent_to_client').length },
    { value: 'accepted', label: 'Accepted', count: quotes.filter(q => q.status === 'accepted').length },
    { value: 'rejected', label: 'Rejected', count: quotes.filter(q => q.status === 'rejected').length },
  ];

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Quotes</h1>
            <p className="text-gray-600 mt-2">Review and approve quotes from contractors</p>
          </div>
          {quotes.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <FileText className="h-4 w-4 mr-2" />
                List View
              </Button>
              <Button
                variant={viewMode === 'comparison' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('comparison')}
              >
                <GitCompare className="h-4 w-4 mr-2" />
                Compare Quotes
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">
            Filter by Status:
          </label>
          <select
            id="status-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {filterOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </div>

        {filteredQuotes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {filter === 'all' ? 'No quotes yet' : `No ${filter} quotes`}
              </h3>
              <p className="text-gray-600 text-center">
                {filter === 'all'
                  ? 'Quotes will appear here once subcontractors submit them and admin forwards them to you.'
                  : 'Try a different filter'}
              </p>
            </CardContent>
          </Card>
        ) : viewMode === 'comparison' ? (
          <div className="space-y-6">
            {/* Group quotes by work order */}
            {(() => {
              const quotesByWorkOrder = filteredQuotes.reduce((acc, quote) => {
                const woId = quote.workOrderId || 'unknown';
                if (!acc[woId]) acc[woId] = [];
                acc[woId].push(quote);
                return acc;
              }, {} as Record<string, Quote[]>);

              return Object.entries(quotesByWorkOrder).map(([workOrderId, workOrderQuotes]) => (
                <Card key={workOrderId}>
                  <CardHeader>
                    <CardTitle>{workOrderQuotes[0].workOrderTitle}</CardTitle>
                    {workOrderQuotes[0].workOrderNumber && (
                      <p className="text-sm text-gray-600 mt-1">WO: {workOrderQuotes[0].workOrderNumber}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <QuoteComparison
                      quotes={workOrderQuotes}
                      workOrderId={workOrderId}
                      onAcceptQuote={handleApprove}
                      onRejectQuote={handleReject}
                    />
                  </CardContent>
                </Card>
              ));
            })()}
          </div>
        ) : (
          <div className="space-y-6">
            {filteredQuotes.map((quote) => (
              <Card key={quote.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl mb-2">{quote.workOrderTitle}</CardTitle>
                      {quote.workOrderNumber && (
                        <p className="text-sm text-gray-600">WO: {quote.workOrderNumber}</p>
                      )}
                      <p className="text-sm text-gray-600">From: {quote.subcontractorName}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBadge(quote.status)}`}>
                      {getStatusLabel(quote.status)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-600">Total Amount</p>
                        <p className="text-2xl font-bold text-gray-900">
                          ${(quote.clientAmount || quote.totalAmount).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Submitted</p>
                        <p className="text-sm font-medium text-gray-900">
                          {quote.sentToClientAt?.toDate?.().toLocaleDateString() || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {quote.lineItems && quote.lineItems.length > 0 && (
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
                            {quote.lineItems.map((item, idx) => (
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

                  {quote.notes && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-gray-900 mb-2">Additional Notes</h4>
                      <p className="text-sm text-gray-700">{quote.notes}</p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4 border-t">
                    <Link href={`/client-portal/quotes/${quote.id}`} className="flex-1">
                      <Button variant="outline" className="w-full">
                        <Eye className="h-4 w-4 mr-2" />
                        View Quote
                      </Button>
                    </Link>
                  </div>

                  {quote.status === 'sent_to_client' && (
                    <div className="flex gap-3 pt-2">
                      <Button
                        onClick={() => handleApprove(quote.id)}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Approve Quote
                      </Button>
                      <Button
                        onClick={() => handleReject(quote.id)}
                        className="flex-1 text-red-600 border-red-600 hover:bg-red-50"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Reject Quote
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
