'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { QuoteTimelineEvent } from '@/types';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { createNotification } from '@/lib/notifications';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Stethoscope, Check, X, Calendar, DollarSign, Eye } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface DiagnosticQuote {
  id: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail?: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  totalAmount: number;
  clientAmount?: number;
  diagnosticFee?: number;
  markupPercentage?: number;
  isDiagnosticQuote?: boolean;
  proposedServiceDate?: any;
  proposedServiceTime?: string;
  notes?: string;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
  sentToClientAt?: any;
  acceptedAt?: any;
  rejectedAt?: any;
  createdAt: any;
  timeline?: QuoteTimelineEvent[];
  systemInformation?: any;
}

export default function ClientDiagnosticRequests() {
  const { auth, db } = useFirebaseInstance();
  const [quotes, setQuotes] = useState<DiagnosticQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    let unsubscribeQuotes: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubscribeQuotes?.();

      if (!user) {
        setQuotes([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const q = query(collection(db, 'quotes'), where('clientId', '==', user.uid));

      unsubscribeQuotes = onSnapshot(
        q,
        (snapshot) => {
          const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as DiagnosticQuote[];
          const diagnosticsForClient = all
            .filter(qt => qt.isDiagnosticQuote === true && ['sent_to_client', 'accepted', 'rejected'].includes(qt.status))
            .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
          setQuotes(diagnosticsForClient);
          setLoading(false);
        },
        (error) => {
          console.error('Error fetching diagnostic requests:', error);
          setLoading(false);
          toast.error('Failed to load diagnostic requests');
        },
      );
    });

    return () => {
      unsubscribeQuotes?.();
      unsubscribeAuth();
    };
  }, [auth, db]);

  const handleApprove = async (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    toast(`Approve diagnostic fee for "${quote.workOrderTitle}"?`, {
      description: 'This will approve the diagnostic fee and notify the subcontractor to proceed.',
      action: {
        label: 'Approve',
        onClick: async () => {
          try {
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
              throw new Error(err.error || 'Failed to approve diagnostic request');
            }

            const result = await res.json();
            const workOrderData = result.workOrderData;

            // Diagnostic accepted — notify sub (not a full assignment).
            try {
              await createNotification({
                userId: quote.subcontractorId,
                userRole: 'subcontractor',
                type: 'diagnostic_request',
                title: 'Diagnostic Request Accepted',
                message: `Your Diagnostic Request for WO ${workOrderData.workOrderNumber} was accepted. You can now submit a quote from the Bidding page.`,
                link: `/subcontractor-portal/bidding`,
                referenceId: workOrderData.workOrderId,
                referenceType: 'workOrder',
              });
            } catch (e) {
              console.error('Failed to notify subcontractor:', e);
            }

            toast.success('Diagnostic fee approved. Subcontractor has been notified.');
          } catch (error: any) {
            console.error('Error approving diagnostic request:', error);
            toast.error(error.message || 'Failed to approve diagnostic request');
          }
        },
      },
      cancel: { label: 'Cancel', onClick: () => {} },
    });
  };

  const handleReject = async (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    toast(`Reject diagnostic request for "${quote.workOrderTitle}"?`, {
      description: 'Please provide a reason (optional).',
      action: {
        label: 'Reject',
        onClick: async () => {
          const reason = prompt('Please provide a reason for rejection (optional):');
          if (reason === null) return;
          try {
            const idToken = await auth.currentUser?.getIdToken();
            const res = await fetch('/api/quotes/reject', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
              },
              body: JSON.stringify({ quoteId, reason: reason || '' }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || 'Failed to reject diagnostic request');
            }

            try {
              await createNotification({
                userId: quote.subcontractorId,
                userRole: 'subcontractor',
                type: 'diagnostic_request',
                title: 'Diagnostic Request Rejected',
                message: `Your Diagnostic Request for WO ${quote.workOrderNumber || ''} was rejected by the client${reason ? `. Reason: ${reason}` : ''}.`,
                link: `/subcontractor-portal/bidding`,
                referenceId: quote.workOrderId || '',
                referenceType: 'workOrder',
              });
            } catch (e) {
              console.error('Failed to notify subcontractor of rejection:', e);
            }

            toast.success('Diagnostic request rejected');
          } catch (error: any) {
            console.error('Error rejecting diagnostic request:', error);
            toast.error(error.message || 'Failed to reject diagnostic request');
          }
        },
      },
      cancel: { label: 'Cancel', onClick: () => {} },
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      sent_to_client: 'bg-blue-100 text-blue-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-muted text-foreground';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      sent_to_client: 'Pending Review',
      accepted: 'Accepted',
      rejected: 'Rejected',
    };
    return labels[status] || status;
  };

  const filteredQuotes = quotes.filter(q => filter === 'all' ? true : q.status === filter);

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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Diagnostic Requests</h1>
            <p className="text-muted-foreground mt-2">
              Approve the diagnostic fee so a subcontractor can inspect the job and submit a repair quote.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-foreground shrink-0">Filter by Status:</span>
          <SearchableSelect
            className="min-w-[200px]"
            value={filter}
            onValueChange={setFilter}
            options={filterOptions.map(opt => ({ value: opt.value, label: `${opt.label} (${opt.count})` }))}
            placeholder="Filter status..."
            aria-label="Filter diagnostic requests by status"
          />
        </div>

        {filteredQuotes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Stethoscope className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {filter === 'all' ? 'No diagnostic requests yet' : `No ${filter.replace('_', ' ')} requests`}
              </h3>
              <p className="text-muted-foreground text-center">
                {filter === 'all'
                  ? 'Diagnostic requests appear here when a subcontractor submits one and admin forwards it to you.'
                  : 'Try a different filter'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredQuotes.map((quote) => {
              const displayAmount = quote.clientAmount ?? quote.totalAmount ?? quote.diagnosticFee ?? 0;
              return (
                <div key={quote.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground leading-snug line-clamp-2">{quote.workOrderTitle}</p>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(quote.status)}`}>
                      {getStatusLabel(quote.status)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1 text-indigo-700 font-semibold">
                      <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                      Diagnostic Fee
                    </span>
                    <span className="flex items-center gap-1 text-lg font-bold text-foreground">
                      <DollarSign className="h-4 w-4 shrink-0" />
                      {displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {quote.workOrderNumber && <span>WO: {quote.workOrderNumber}</span>}
                    <span>From: {quote.subcontractorName}</span>
                    {quote.sentToClientAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        Received {quote.sentToClientAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </span>
                    )}
                    {quote.proposedServiceDate && (
                      <span className="flex items-center gap-1 text-blue-700">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        Service: {quote.proposedServiceDate?.toDate?.().toLocaleDateString() ||
                          new Date(quote.proposedServiceDate).toLocaleDateString()}
                        {quote.proposedServiceTime && ` at ${quote.proposedServiceTime}`}
                      </span>
                    )}
                  </div>

                  <div className="border-t border-border pt-1 mt-auto flex items-center gap-1">
                    <Link href={`/client-portal/diagnostic-requests/${quote.id}`} className="flex-1">
                      <Button variant="outline" className="w-full h-8 text-xs gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </Button>
                    </Link>
                    {quote.status === 'sent_to_client' && (
                      <>
                        <Button
                          onClick={() => handleApprove(quote.id)}
                          className="h-8 px-2 bg-green-600 hover:bg-green-700"
                          title="Approve Diagnostic Fee"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleReject(quote.id)}
                          className="h-8 px-2 text-red-600 border-red-300 hover:bg-red-50"
                          title="Reject Diagnostic Request"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
