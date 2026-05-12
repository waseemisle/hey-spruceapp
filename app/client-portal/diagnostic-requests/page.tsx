'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { QuoteTimelineEvent } from '@/types';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { createNotification } from '@/lib/notifications';
import { formatUsd2 } from '@/lib/format-currency';
import ClientLayout from '@/components/client-layout';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Stethoscope, Check, X, Calendar, Eye } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
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

  /**
   * Pull the most useful error message we can from a failed response.
   * The deployed surface sometimes returns non-JSON 500s from the
   * runtime layer (e.g. when the route file crashes pre-handler) — in
   * that case res.json() throws and the old error toast just said
   * "Failed to approve diagnostic request" with no clue why. This
   * helper reads the body once as text, tries to parse, and falls back
   * to the raw body + status code so the toast actually surfaces the
   * underlying cause.
   */
  const readErrorFromResponse = async (res: Response, fallbackLabel: string) => {
    let raw = '';
    try { raw = await res.text(); } catch { /* swallow */ }
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }
    const apiMsg = parsed?.error || parsed?.message;
    if (apiMsg) return String(apiMsg);
    const cleaned = raw
      .replace(/<!DOCTYPE[^>]*>/i, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) return `${fallbackLabel} (HTTP ${res.status}): ${cleaned.slice(0, 300)}`;
    return `${fallbackLabel} (HTTP ${res.status})`;
  };

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
              const msg = await readErrorFromResponse(res, 'Failed to approve diagnostic request');
              throw new Error(msg);
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
              const msg = await readErrorFromResponse(res, 'Failed to reject diagnostic request');
              throw new Error(msg);
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
        <PageContainer>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        </PageContainer>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <PageContainer>
        <PageHeader
          title="Diagnostic Requests"
          subtitle="Approve the diagnostic fee so a subcontractor can inspect the job and submit a repair quote."
          icon={Stethoscope}
        />

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <span className="text-sm font-medium text-foreground shrink-0">Filter:</span>
          <SearchableSelect
            className="w-full sm:w-auto sm:min-w-[200px]"
            value={filter}
            onValueChange={setFilter}
            options={filterOptions.map(opt => ({ value: opt.value, label: `${opt.label} (${opt.count})` }))}
            placeholder="Filter status..."
            aria-label="Filter diagnostic requests by status"
          />
        </div>

        {filteredQuotes.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title={filter === 'all' ? 'No diagnostic requests yet' : `No ${filter.replace('_', ' ')} requests`}
            subtitle={filter === 'all' ? 'Diagnostic requests appear here when a subcontractor submits one.' : 'Try a different filter'}
          />
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
                      {formatUsd2(displayAmount)}
                    </span>
                    {quote.workOrderNumber && (
                      quote.workOrderId ? (
                        <Link
                          href={`/client-portal/work-orders/${quote.workOrderId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                        >
                          WO: {quote.workOrderNumber}
                        </Link>
                      ) : (
                        <span>WO: {quote.workOrderNumber}</span>
                      )
                    )}
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
                        Diagnostic Service Date Time: {quote.proposedServiceDate?.toDate?.().toLocaleDateString() ||
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
      </PageContainer>
    </ClientLayout>
  );
}
