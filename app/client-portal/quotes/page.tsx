'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Check, X, Calendar, DollarSign, Search } from 'lucide-react';
import { toast } from 'sonner';

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
      description: 'This will mark the work order as ready for subcontractor assignment.',
      action: {
        label: 'Approve',
        onClick: async () => {
          try {
            // Update quote status
            await updateDoc(doc(db, 'quotes', quoteId), {
              status: 'accepted',
              acceptedAt: new Date(),
            });

            // Find the quote to get work order ID
            const quote = quotes.find(q => q.id === quoteId);
            if (quote && quote.workOrderId) {
              // Update work order status to "to_be_started"
              await updateDoc(doc(db, 'workOrders', quote.workOrderId), {
                status: 'to_be_started',
                updatedAt: serverTimestamp(),
              });
            } else {
              console.warn('Quote does not have associated work order ID:', quoteId);
              toast.error('Quote does not have an associated work order');
              return;
            }

            toast.success('Quote approved successfully! Work order is now ready to be assigned to a subcontractor.');
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
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Quotes</h1>
          <p className="text-gray-600 mt-2">Review and approve quotes from contractors</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                filter === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label} ({option.count})
            </button>
          ))}
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-600">Total Amount</p>
                        <p className="text-2xl font-bold text-gray-900">
                          ${(quote.clientAmount || quote.totalAmount).toLocaleString()}
                        </p>
                        {quote.markupPercentage && (
                          <p className="text-xs text-gray-500">
                            Includes {quote.markupPercentage}% markup
                          </p>
                        )}
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

                  {(quote.laborCost > 0 || quote.materialCost > 0 || quote.taxAmount > 0) && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-gray-900 mb-3">Cost Breakdown</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        {quote.laborCost > 0 && (
                          <div>
                            <p className="text-gray-600">Labor Cost</p>
                            <p className="font-semibold">${quote.laborCost.toLocaleString()}</p>
                          </div>
                        )}
                        {quote.materialCost > 0 && (
                          <div>
                            <p className="text-gray-600">Material Cost</p>
                            <p className="font-semibold">${quote.materialCost.toLocaleString()}</p>
                          </div>
                        )}
                        {quote.taxAmount > 0 && (
                          <div>
                            <p className="text-gray-600">Tax ({quote.taxRate}%)</p>
                            <p className="font-semibold">${quote.taxAmount.toLocaleString()}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-gray-600">Subtotal</p>
                          <p className="font-semibold">${quote.totalAmount.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  )}

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

                  {quote.status === 'sent_to_client' && (
                    <div className="flex gap-3 pt-4">
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
