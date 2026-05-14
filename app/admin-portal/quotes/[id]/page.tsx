'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  doc, getDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, FileText, Send, Trash2, ClipboardList, User, Building2, Mail, DollarSign, AlertCircle, ChevronRight, Pencil } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatMoney } from '@/lib/money';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';
import { notifyClientOfQuoteSent } from '@/lib/notifications';

import { PortalDetailGlass } from '@/components/ui/portal-detail-glass';
import { PortalListPage } from '@/components/ui/portal-list-page';
interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Quote {
  id: string;
  workOrderId?: string;
  workOrderIds?: string[];
  workOrderGroupId?: string;
  workOrderNumber?: string;
  workOrderTitle: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail: string;
  laborCost?: number;
  materialCost?: number;
  additionalCosts?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  originalAmount?: number;
  clientAmount?: number;
  markupPercentage?: number;
  lineItems: LineItem[];
  clientLineItems?: LineItem[];
  notes?: string;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
  sentToClientAt?: any;
  acceptedAt?: any;
  rejectedAt?: any;
  rejectionReason?: string;
  isDiagnosticQuote?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  sent_to_client: 'text-primary bg-primary/10 border-primary/20',
  accepted: 'text-green-700 bg-green-50 border-green-200',
  rejected: 'text-red-700 bg-red-50 border-red-200',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[status] || 'text-muted-foreground bg-muted border-border'}`}>
      {status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export default function AdminQuoteDetail() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params?.id as string | undefined;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [markupPercent, setMarkupPercent] = useState('20');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthReady(true);
      if (!u) router.push('/portal-login');
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!quoteId || !authReady) return;
    (async () => {
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, 'quotes', quoteId));
        if (!snap.exists()) {
          toast.error('Quote not found');
          router.push('/admin-portal/quotes');
          return;
        }
        const data = { id: snap.id, ...snap.data() } as Quote;
        setQuote(data);
        setMarkupPercent(String(data.markupPercentage || 20));
      } catch (err) {
        console.error('Error loading quote:', err);
        toast.error('Failed to load quote');
      } finally {
        setLoading(false);
      }
    })();
  }, [quoteId, authReady, router]);

  const handleApplyMarkupAndSend = async () => {
    if (!quote) return;
    const markup = parseFloat(markupPercent || '0');
    if (!Number.isFinite(markup) || markup < 0) {
      toast.error('Enter a valid markup percentage');
      return;
    }
    setSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data()?.fullName : 'Admin';

      const markupDecimal = markup / 100;
      const clientAmount = quote.totalAmount * (1 + markupDecimal);
      const markupFactor = quote.totalAmount > 0 ? clientAmount / quote.totalAmount : 1;
      const clientLineItems = (quote.lineItems || []).map(item => ({
        ...item,
        unitPrice: item.unitPrice * markupFactor,
        amount: item.amount * markupFactor,
      }));
      const isResend = quote.status === 'sent_to_client';

      const existingQuoteTimeline = (quote as any).timeline || [];
      const sentEvent = createQuoteTimelineEvent({
        type: 'sent_to_client',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: isResend
          ? `Quote resent to client with ${markup}% markup (${formatMoney(clientAmount)})`
          : `Quote sent to client with ${markup}% markup (${formatMoney(clientAmount)})`,
        metadata: { quoteId: quote.id, workOrderNumber: quote.workOrderNumber },
      });
      const existingSysInfo = (quote as any).systemInformation || {};

      await updateDoc(doc(db, 'quotes', quote.id), {
        markupPercentage: markup,
        clientAmount,
        clientLineItems,
        originalAmount: quote.totalAmount,
        status: 'sent_to_client',
        sentToClientAt: serverTimestamp(),
        sentBy: currentUser.uid,
        timeline: [...existingQuoteTimeline, sentEvent],
        systemInformation: {
          ...existingSysInfo,
          sentToClientBy: { id: currentUser.uid, name: adminName, timestamp: Timestamp.now() },
        },
        updatedAt: serverTimestamp(),
      });

      // Mirror onto the work order timeline.
      const workOrderIds = Array.isArray(quote.workOrderIds) && quote.workOrderIds.length >= 2
        ? quote.workOrderIds.map(String)
        : quote.workOrderId ? [quote.workOrderId] : [];
      if (workOrderIds.length > 0) {
        await Promise.all(workOrderIds.map(async (woId) => {
          const woDoc = await getDoc(doc(db, 'workOrders', woId));
          if (!woDoc.exists()) return;
          const woData = woDoc.data();
          const existingTimeline = woData?.timeline || [];
          const existingWoSysInfo = woData?.systemInformation || {};
          await updateDoc(doc(db, 'workOrders', woId), {
            timeline: [...existingTimeline, createTimelineEvent({
              type: 'quote_shared_with_client',
              userId: currentUser.uid,
              userName: adminName,
              userRole: 'admin',
              details: isResend
                ? `Quote from ${quote.subcontractorName} resent to client with ${markup}% markup (${formatMoney(clientAmount)})`
                : `Quote from ${quote.subcontractorName} sent to client with ${markup}% markup (${formatMoney(clientAmount)})`,
              metadata: { quoteId: quote.id, subcontractorName: quote.subcontractorName, clientAmount, markup, ...(quote.workOrderGroupId ? { workOrderGroupId: quote.workOrderGroupId } : {}) },
            })],
            systemInformation: {
              ...existingWoSysInfo,
              quoteSharedWithClient: {
                quoteId: quote.id,
                by: { id: currentUser.uid, name: adminName },
                timestamp: Timestamp.now(),
                ...(quote.workOrderGroupId ? { workOrderGroupId: quote.workOrderGroupId } : {}),
              },
            },
            updatedAt: serverTimestamp(),
          });
        }));
      }

      // In-app notification.
      if (quote.workOrderNumber) {
        const primaryWoId =
          (Array.isArray(quote.workOrderIds) && quote.workOrderIds.length > 0 ? String(quote.workOrderIds[0]) : null) ||
          quote.workOrderId ||
          null;
        if (primaryWoId) {
          await notifyClientOfQuoteSent(quote.clientId, primaryWoId, quote.workOrderNumber, clientAmount);
        }
      }

      // Email — always call the route so it can write a `skipped` row to
      // emailLogs when no client email is on file. Awaited so the toast
      // can distinguish sent vs skipped vs failed (no silent skip).
      let emailOutcome: 'sent' | 'skipped' | 'failed' = 'failed';
      let emailMessage = '';
      try {
        const emailRes = await fetch('/api/email/send-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: quote.clientEmail || '',
            toName: quote.clientName,
            quoteNumber: quote.workOrderNumber || quote.id,
            workOrderTitle: quote.workOrderTitle,
            totalAmount: quote.totalAmount,
            clientAmount,
            markupPercentage: markup,
            lineItems: clientLineItems,
            notes: quote.notes,
          }),
        });
        const data = await emailRes.json().catch(() => ({}));
        if (emailRes.ok) {
          emailOutcome = data?.skipped ? 'skipped' : 'sent';
          emailMessage = data?.message || '';
        } else {
          emailOutcome = 'failed';
          emailMessage = data?.details || data?.error || `HTTP ${emailRes.status}`;
        }
      } catch (err: any) {
        emailOutcome = 'failed';
        emailMessage = err?.message || String(err);
        console.error('Failed to send quote email to client:', err);
      }

      const baseMsg = isResend
        ? `Quote resent to client (${markup}% markup)`
        : `Quote sent to client (${markup}% markup)`;
      if (emailOutcome === 'sent') {
        toast.success(`${baseMsg} — email sent`);
      } else if (emailOutcome === 'skipped') {
        toast.warning(`${baseMsg} — email skipped (no client email on file)`);
      } else {
        toast.warning(`${baseMsg} — email failed: ${emailMessage}`);
      }
      // Re-read to reflect new state.
      const fresh = await getDoc(doc(db, 'quotes', quote.id));
      if (fresh.exists()) setQuote({ id: fresh.id, ...fresh.data() } as Quote);
      setShowShare(false);
    } catch (err) {
      console.error('Error sending quote:', err);
      toast.error('Failed to send quote to client');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!quote) return;
    if (!confirm(`Delete quote for "${quote.workOrderTitle}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'quotes', quote.id));
      toast.success('Quote deleted');
      router.push('/admin-portal/quotes');
    } catch (err) {
      console.error('Error deleting quote:', err);
      toast.error('Failed to delete quote');
    }
  };

  if (loading || !authReady) {
    return (
      <PortalListPage title="Quote" subtitle="Loading…" icon={FileText}>
        <div className="flex h-64 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        </div>
      </PortalListPage>
    );
  }

  if (!quote) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">Quote not found.</p>
            <Link href="/admin-portal/quotes">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />Back to Quotes
              </Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  const canShare = quote.status === 'pending' || quote.status === 'sent_to_client';
  const previewClientAmount = quote.totalAmount * (1 + (parseFloat(markupPercent || '0') / 100));

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6">
        <PortalDetailGlass>
          <nav
            className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground"
            aria-label="Breadcrumb"
          >
            <Link href="/admin-portal/quotes" className="font-medium transition-colors hover:text-foreground">
              Quotes
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
            <span className="truncate text-xs font-mono text-foreground/90">
              {quote.workOrderNumber || quote.id}
            </span>
          </nav>
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin-portal/quotes">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />Back to Quotes
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <StatusPill status={quote.status} />
            </div>
          </div>
        </PortalDetailGlass>

        {/* Header card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-2xl">{quote.workOrderTitle}</CardTitle>
                  {(quote as any).editedAt && (
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground italic">
                      <Pencil className="h-3.5 w-3.5" />Edited
                    </span>
                  )}
                </div>
                {quote.workOrderNumber && quote.workOrderId && (
                  <Link href={`/admin-portal/work-orders/${quote.workOrderId}`} className="text-sm text-primary hover:underline mt-1 inline-flex items-center gap-1">
                    <ClipboardList className="h-3.5 w-3.5" />
                    {quote.workOrderNumber}
                  </Link>
                )}
                {quote.isDiagnosticQuote && (
                  <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5 mt-2 inline-block">
                    Diagnostic Quote
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canShare && (
                  <Button
                    onClick={() => setShowShare((v) => !v)}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {quote.status === 'sent_to_client' ? 'Resend to Client' : 'Send to Client'}
                  </Button>
                )}
                <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />Delete
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Parties */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subcontractor</p>
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">{quote.subcontractorName}</span>
                </div>
                {quote.subcontractorEmail && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    {quote.subcontractorEmail}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</p>
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">{quote.clientName}</span>
                </div>
                {quote.clientEmail && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    {quote.clientEmail}
                  </div>
                )}
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground mb-1">Subcontractor Total</p>
                <p className="text-2xl font-bold text-foreground">{formatMoney(quote.totalAmount)}</p>
                <p className="text-xs text-muted-foreground mt-1">Original quote amount before markup.</p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/10 p-4">
                <p className="text-xs text-primary mb-1">
                  Client Amount {quote.markupPercentage != null ? `(${quote.markupPercentage}% markup)` : ''}
                </p>
                <p className="text-2xl font-bold text-primary">
                  {quote.clientAmount != null ? formatMoney(quote.clientAmount) : '—'}
                </p>
                <p className="text-xs text-primary mt-1">
                  {quote.clientAmount != null
                    ? 'This is what the client sees and pays.'
                    : 'Set a markup % below and Send to Client to lock in the client price.'}
                </p>
              </div>
            </div>

            {/* Inline send-to-client panel */}
            {canShare && showShare && (
              <div className="rounded-lg border-2 border-primary/25 bg-primary/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    {quote.status === 'sent_to_client' ? 'Resend to Client' : 'Send to Client'}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setShowShare(false)} disabled={submitting}>
                    Cancel
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <Label htmlFor="markupPercent" className="text-xs">Markup %</Label>
                    <Input
                      id="markupPercent"
                      type="number"
                      min="0"
                      max="500"
                      value={markupPercent}
                      onChange={(e) => setMarkupPercent(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Client will see</p>
                    <p className="text-xl font-bold text-primary">{formatMoney(previewClientAmount)}</p>
                  </div>
                </div>
                <Button
                  onClick={handleApplyMarkupAndSend}
                  disabled={submitting}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {submitting
                    ? 'Sending…'
                    : quote.status === 'sent_to_client' ? 'Resend to Client' : 'Send to Client'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  An in-app notification and email will be sent to {quote.clientEmail || 'the client'}. The client portal will show the marked-up amount only.
                </p>
              </div>
            )}

            {/* Cost breakdown */}
            {(quote.laborCost || quote.materialCost || quote.additionalCosts || quote.discountAmount) ? (
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  Cost Breakdown
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {quote.laborCost ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Labor</span>
                      <span className="font-medium">{formatMoney(quote.laborCost)}</span>
                    </div>
                  ) : null}
                  {quote.materialCost ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Materials</span>
                      <span className="font-medium">{formatMoney(quote.materialCost)}</span>
                    </div>
                  ) : null}
                  {quote.additionalCosts ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Additional</span>
                      <span className="font-medium">{formatMoney(quote.additionalCosts)}</span>
                    </div>
                  ) : null}
                  {quote.discountAmount ? (
                    <div className="flex justify-between text-green-700">
                      <span>Discount</span>
                      <span className="font-medium">-{formatMoney(quote.discountAmount)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Client-facing line items */}
            {quote.clientLineItems && quote.clientLineItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Line Items — Client View ({quote.markupPercentage ?? 0}% markup)
                </p>
                <div className="border border-primary/20 rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="bg-primary/10 text-foreground text-xs uppercase">
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-center">Qty</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.clientLineItems.map((item, idx) => (
                        <tr key={idx} className="border-t border-primary/15">
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-center">{item.quantity?.toFixed?.(1) ?? item.quantity}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(item.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatMoney(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
                <div className="mt-2 text-right text-sm font-semibold text-primary">
                  Client Total: {formatMoney(quote.clientAmount)}
                </div>
              </div>
            )}

            {/* Original sub line items */}
            {quote.lineItems && quote.lineItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {quote.clientLineItems?.length ? 'Original Subcontractor Quote' : 'Line Items'}
                </p>
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="bg-muted text-muted-foreground text-xs uppercase">
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-center">Qty</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.lineItems.map((item, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-center">{item.quantity?.toFixed?.(1) ?? item.quantity}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(item.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatMoney(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
                <div className="mt-2 text-right text-sm font-semibold text-foreground">
                  Total: {formatMoney(quote.totalAmount)}
                </div>
              </div>
            )}

            {/* Notes */}
            {quote.notes && (
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</p>
                <p className="text-sm whitespace-pre-wrap text-foreground">{quote.notes}</p>
              </div>
            )}

            {/* Rejection reason */}
            {quote.status === 'rejected' && quote.rejectionReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-900">Rejection reason</p>
                  <p className="text-sm text-red-800 mt-1 whitespace-pre-wrap">{quote.rejectionReason}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(() => {
              const created = toDate(quote.createdAt);
              const sent = toDate(quote.sentToClientAt);
              const accepted = toDate(quote.acceptedAt);
              const rejected = toDate(quote.rejectedAt);
              return (
                <>
                  {created && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>{created.toLocaleString()}</span>
                    </div>
                  )}
                  {sent && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sent to client</span>
                      <span>{sent.toLocaleString()}</span>
                    </div>
                  )}
                  {accepted && (
                    <div className="flex justify-between text-green-700">
                      <span>Accepted by client</span>
                      <span>{accepted.toLocaleString()}</span>
                    </div>
                  )}
                  {rejected && (
                    <div className="flex justify-between text-red-700">
                      <span>Rejected by client</span>
                      <span>{rejected.toLocaleString()}</span>
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
