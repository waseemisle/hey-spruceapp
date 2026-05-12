'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Receipt, Download, CreditCard, Calendar, CheckCircle, ArrowLeft, Image as ImageIcon, AlertTriangle, ThumbsUp, Clock } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import { formatMoney } from '@/lib/money';
import InvoiceSystemInfo from '@/components/invoice-system-info';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import type { InvoiceTimelineEvent, InvoiceSystemInformation } from '@/types';

import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';
import { Sparkles } from 'lucide-react';
interface Invoice {
  id: string;
  invoiceNumber: string;
  workOrderId?: string;
  workOrderTitle: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorName?: string;
  status: 'draft' | 'pending_approval' | 'sent' | 'paid' | 'overdue' | 'disputed';
  totalAmount: number;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  discountAmount?: number;
  dueDate: any;
  stripePaymentLink?: string;
  stripeReceiptUrl?: string;
  stripeInvoicePdf?: string;
  paidAt?: any;
  notes?: string;
  terms?: string;
  createdAt: any;
  approvalRequired?: boolean;
  approvalDeadlineAt?: any;
  clientApprovalStatus?: 'pending' | 'approved' | 'disputed' | 'auto_finalized';
  approvedAt?: any;
  disputedAt?: any;
  disputeReason?: string;
  timeline?: InvoiceTimelineEvent[];
  systemInformation?: InvoiceSystemInformation;
  creationSource?: string;
  completionDetails?: string;
  completionNotes?: string;
  completionImages?: string[];
}

