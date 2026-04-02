'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDoc, getDocs, Timestamp, documentId } from 'firebase/firestore';
import type { QuoteTimelineEvent } from '@/types';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { notifySubcontractorAssignment } from '@/lib/notifications';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
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

        // Avoid compound where+orderBy that requires a composite index.
        // Sort client-side instead.
        const quotesQuery = query(
          collection(db, 'quotes'),
          where('clientId', '==', user.uid)
        );

        unsubscribeQuotes = onSnapshot(
          quotesQuery,
          async (snapshot) => {
            try {
              const allQuotes = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
              })) as Quote[];
              // Filter and sort client-side to avoid composite index requirement
              const quotesData = allQuotes
                .filter(q => ['sent_to_client', 'accepted', 'rejected'].includes(q.status))
                .sort((a, b) => {
                  const aTime = a.createdAt?.toMillis?.() ?? 0;
                  const bTime = b.createdAt?.toMillis?.() ?? 0;
                  return bTime - aTime;
                });

              if (clientAssignedLocations.length > 0) {
                const workOrderIds = quotesData.map(q => q.workOrderId).filter(Boolean) as string[];
                const workOrdersMap = new Map<string, any>();

                if (workOrderIds.length > 0) {
                  const batchSize = 10;
                  for (let i = 0; i < workOrderIds.length; i += batchSize) {
                    const batch = workOrderIds.slice(i, i + batchSize);
                    const workOrdersQuery = query(
                      collection(db, 'workOrders'),
                      where(documentId(), 'in', batch)
                    );
                    try {
                      const workOrdersSnapshot = await getDocs(workOrdersQuery);
                      workOrdersSnapshot.docs.forEach(doc => {
                        workOrdersMap.set(doc.id, doc.data());
                      });
                    } catch {
                      // Permission denied for some work orders — show all quotes for this client
                    }
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
            } catch (err) {
              console.error('Error processing quotes snapshot:', err);
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
            if (!quote) return;

            const idToken = await auth.currentUser?.getIdToken();
            const res = await fetch('/api/quotes/approve', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
              },
              body: JSON.stringify({ quoteId }),
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || 'Failed to approve quote');
            }

            const result = await res.json();
            const workOrderData = result.workOrderData;

            // Notify subcontractor of assignment (best effort)
            try {
              await notifySubcontractorAssignment(
                quote.subcontractorId,
                workOrderData.workOrderId,
                workOrderData.workOrderNumber || workOrderData.workOrderId
              );
            } catch (notifyError) {
              console.error('Failed to create assignment notification:', notifyError);
            }

            // Send email notification to subcontractor
            try {
              await fetch('/api/email/send-assignment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  toEmail: workOrderData.subcontractorEmail,
                  toName: workOrderData.subcontractorName,
                  workOrderNumber: workOrderData.workOrderNumber,
                  workOrderTitle: workOrderData.workOrderTitle,
                  clientName: workOrderData.clientName,
                  locationName: workOrderData.locationName,
                  locationAddress: workOrderData.locationAddress,
                }),
              });
            } catch (emailError) {
              console.error('Failed to send assignment email:', emailError);
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
    return styles[status as keyof typeof styles] || 'bg-muted text-foreground';
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
            <h1 className="text-3xl font-bold text-foreground">Quotes</h1>
            <p className="text-muted-foreground mt-2">Review and approve quotes from contractors</p>
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

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-foreground shrink-0">Filter by Status:</span>
          <SearchableSelect
            className="min-w-[200px]"
            value={filter}
            onValueChange={setFilter}
            options={filterOptions.map((option) => ({
              value: option.value,
              label: `${option.label} (${option.count})`,
            }))}
            placeholder="Filter status..."
            aria-label="Filter quotes by status"
          />
        </div>

        {filteredQuotes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {filter === 'all' ? 'No quotes yet' : `No ${filter} quotes`}
              </h3>
              <p className="text-muted-foreground text-center">
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
                      <p className="text-sm text-muted-foreground mt-1">WO: {workOrderQuotes[0].workOrderNumber}</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredQuotes.map((quote) => (
              <div key={quote.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                {/* Row 1: title + status badge */}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground leading-snug line-clamp-2">{quote.workOrderTitle}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(quote.status)}`}>
                    {getStatusLabel(quote.status)}
                  </span>
                </div>

                {/* Row 2: secondary info */}
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 shrink-0" />
                    ${(quote.clientAmount || quote.totalAmount).toLocaleString()}
                  </span>
                  {quote.workOrderNumber && (
                    <span>WO: {quote.workOrderNumber}</span>
                  )}
                  <span>From: {quote.subcontractorName}</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    {quote.sentToClientAt?.toDate?.().toLocaleDateString() || 'N/A'}
                  </span>
                  {(quote as any).proposedServiceDate && (
                    <span className="flex items-center gap-1 text-blue-700">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      Service: {(quote as any).proposedServiceDate?.toDate?.().toLocaleDateString() ||
                        new Date((quote as any).proposedServiceDate).toLocaleDateString()}
                      {(quote as any).proposedServiceTime && ` at ${(quote as any).proposedServiceTime}`}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="border-t border-border pt-1 mt-auto flex items-center gap-1">
                  <Link href={`/client-portal/quotes/${quote.id}`} className="flex-1">
                    <Button variant="outline" className="w-full h-8 text-xs gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      View Quote
                    </Button>
                  </Link>
                  {quote.status === 'sent_to_client' && (
                    <>
                      <Button
                        onClick={() => handleApprove(quote.id)}
                        className="h-8 px-2 bg-green-600 hover:bg-green-700"
                        title="Approve Quote"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleReject(quote.id)}
                        className="h-8 px-2 text-red-600 border-red-300 hover:bg-red-50"
                        title="Reject Quote"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
