'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, serverTimestamp, addDoc, getDoc, getDocs, Timestamp } from 'firebase/firestore';
import type { QuoteTimelineEvent } from '@/types';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
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
  timeline?: QuoteTimelineEvent[];
  systemInformation?: { createdBy?: { name: string }; sentToClientBy?: { name: string }; acceptedBy?: { id: string; name: string; timestamp: any }; rejectedBy?: { id: string; name: string; timestamp: any; reason?: string } };
}

export default function ClientQuotes() {
  const { auth, db } = useFirebaseInstance();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'comparison'>('list');
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [assignedLocations, setAssignedLocations] = useState<string[]>([]);

  useEffect(() => {
    let unsubscribeQuotes: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubscribeQuotes?.();

      if (!user) {
        setQuotes([]);
        setAssignedLocations([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch client's assigned locations
        const clientDoc = await getDoc(doc(db, 'clients', user.uid));
        const clientData = clientDoc.data();
        const clientAssignedLocations = clientData?.assignedLocations || [];
        setAssignedLocations(clientAssignedLocations);

        const quotesQuery = query(
          collection(db, 'quotes'),
          where('clientId', '==', user.uid),
          where('status', 'in', ['sent_to_client', 'accepted', 'rejected']),
          orderBy('createdAt', 'desc')
        );

        unsubscribeQuotes = onSnapshot(
          quotesQuery,
          async (snapshot) => {
            const quotesData = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
            })) as Quote[];

            if (clientAssignedLocations.length > 0) {
              const workOrderIds = quotesData.map(q => q.workOrderId).filter(Boolean) as string[];
              const workOrdersMap = new Map<string, any>();

              if (workOrderIds.length > 0) {
                const batchSize = 10;
                for (let i = 0; i < workOrderIds.length; i += batchSize) {
                  const batch = workOrderIds.slice(i, i + batchSize);
                  const workOrdersQuery = query(
                    collection(db, 'workOrders'),
                    where('__name__', 'in', batch)
                  );
                  const workOrdersSnapshot = await getDocs(workOrdersQuery);
                  workOrdersSnapshot.docs.forEach(doc => {
                    workOrdersMap.set(doc.id, doc.data());
                  });
                }
              }

              const filteredQuotes = quotesData.filter(quote => {
                if (!quote.workOrderId) return true;
                const workOrder = workOrdersMap.get(quote.workOrderId);
                if (!workOrder) return true;
                return clientAssignedLocations.includes(workOrder.locationId);
              });

              setQuotes(filteredQuotes);
            } else {
              setQuotes(quotesData);
            }

            setLoading(false);
          },
          (error) => {
            console.error('Error fetching quotes:', error);
            setLoading(false);
            toast.error('Failed to load quotes. Please refresh the page or contact support if the issue persists.');
          }
        );
      } catch (error) {
        console.error('Error setting up quotes listener:', error);
        setLoading(false);
        toast.error('Failed to load quotes. Please refresh the page.');
      }
    });

    return () => {
      unsubscribeQuotes?.();
      unsubscribeAuth();
    };
  }, [auth, db]);

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

            const user = auth.currentUser;
            let clientName = quote.clientName || 'Client';
            if (user) {
              const clientDoc = await getDoc(doc(db, 'clients', user.uid));
              if (clientDoc.exists()) clientName = clientDoc.data().fullName || clientName;
            }

            const existingQuoteTimeline = (quote.timeline || []) as QuoteTimelineEvent[];
            const existingQuoteSysInfo = quote.systemInformation || {};
            const acceptedEvent = createQuoteTimelineEvent({
              type: 'accepted',
              userId: user?.uid || 'unknown',
              userName: clientName,
              userRole: 'client',
              details: `Quote approved by ${clientName}. Work order assigned to ${quote.subcontractorName}.`,
              metadata: quote.workOrderNumber ? { workOrderNumber: quote.workOrderNumber } : undefined,
            });
            await updateDoc(doc(db, 'quotes', quoteId), {
              status: 'accepted',
              acceptedAt: serverTimestamp(),
              timeline: [...existingQuoteTimeline, acceptedEvent],
              systemInformation: {
                ...existingQuoteSysInfo,
                acceptedBy: {
                  id: user?.uid || 'unknown',
                  name: clientName,
                  timestamp: Timestamp.now(),
                },
              },
              updatedAt: serverTimestamp(),
            });

            // AUTO-ASSIGN: Create assigned job record
            await addDoc(collection(db, 'assignedJobs'), {
              workOrderId: quote.workOrderId,
              subcontractorId: quote.subcontractorId,
              assignedAt: serverTimestamp(),
              status: 'pending_acceptance',
            });

            const existingTimeline = workOrderData?.timeline || [];
            const existingSysInfo = workOrderData?.systemInformation || {};

            // Update work order status, assignment, and approved quote pricing
            await updateDoc(doc(db, 'workOrders', quote.workOrderId), {
              status: 'assigned',
              assignedSubcontractor: quote.subcontractorId,
              assignedSubcontractorName: quote.subcontractorName,
              assignedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              approvedQuoteId: quoteId,
              approvedQuoteAmount: quote.clientAmount || quote.totalAmount,
              approvedQuoteLaborCost: quote.laborCost,
              approvedQuoteMaterialCost: quote.materialCost,
              approvedQuoteLineItems: quote.lineItems || [],
              timeline: [...existingTimeline, createTimelineEvent({
                type: 'quote_approved_by_client',
                userId: user?.uid || 'unknown',
                userName: clientName,
                userRole: 'client',
                details: `Quote from ${quote.subcontractorName} approved by ${clientName}. Work order assigned.`,
                metadata: { quoteId, subcontractorName: quote.subcontractorName, amount: quote.clientAmount || quote.totalAmount },
              })],
              systemInformation: {
                ...existingSysInfo,
                quoteApprovalByClient: {
                  quoteId,
                  approvedBy: { id: user?.uid || 'unknown', name: clientName },
                  timestamp: Timestamp.now(),
                },
              },
            });

            // Notify subcontractor of assignment (in-app notification)
            await notifySubcontractorAssignment(
              quote.subcontractorId,
              quote.workOrderId,
              workOrderData.workOrderNumber || quote.workOrderId
            );

            // Send email notification to subcontractor
            try {
              await fetch('/api/email/send-assignment', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  toEmail: quote.subcontractorEmail,
                  toName: quote.subcontractorName,
                  workOrderNumber: workOrderData.workOrderNumber || quote.workOrderId,
                  workOrderTitle: quote.workOrderTitle,
                  clientName: quote.clientName,
                  locationName: workOrderData.locationName,
                  locationAddress: workOrderData.locationAddress,
                }),
              });
            } catch (emailError) {
              console.error('Failed to send assignment email:', emailError);
              // Don't fail the whole operation if email fails
            }

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
            const user = auth.currentUser;
            let clientName = quote.clientName || 'Client';
            if (user) {
              const clientDoc = await getDoc(doc(db, 'clients', user.uid));
              if (clientDoc.exists()) clientName = clientDoc.data().fullName || clientName;
            }

            const existingQuoteTimeline = (quote.timeline || []) as QuoteTimelineEvent[];
            const existingQuoteSysInfo = quote.systemInformation || {};
            const rejectedEvent = createQuoteTimelineEvent({
              type: 'rejected',
              userId: user?.uid || 'unknown',
              userName: clientName,
              userRole: 'client',
              details: `Quote from ${quote.subcontractorName} rejected by ${clientName}${reason ? `. Reason: ${reason}` : ''}`,
              metadata: { reason: reason || '' },
            });
            await updateDoc(doc(db, 'quotes', quoteId), {
              status: 'rejected',
              rejectedAt: serverTimestamp(),
              rejectionReason: reason || 'No reason provided',
              timeline: [...existingQuoteTimeline, rejectedEvent],
              systemInformation: {
                ...existingQuoteSysInfo,
                rejectedBy: {
                  id: user?.uid || 'unknown',
                  name: clientName,
                  timestamp: Timestamp.now(),
                  reason: reason || undefined,
                },
              },
              updatedAt: serverTimestamp(),
            });

            // Add timeline event to work order
            if (quote.workOrderId) {
              const woDoc = await getDoc(doc(db, 'workOrders', quote.workOrderId));
              const woData = woDoc.data();
              const existingTimeline = woData?.timeline || [];

              await updateDoc(doc(db, 'workOrders', quote.workOrderId), {
                timeline: [...existingTimeline, createTimelineEvent({
                  type: 'quote_rejected_by_client',
                  userId: user?.uid || 'unknown',
                  userName: clientName,
                  userRole: 'client',
                  details: `Quote from ${quote.subcontractorName} rejected by ${clientName}${reason ? `. Reason: ${reason}` : ''}`,
                  metadata: { quoteId, subcontractorName: quote.subcontractorName, reason: reason || '' },
                })],
                updatedAt: serverTimestamp(),
              });
            }

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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
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

                  {(quote as any).proposedServiceDate && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-blue-900 mb-1">Proposed Service Schedule</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                              <p className="text-xs text-blue-700">Date</p>
                              <p className="text-sm font-medium text-blue-900">
                                {(quote as any).proposedServiceDate?.toDate?.().toLocaleDateString() ||
                                 new Date((quote as any).proposedServiceDate).toLocaleDateString()}
                              </p>
                            </div>
                            {(quote as any).proposedServiceTime && (
                              <div>
                                <p className="text-xs text-blue-700">Time</p>
                                <p className="text-sm font-medium text-blue-900">
                                  {(quote as any).proposedServiceTime}
                                </p>
                              </div>
                            )}
                          </div>
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