export default function ClientInvoiceDetail() {
  const { auth, db } = useFirebaseInstance();
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [canViewTimeline, setCanViewTimeline] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Guard against transient null on first emission (Firebase restoring
        // persisted session). Only redirect when the singleton is also null.
        if (auth.currentUser) return;
        setLoading(false);
        router.push('/portal-login');
        return;
      }
      try {
        setLoading(true);
        const invoiceId = params.id as string;
        const invoiceDoc = await getDoc(doc(db, 'invoices', invoiceId));
        if (!invoiceDoc.exists()) {
          const byWorkOrder = await getDocs(
            query(
              collection(db, 'invoices'),
              where('clientId', '==', user.uid),
              where('workOrderId', '==', invoiceId)
            )
          );
          if (byWorkOrder.docs.length === 1) {
            router.replace(`/client-portal/invoices/${byWorkOrder.docs[0].id}`);
            return;
          }
          if (byWorkOrder.docs.length > 1) {
            router.replace(`/client-portal/invoices?workOrderId=${encodeURIComponent(invoiceId)}`);
            return;
          }
          toast.error('Invoice not found');
          router.push('/client-portal/invoices');
          return;
        }
        const data = { ...invoiceDoc.data(), id: invoiceDoc.id } as Invoice;
        if (data.clientId !== user.uid) {
          toast.error('You are not authorized to view this invoice');
          router.push('/client-portal/invoices');
          return;
        }
        const clientDoc = await getDoc(doc(db, 'clients', user.uid));
        const clientData = clientDoc.data();
        setCanViewTimeline(clientData?.permissions?.viewTimeline === true);
        setInvoice(data);
        setIsAuthorized(true);

        // ── Self-sync from Stripe ───────────────────────────────────────
        // If Stripe shows the invoice as paid but Firestore hasn't caught
        // up (e.g. webhook miss), pull the status. Fire-and-forget; on a
        // successful sync we re-read to flip the page to "Paid" without
        // the user having to refresh.
        if (data.status !== 'paid' && (data as any).stripeInvoiceId) {
          (async () => {
            try {
              const res = await fetch('/api/stripe/sync-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceId: data.id }),
              });
              const out = await res.json();
              if (out?.synced && out?.stripeStatus === 'paid') {
                const fresh = await getDoc(doc(db, 'invoices', data.id));
                if (fresh.exists()) setInvoice({ ...fresh.data(), id: fresh.id } as Invoice);
              }
            } catch (syncErr) {
              console.warn('Background Stripe status sync failed:', syncErr);
            }
          })();
        }
      } catch (error) {
        console.error('Error fetching invoice:', error);
        toast.error('Failed to load invoice');
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, [auth, db, params.id, router]);

  /**
   * Prefer the Stripe-hosted invoice PDF (carries the "Pay online" link
   * and Stripe-formatted layout). Cross-origin so we can't trigger a
   * download programmatically — open in a new tab and let the user
   * download from there. Falls back to the local generator only when
   * the Stripe PDF isn't ready yet (draft / link still being created).
   */
  const handleDownloadPDF = async () => {
    if (!invoice) return;
    if (invoice.stripeInvoicePdf) {
      window.open(invoice.stripeInvoicePdf, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      await downloadInvoicePDF({
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        lineItems: invoice.lineItems?.length
          ? invoice.lineItems
          : [{ description: invoice.workOrderTitle, quantity: 1, unitPrice: invoice.totalAmount, amount: invoice.totalAmount }],
        subtotal: invoice.totalAmount,
        discountAmount: invoice.discountAmount || 0,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate?.toDate?.()?.toLocaleDateString() || 'N/A',
        notes: invoice.notes || '',
        terms: invoice.terms || '',
      });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF');
    }
  };

  // ── Invoice Approval (72h) — client actions ──────────────────────────────
  const [approving, setApproving] = useState(false);
  const [disputing, setDisputing] = useState(false);

  const handleApprove = async () => {
    if (!invoice) return;
    if (!confirm(`Approve invoice ${invoice.invoiceNumber} for ${formatMoney(invoice.totalAmount)}? This will finalize and email the invoice immediately.`)) return;
    setApproving(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/invoices/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to approve invoice');
      }
      toast.success('Invoice approved. Finalizing now.');
      // Optimistically reflect new status — full state will refresh on next page load.
      setInvoice({ ...invoice, status: 'sent', clientApprovalStatus: 'approved' });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to approve invoice');
    } finally {
      setApproving(false);
    }
  };

  const handleDispute = async () => {
    if (!invoice) return;
    const reason = prompt('Please describe the issue you found with this invoice (optional):') ?? '';
    if (reason === null) return;
    setDisputing(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/invoices/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ invoiceId: invoice.id, reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to file dispute');
      }
      toast.success('Dispute filed. Our team will review.');
      setInvoice({ ...invoice, status: 'disputed', clientApprovalStatus: 'disputed', disputeReason: reason });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to file dispute');
    } finally {
      setDisputing(false);
    }
  };

  /** Format the remaining 72h window as e.g. "23h 14m left" or "Deadline passed". */
  const formatTimeLeft = (deadline: Date | null): string => {
    if (!deadline) return '';
    const ms = deadline.getTime() - Date.now();
    if (ms <= 0) return 'Deadline passed';
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remH = hours % 24;
      return `${days}d ${remH}h left`;
    }
    return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
  };

  const handlePayNow = async () => {
    if (!invoice) return;
    let link = invoice.stripePaymentLink;
    // Open the stored hosted invoice link directly when we have one — the
    // /api/stripe/create-payment-link route is idempotent so calling it on
    // every Pay click was previously safe, but it added unnecessary latency
    // and (before idempotency was added) caused void + duplicate Stripe
    // invoices. Only mint a link when one doesn't exist yet.
    if (!link && invoice.status !== 'paid') {
      try {
        const res = await fetch('/api/stripe/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: invoice.id }),
        });
        const data = await res.json();
        if (res.ok && data.paymentLink) {
          link = data.paymentLink as string;
          setInvoice({ ...invoice, stripePaymentLink: link });
        } else {
          const errMsg = data?.error || 'Failed to create payment link';
          console.error('Stripe payment-link request returned:', data);
          toast.error(errMsg);
          return;
        }
      } catch (err) {
        console.error('Failed to fetch payment link:', err);
        toast.error('Network error — could not reach payment server');
        return;
      }
    }
    if (link) {
      window.open(link, '_blank');
    } else {
      toast.error('Payment link not available');
    }
  };

  const toDate = (val: any) => {
    if (!val) return null;
    if (val?.toDate) return val.toDate();
    if (val instanceof Date) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const buildInvoiceTimeline = (inv: Invoice): InvoiceTimelineEvent[] => {
    if (inv.timeline && inv.timeline.length > 0) {
      return [...inv.timeline].sort((a, b) => (toDate(a.timestamp)?.getTime() ?? 0) - (toDate(b.timestamp)?.getTime() ?? 0));
    }
    const events: InvoiceTimelineEvent[] = [];
    const createdTs = toDate(inv.createdAt);
    if (createdTs) {
      events.push({
        id: 'created',
        timestamp: inv.createdAt,
        type: 'created',
        userId: (inv as any).createdBy || 'unknown',
        userName: inv.systemInformation?.createdBy?.name || 'Admin',
        userRole: 'admin',
        details: inv.creationSource === 'from_quote' ? 'Invoice created from accepted quote' : 'Invoice created',
        metadata: { source: inv.creationSource || 'admin_portal' },
      });
    }
    if (inv.status === 'sent' || inv.status === 'paid') {
      const sentAt = (inv as any).sentAt;
      if (sentAt) {
        events.push({
          id: 'sent',
          timestamp: sentAt,
          type: 'sent',
          userId: inv.systemInformation?.sentBy?.id || 'unknown',
          userName: inv.systemInformation?.sentBy?.name || 'Admin',
          userRole: 'admin',
          details: 'Invoice sent to client',
          metadata: { invoiceNumber: inv.invoiceNumber },
        });
      }
    }
    if (inv.status === 'paid' && inv.paidAt) {
      events.push({
        id: 'paid',
        timestamp: inv.paidAt,
        type: 'paid',
        userId: inv.systemInformation?.paidBy?.id || 'system',
        userName: inv.systemInformation?.paidBy?.name || 'Payment System',
        userRole: 'system',
        details: 'Payment received',
        metadata: {},
      });
    }
    return events.sort((a, b) => (toDate(a.timestamp)?.getTime() ?? 0) - (toDate(b.timestamp)?.getTime() ?? 0));
  };

  const getInvoiceCreationSourceLabel = (inv: Invoice): string => {
    if (inv.systemInformation?.createdBy?.name && inv.creationSource === 'from_quote') {
      return `Invoice created by ${inv.systemInformation.createdBy.name} from accepted quote`;
    }
    if (inv.systemInformation?.createdBy?.name) {
      return `Invoice created by ${inv.systemInformation.createdBy.name} via Admin Portal`;
    }
    if (inv.creationSource === 'scheduled') return 'Invoice created from scheduled invoice';
    if (inv.creationSource === 'upload') return 'Invoice created from uploaded PDF';
    return 'Invoice created via portal';
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-amber-100 text-amber-800',
      pending_approval: 'bg-amber-100 text-amber-800',
      sent: 'bg-blue-100 text-blue-800',
      paid: 'bg-emerald-100 text-emerald-800',
      disputed: 'bg-red-100 text-red-800',
      overdue: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-muted text-foreground';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Draft',
      pending_approval: 'Pending Your Approval',
      sent: 'Awaiting Payment',
      paid: 'Paid',
      disputed: 'Disputed — Under Review',
      overdue: 'Overdue',
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <>
      <PageContainer>
        <PortalHero
          title="Page"
          subtitle=""
          icon={Sparkles}
        />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
            </PageContainer>
    </>
    );
  }

  if (!isAuthorized || !invoice) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Receipt className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Invoice not found</h3>
            <p className="text-muted-foreground mb-4">This invoice does not exist or you do not have access.</p>
            <Link href="/client-portal/invoices">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Invoices
              </Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <Link href="/client-portal/invoices">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Invoices
            </Button>
          </Link>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBadge(invoice.status)}`}>
            {getStatusLabel(invoice.status)}
          </span>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-2xl mb-2">{invoice.invoiceNumber}</CardTitle>
              <p className="text-sm text-muted-foreground">{invoice.workOrderTitle}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-3xl font-bold text-foreground">{formatMoney(invoice.totalAmount)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  <p className="text-sm font-medium text-foreground">
                    {invoice.dueDate?.toDate?.()?.toLocaleDateString() || 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            {/* Pending Approval banner — 72h client review window */}
            {invoice.status === 'pending_approval' && invoice.clientApprovalStatus === 'pending' && (() => {
              const deadline = toDate(invoice.approvalDeadlineAt);
              const timeLeft = formatTimeLeft(deadline);
              const passed = !deadline || (deadline.getTime() - Date.now()) <= 0;
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-amber-900">Review &amp; approve this invoice</p>
                      <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                        Please review the invoice below. You have <strong>72 hours</strong> from generation
                        to approve or dispute the work / amount.
                        {deadline && (
                          <> Deadline: <strong>{deadline.toLocaleString()}</strong> ({timeLeft}).</>
                        )}
                        {' '}If you don&apos;t respond in time, the invoice will be deemed approved and finalized.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={handleApprove}
                      disabled={approving || disputing || passed}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      {approving ? 'Approving…' : 'Approve &amp; Finalize'}
                    </Button>
                    <Button
                      onClick={handleDispute}
                      disabled={approving || disputing || passed}
                      variant="outline"
                      className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      {disputing ? 'Filing dispute…' : 'Dispute Invoice'}
                    </Button>
                  </div>
                </div>
              );
            })()}

            {invoice.status === 'disputed' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-900">Invoice disputed</p>
                  <p className="text-xs text-red-800 mt-1">
                    Our team has been notified and will follow up.
                    {invoice.disputeReason && (
                      <> Your note: <span className="italic">&ldquo;{invoice.disputeReason}&rdquo;</span></>
                    )}
                  </p>
                </div>
              </div>
            )}

            {invoice.status === 'paid' && invoice.paidAt && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900">Paid on {invoice.paidAt?.toDate?.()?.toLocaleDateString() || 'N/A'}</p>
                  {(invoice.stripeReceiptUrl || invoice.stripeInvoicePdf) && (
                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                      {invoice.stripeReceiptUrl && (
                        <a href={invoice.stripeReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-green-800 underline hover:text-green-900">
                          View Receipt
                        </a>
                      )}
                      {invoice.stripeInvoicePdf && (
                        <a href={invoice.stripeInvoicePdf} target="_blank" rel="noopener noreferrer" className="text-green-800 underline hover:text-green-900">
                          Stripe Invoice PDF
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button onClick={handleDownloadPDF} variant="outline" className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              {invoice.status !== 'paid' && invoice.status !== 'pending_approval' && invoice.status !== 'disputed' && (
                <Button onClick={handlePayNow} variant="outline" className="flex-1">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay via Stripe
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Completion Details */}
        {(invoice.completionDetails || invoice.completionNotes || (invoice.completionImages && invoice.completionImages.length > 0)) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Completion Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(invoice.completionDetails || invoice.completionNotes) && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  {invoice.completionDetails && (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.completionDetails}</p>
                  )}
                  {invoice.completionNotes && invoice.completionNotes !== invoice.completionDetails && (
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{invoice.completionNotes}</p>
                  )}
                </div>
              )}
              {invoice.completionImages && invoice.completionImages.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-blue-600" />
                    Completion Images ({invoice.completionImages.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {invoice.completionImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setLightboxImages(invoice.completionImages || []); setLightboxIndex(idx); }}
                        className="aspect-square rounded-lg overflow-hidden border border-border hover:shadow-md transition-shadow bg-muted cursor-pointer"
                      >
                        <img
                          src={img}
                          alt={`Completion image ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {canViewTimeline && (
          <InvoiceSystemInfo
            timeline={buildInvoiceTimeline(invoice)}
            systemInformation={invoice.systemInformation}
            creationSourceLabel={getInvoiceCreationSourceLabel(invoice)}
          />
        )}
      </div>

      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}
    </>
  );
}
