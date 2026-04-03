'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { createQuoteTimelineEvent } from '@/lib/timeline';
import { notifySubcontractorAssignment } from '@/lib/notifications';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Check, X, Calendar, DollarSign, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import QuoteSystemInfo from '@/components/quote-system-info';
import type { QuoteTimelineEvent, QuoteSystemInformation } from '@/types';

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
  clientLineItems?: Array<{
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
  proposedServiceDate?: any;
  proposedServiceTime?: string;
  timeline?: QuoteTimelineEvent[];
  systemInformation?: QuoteSystemInformation;
  creationSource?: string;
}

export default function QuoteDetail() {
  const { auth, db } = useFirebaseInstance();
  const params = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [canViewTimeline, setCanViewTimeline] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        router.push('/portal-login');
        return;
      }

      try {
        setLoading(true);
        const quoteId = params.id as string;

        // Fetch the quote
        const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));

        if (!quoteDoc.exists()) {
          toast.error('Quote not found');
          router.push('/client-portal/quotes');
          return;
        }

        const quoteData = {
          id: quoteDoc.id,
          ...quoteDoc.data(),
        } as Quote;

        // Check if the user is authorized to view this quote
        if (quoteData.clientId !== user.uid) {
          toast.error('You are not authorized to view this quote');
          router.push('/client-portal/quotes');
          return;
        }

        // Check if client has access to this quote's location and permissions
        const clientDoc = await getDoc(doc(db, 'clients', user.uid));
        const clientData = clientDoc.data();
        const clientAssignedLocations = clientData?.assignedLocations || [];
        setCanViewTimeline(clientData?.permissions?.viewTimeline === true);

        if (clientAssignedLocations.length > 0 && quoteData.workOrderId) {
          const workOrderDoc = await getDoc(doc(db, 'workOrders', quoteData.workOrderId));
          if (workOrderDoc.exists()) {
            const workOrderData = workOrderDoc.data();
            if (!clientAssignedLocations.includes(workOrderData.locationId)) {
              toast.error('You do not have access to this quote');
              router.push('/client-portal/quotes');
              return;
            }
          }
        }

        setQuote(quoteData);
        setIsAuthorized(true);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching quote:', error);
        toast.error('Failed to load quote');
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, [auth, db, params.id, router]);

  const handleApprove = async () => {
    if (!quote) return;

    toast(`Approve quote for "${quote.workOrderTitle}"?`, {
      description: 'This will automatically assign the work order to the subcontractor.',
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
              body: JSON.stringify({ quoteId: quote.id }),
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || 'Failed to approve quote');
            }

            const result = await res.json();
            const workOrderData = result.workOrderData;

            // Notify subcontractor of assignment (in-app notification)
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
                  toEmail: quote.subcontractorEmail,
                  toName: quote.subcontractorName,
                  workOrderNumber: workOrderData.workOrderNumber,
                  workOrderTitle: quote.workOrderTitle,
                  clientName: quote.clientName,
                  locationName: workOrderData.locationName,
                  locationAddress: workOrderData.locationAddress,
                }),
              });
            } catch (emailError) {
              console.error('Failed to send assignment email:', emailError);
            }

            // Notify admins that quote was approved and work order assigned
            try {
              await fetch('/api/email/send-quote-approval-admin-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  workOrderId: workOrderData.workOrderId,
                  workOrderNumber: workOrderData.workOrderNumber,
                  workOrderTitle: quote.workOrderTitle,
                  clientName: quote.clientName,
                  subcontractorName: quote.subcontractorName,
                  quoteAmount: quote.clientAmount || quote.totalAmount,
                  locationName: workOrderData.locationName,
                  locationAddress: workOrderData.locationAddress,
                }),
              });
            } catch (adminEmailError) {
              console.error('Failed to send admin quote approval notification:', adminEmailError);
            }

            toast.success('Quote accepted! Work order automatically assigned to subcontractor.');
            router.push('/client-portal/quotes');
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

  const handleReject = async () => {
    if (!quote) return;

    toast(`Reject quote for "${quote.workOrderTitle}"?`, {
      description: 'Please provide a reason for rejection (optional).',
      action: {
        label: 'Reject',
        onClick: async () => {
          const reason = prompt('Please provide a reason for rejection (optional):');
          if (reason === null) return;

          try {
            const currentUser = auth.currentUser;
            let clientName = quote.clientName || 'Client';
            if (currentUser) {
              const clientDocForName = await getDoc(doc(db, 'clients', currentUser.uid));
              if (clientDocForName.exists()) clientName = clientDocForName.data()?.fullName || clientName;
            }
            const existingQuoteTimeline = (quote.timeline || []) as QuoteTimelineEvent[];
            const existingQuoteSysInfo = quote.systemInformation || {};
            const rejectedEvent = createQuoteTimelineEvent({
              type: 'rejected',
              userId: currentUser?.uid || 'unknown',
              userName: clientName,
              userRole: 'client',
              details: `Quote rejected by ${clientName}${reason ? `. Reason: ${reason}` : ''}`,
              metadata: { reason: reason || '' },
            });
            await updateDoc(doc(db, 'quotes', quote.id), {
              status: 'rejected',
              rejectedAt: serverTimestamp(),
              rejectionReason: reason || 'No reason provided',
              timeline: [...existingQuoteTimeline, rejectedEvent],
              systemInformation: {
                ...existingQuoteSysInfo,
                rejectedBy: {
                  id: currentUser?.uid || 'unknown',
                  name: clientName,
                  timestamp: Timestamp.now(),
                  reason: reason || undefined,
                },
              },
              updatedAt: serverTimestamp(),
            });
            toast.success('Quote rejected successfully!');
            router.push('/client-portal/quotes');
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

  const toDate = (val: any) => {
    if (!val) return null;
    if (val?.toDate) return val.toDate();
    if (val instanceof Date) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const buildQuoteTimeline = (q: Quote): QuoteTimelineEvent[] => {
    if (q.timeline && q.timeline.length > 0) {
      return [...q.timeline]
        .filter(e => e.type !== 'sent_to_client')
        .sort((a, b) => {
          const ta = toDate(a.timestamp)?.getTime() ?? 0;
          const tb = toDate(b.timestamp)?.getTime() ?? 0;
          return ta - tb;
        });
    }
    const events: QuoteTimelineEvent[] = [];
    const createdTs = toDate(q.createdAt);
    if (createdTs) {
      events.push({
        id: 'created',
        timestamp: q.createdAt,
        type: 'created',
        userId: (q as any).createdBy || 'unknown',
        userName: q.systemInformation?.createdBy?.name || 'Unknown',
        userRole: (q.creationSource === 'admin_portal' ? 'admin' : 'subcontractor') as 'admin' | 'subcontractor',
        details: q.creationSource === 'admin_portal' ? 'Quote created via admin portal' : 'Quote submitted via bidding portal',
        metadata: { source: q.creationSource || 'subcontractor_bidding' },
      });
    }
    // Intentionally skip sent_to_client events — clients don't need to see admin markup details
    const acceptedTs = toDate(q.acceptedAt);
    if (acceptedTs) {
      events.push({
        id: 'accepted',
        timestamp: q.acceptedAt,
        type: 'accepted',
        userId: q.systemInformation?.acceptedBy?.id || 'unknown',
        userName: q.systemInformation?.acceptedBy?.name || 'Client',
        userRole: 'client',
        details: `Quote approved by ${q.systemInformation?.acceptedBy?.name || 'Client'}. Work order assigned to ${q.subcontractorName}.`,
        metadata: q.workOrderNumber ? { workOrderNumber: q.workOrderNumber } : undefined,
      });
    }
    const rejectedTs = toDate(q.rejectedAt);
    if (rejectedTs) {
      events.push({
        id: 'rejected',
        timestamp: q.rejectedAt,
        type: 'rejected',
        userId: q.systemInformation?.rejectedBy?.id || 'unknown',
        userName: q.systemInformation?.rejectedBy?.name || 'Client',
        userRole: 'client',
        details: `Quote rejected by ${q.systemInformation?.rejectedBy?.name || 'Client'}${(q as any).rejectionReason ? `. Reason: ${(q as any).rejectionReason}` : ''}`,
        metadata: (q as any).rejectionReason ? { reason: (q as any).rejectionReason } : undefined,
      });
    }
    return events.sort((a, b) => (toDate(a.timestamp)?.getTime() ?? 0) - (toDate(b.timestamp)?.getTime() ?? 0));
  };

  const getQuoteCreationSourceLabel = (q: Quote): string => {
    if (q.systemInformation?.createdBy?.name && q.creationSource === 'admin_portal') {
      return `Quote created by ${q.systemInformation.createdBy.name} via Admin Portal`;
    }
    if (q.creationSource === 'subcontractor_bidding' || q.systemInformation?.createdBy?.role === 'subcontractor') {
      return `Quote submitted by ${q.subcontractorName} via Bidding Portal`;
    }
    if (q.systemInformation?.createdBy?.name) {
      return `Quote created by ${q.systemInformation.createdBy.name}`;
    }
    return 'Quote created via portal';
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  if (!isAuthorized || !quote) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Quote not found</h3>
            <p className="text-muted-foreground mb-4">The quote you're looking for doesn't exist or you don't have access to it.</p>
            <Link href="/client-portal/quotes">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Quotes
              </Button>
            </Link>
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/client-portal/quotes">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Quotes
            </Button>
          </Link>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBadge(quote.status)}`}>
            {getStatusLabel(quote.status)}
          </span>
        </div>

        {/* Quote Details Card */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-2xl mb-2">{quote.workOrderTitle}</CardTitle>
              {quote.workOrderNumber && (
                <p className="text-sm text-muted-foreground">Work Order: {quote.workOrderNumber}</p>
              )}
              <p className="text-sm text-muted-foreground">From: {quote.subcontractorName}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-3xl font-bold text-foreground">
                    ${(quote.clientAmount || quote.totalAmount).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Submitted</p>
                  <p className="text-sm font-medium text-foreground">
                    {quote.sentToClientAt?.toDate?.().toLocaleDateString() || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Line Items Breakdown */}
            {(() => {
              const displayItems = quote.clientLineItems || quote.lineItems || [];
              if (displayItems.length === 0) return null;
              const serviceItems = displayItems.filter(item => {
                const desc = item.description?.toLowerCase() || '';
                return !desc.includes('material') && !desc.includes('parts') && !desc.includes('supply');
              });
              const materialItems = displayItems.filter(item => {
                const desc = item.description?.toLowerCase() || '';
                return desc.includes('material') || desc.includes('parts') || desc.includes('supply');
              });
              const materialsSubtotal = materialItems.reduce((s, i) => s + i.amount, 0);
              const subtotal = displayItems.reduce((s, i) => s + i.amount, 0);
              const renderTable = (items: typeof displayItems) => (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-muted-foreground text-xs uppercase">
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-center">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-center">{item.quantity.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right">${item.unitPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-medium">${item.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
              return (
                <div className="border-t pt-6 space-y-4">
                  {serviceItems.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Services</p>
                      <div className="border rounded-md overflow-hidden">{renderTable(serviceItems)}</div>
                    </div>
                  )}
                  {materialItems.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Materials</p>
                      <div className="border rounded-md overflow-hidden">{renderTable(materialItems)}</div>
                    </div>
                  )}
                  <div className="bg-muted/50 border rounded-md px-4 py-3 space-y-1 text-sm">
                    {materialsSubtotal > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Materials subtotal</span>
                        <span>${materialsSubtotal.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base border-t border-border pt-2 mt-2">
                      <span>Total</span>
                      <span>${(quote.clientAmount || quote.totalAmount).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Proposed Service Schedule */}
            {quote.proposedServiceDate && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900 mb-1">Proposed Service Schedule</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-blue-700">Date</p>
                        <p className="text-sm font-medium text-blue-900">
                          {quote.proposedServiceDate?.toDate?.().toLocaleDateString() ||
                           new Date(quote.proposedServiceDate).toLocaleDateString()}
                        </p>
                      </div>
                      {quote.proposedServiceTime && (
                        <div>
                          <p className="text-xs text-blue-700">Time</p>
                          <p className="text-sm font-medium text-blue-900">
                            {quote.proposedServiceTime}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Notes */}
            {quote.notes && (
              <div className="border-t pt-6">
                <h4 className="font-semibold text-foreground mb-2">Additional Notes</h4>
                <p className="text-sm text-foreground whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            {quote.status === 'sent_to_client' && (
              <div className="flex gap-3 pt-6 border-t">
                <Button
                  onClick={handleApprove}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Approve Quote
                </Button>
                <Button
                  onClick={handleReject}
                  variant="outline"
                  className="flex-1 text-red-600 border-red-600 hover:bg-red-50"
                >
                  <X className="h-4 w-4 mr-2" />
                  Reject Quote
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {canViewTimeline && (
          <QuoteSystemInfo
            timeline={buildQuoteTimeline(quote)}
            systemInformation={quote.systemInformation}
            creationSourceLabel={getQuoteCreationSourceLabel(quote)}
          />
        )}
      </div>
    </ClientLayout>
  );
}
