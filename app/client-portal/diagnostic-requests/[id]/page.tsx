'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { createNotification } from '@/lib/notifications';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Stethoscope, Check, X, Calendar, DollarSign, User, FileText, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';

interface DiagnosticQuote {
  id: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle: string;
  workOrderDescription?: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail?: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  totalAmount: number;
  clientAmount?: number;
  diagnosticFee?: number;
  isDiagnosticQuote?: boolean;
  proposedServiceDate?: any;
  proposedServiceTime?: string;
  estimatedDuration?: string;
  notes?: string;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
  sentToClientAt?: any;
  acceptedAt?: any;
  rejectedAt?: any;
  rejectionReason?: string;
  createdAt: any;
  lineItems?: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
}

export default function ClientDiagnosticRequestDetail() {
  const { auth, db } = useFirebaseInstance();
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || '');

  const [quote, setQuote] = useState<DiagnosticQuote | null>(null);
  const [workOrder, setWorkOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    if (!id) return;
    let unsubQuote: (() => void) | null = null;

    const unsub = onAuthStateChanged(auth, async (user) => {
      unsubQuote?.();

      if (!user) {
        setLoading(false);
        router.push('/portal-login');
        return;
      }

      unsubQuote = onSnapshot(doc(db, 'quotes', id), async (snap) => {
        if (!snap.exists()) {
          setQuote(null);
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...snap.data() } as DiagnosticQuote;
        if (data.clientId !== user.uid) {
          toast.error('You do not have access to this request');
          router.push('/client-portal/diagnostic-requests');
          return;
        }
        if (data.isDiagnosticQuote !== true) {
          // Not a diagnostic request — send them to the regular quote view
          router.replace(`/client-portal/quotes/${id}`);
          return;
        }
        setQuote(data);

        if (data.workOrderId) {
          try {
            const woSnap = await getDoc(doc(db, 'workOrders', data.workOrderId));
            if (woSnap.exists()) setWorkOrder(woSnap.data());
          } catch (e) {
            console.error('Failed to load work order:', e);
          }
        }
        setLoading(false);
      });
    });

    return () => {
      unsubQuote?.();
      unsub();
    };
  }, [id, auth, db, router]);

  const handleApprove = async () => {
    if (!quote) return;
    if (!confirm(`Approve diagnostic fee of $${Number(quote.diagnosticFee ?? quote.totalAmount ?? 0).toFixed(2)} for "${quote.workOrderTitle}"?`)) return;
    setActioning(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/quotes/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to approve');
      }
      const result = await res.json();
      const woData = result.workOrderData;
      try {
        await createNotification({
          userId: quote.subcontractorId,
          userRole: 'subcontractor',
          type: 'diagnostic_request',
          title: 'Diagnostic Request Accepted',
          message: `Your Diagnostic Request for WO ${woData.workOrderNumber} was accepted. You can now submit a quote from the Bidding page.`,
          link: `/subcontractor-portal/bidding`,
          referenceId: woData.workOrderId,
          referenceType: 'workOrder',
        });
      } catch (e) {
        console.error('Failed to notify subcontractor:', e);
      }
      toast.success('Diagnostic fee approved');
      router.push('/client-portal/diagnostic-requests');
    } catch (error: any) {
      console.error('Approval failed:', error);
      toast.error(error.message || 'Approval failed');
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async () => {
    if (!quote) return;
    const reason = prompt('Please provide a reason for rejection (optional):');
    if (reason === null) return;
    setActioning(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/quotes/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ quoteId: quote.id, reason: reason || '' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to reject');
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
      router.push('/client-portal/diagnostic-requests');
    } catch (error: any) {
      console.error('Rejection failed:', error);
      toast.error(error.message || 'Rejection failed');
    } finally {
      setActioning(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      </ClientLayout>
    );
  }

  if (!quote) {
    return (
      <ClientLayout>
        <div className="space-y-4 max-w-3xl mx-auto py-12 text-center">
          <p className="text-muted-foreground">Diagnostic request not found.</p>
          <Button variant="outline" onClick={() => router.push('/client-portal/diagnostic-requests')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Diagnostic Requests
          </Button>
        </div>
      </ClientLayout>
    );
  }

  const displayAmount = Number(quote.diagnosticFee ?? quote.clientAmount ?? quote.totalAmount ?? 0);
  const serviceDate = quote.proposedServiceDate?.toDate?.() ?? (quote.proposedServiceDate ? new Date(quote.proposedServiceDate) : null);

  const statusLabels: Record<string, string> = {
    pending: 'Pending',
    sent_to_client: 'Pending Your Review',
    accepted: 'Accepted',
    rejected: 'Rejected',
  };
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    sent_to_client: 'bg-blue-100 text-blue-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  return (
    <ClientLayout>
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => router.push('/client-portal/diagnostic-requests')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[quote.status] || 'bg-muted text-foreground'}`}>
            {statusLabels[quote.status] || quote.status}
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-indigo-600" />
              Diagnostic Request
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Work Order</p>
              <p className="text-lg font-semibold text-foreground">{quote.workOrderTitle}</p>
              {quote.workOrderNumber && <p className="text-sm text-muted-foreground">WO #{quote.workOrderNumber}</p>}
            </div>

            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-6 w-6 text-indigo-700" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Diagnostic Fee</p>
                  <p className="text-3xl font-bold text-indigo-700">${displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-indigo-900">
                This fee covers the subcontractor's inspection visit. Once approved, they'll visit the site
                and submit a repair quote for your review. The final invoice will include both the diagnostic
                fee and the approved repair amount.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Subcontractor</p>
                  <p className="text-sm text-foreground">{quote.subcontractorName}</p>
                </div>
              </div>
              {quote.estimatedDuration && (
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Estimated Duration</p>
                    <p className="text-sm text-foreground">{quote.estimatedDuration}</p>
                  </div>
                </div>
              )}
              {serviceDate && (
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Proposed Service</p>
                    <p className="text-sm text-foreground">
                      {serviceDate.toLocaleDateString()}
                      {quote.proposedServiceTime ? ` at ${quote.proposedServiceTime}` : ''}
                    </p>
                  </div>
                </div>
              )}
              {quote.sentToClientAt && (
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Received</p>
                    <p className="text-sm text-foreground">{quote.sentToClientAt?.toDate?.().toLocaleDateString() || 'N/A'}</p>
                  </div>
                </div>
              )}
            </div>

            {quote.notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Subcontractor Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{quote.notes}</p>
              </div>
            )}

            {quote.status === 'rejected' && quote.rejectionReason && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <span className="font-semibold">Rejection reason: </span>{quote.rejectionReason}
              </div>
            )}
          </CardContent>
        </Card>

        {workOrder && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Work Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {workOrder.category && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Category</p>
                    <p className="text-foreground">{workOrder.category}</p>
                  </div>
                )}
                {workOrder.priority && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Priority</p>
                    <p className="text-foreground capitalize">{workOrder.priority}</p>
                  </div>
                )}
                {workOrder.locationName && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Location</p>
                    <p className="text-foreground">{workOrder.locationName}</p>
                  </div>
                )}
                {workOrder.locationAddress && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Address</p>
                    <p className="text-foreground">
                      {typeof workOrder.locationAddress === 'string'
                        ? workOrder.locationAddress
                        : [workOrder.locationAddress?.street, workOrder.locationAddress?.city, workOrder.locationAddress?.state, workOrder.locationAddress?.zipCode].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
              </div>
              {workOrder.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{workOrder.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {quote.status === 'sent_to_client' && (
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              onClick={handleApprove}
              disabled={actioning}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <Check className="h-4 w-4 mr-2" />
              Approve Diagnostic Fee
            </Button>
            <Button
              onClick={handleReject}
              disabled={actioning}
              variant="outline"
              className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
            >
              <X className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
