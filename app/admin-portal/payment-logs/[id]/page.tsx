'use client';

import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';
import { Sparkles } from 'lucide-react';
/**
 * Admin → Payment Log detail
 *
 * Forensic view for a single payment-log row. Lays out:
 *   • Status banner (pill + amount + Stripe id)
 *   • Linked records — deep links to the Firestore invoice / client /
 *     scheduled invoice / RWO / subcontractor this event touched
 *   • Money + fees + payment-method details (card brand/last4 or bank)
 *   • Risk + outcome (cards only)
 *   • Failure analysis — declineCategory, possibleCauses, nextSteps
 *     when the row failed; pulled from lib/payment-logs's curated
 *     decline-code → English mapping
 *   • Record-mutation cascade — every Firestore doc the route /
 *     webhook updated as a result of this event
 *   • Raw Stripe payload (collapsible)
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, ExternalLink, AlertCircle, CheckCircle, AlertTriangle, Clock, RotateCcw, X, Building2, CreditCard, ChevronDown, ChevronUp, ListTree,
} from 'lucide-react';
import { formatMoney } from '@/lib/money';
import type { PaymentLog } from '@/types';

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const fmtDateTime = (d: Date | null) =>
  d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

const StatusBanner = ({ status }: { status: PaymentLog['status'] }) => {
  const cfg = (() => {
    switch (status) {
      case 'succeeded': return { Icon: CheckCircle, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' };
      case 'failed': return { Icon: AlertCircle, cls: 'bg-red-50 border-red-200 text-red-700' };
      case 'requires_action': return { Icon: AlertTriangle, cls: 'bg-amber-50 border-amber-200 text-amber-700' };
      case 'processing': return { Icon: Clock, cls: 'bg-blue-50 border-blue-200 text-blue-700' };
      case 'refunded': return { Icon: RotateCcw, cls: 'bg-violet-50 border-violet-200 text-violet-700' };
      case 'disputed': return { Icon: AlertTriangle, cls: 'bg-orange-50 border-orange-200 text-orange-700' };
      case 'canceled': return { Icon: X, cls: 'bg-muted border-border text-muted-foreground' };
      default: return { Icon: Clock, cls: 'bg-muted border-border text-foreground' };
    }
  })();
  const { Icon, cls } = cfg;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${cls}`}>
      <Icon className="h-4 w-4" />
      {status.replace(/_/g, ' ')}
    </div>
  );
};

const stripeDashboardUrl = (log: PaymentLog): string | null => {
  if (!log.stripeObjectId) return null;
  // Live mode dashboard. (Stripe handles the test/live routing.)
  switch (log.stripeObjectType) {
    case 'payment_intent': return `https://dashboard.stripe.com/payments/${log.stripeObjectId}`;
    case 'charge': return `https://dashboard.stripe.com/payments/${log.stripeObjectId}`;
    case 'invoice': return `https://dashboard.stripe.com/invoices/${log.stripeObjectId}`;
    case 'setup_intent': return `https://dashboard.stripe.com/setup_intents/${log.stripeObjectId}`;
    case 'checkout_session': return `https://dashboard.stripe.com/checkout/sessions/${log.stripeObjectId}`;
    case 'subscription': return `https://dashboard.stripe.com/subscriptions/${log.stripeObjectId}`;
    case 'refund': return `https://dashboard.stripe.com/refunds/${log.stripeObjectId}`;
    case 'dispute': return `https://dashboard.stripe.com/disputes/${log.stripeObjectId}`;
    default: return null;
  }
};

export default function PaymentLogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [log, setLog] = useState<(PaymentLog & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'paymentLogs', id), (snap) => {
      if (snap.exists()) setLog({ id: snap.id, ...(snap.data() as any) });
      else setLog(null);
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  if (loading) {
    return (
      <AdminLayout>
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
    </AdminLayout>
    );
  }

  if (!log) {
    return (
      <AdminLayout>
        <div className="max-w-3xl mx-auto pt-8">
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground mb-4">Payment log not found.</p>
              <Link href="/admin-portal/payment-logs">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to list
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  const stripeUrl = stripeDashboardUrl(log);
  const stripeCreated = toDate(log.stripeCreatedAt);
  const recordedAt = toDate(log.createdAt);

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin-portal/payment-logs">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <StatusBanner status={log.status} />
          {stripeUrl && (
            <a href={stripeUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-2" />
                View in Stripe
              </Button>
            </a>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {log.stripeObjectType.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </CardTitle>
                <p className="font-mono text-xs text-muted-foreground mt-1">{log.stripeObjectId}</p>
                {log.stripeEventId && (
                  <p className="font-mono text-xs text-muted-foreground">event: {log.stripeEventId}</p>
                )}
              </div>
              <div className="text-right">
                {typeof log.amount === 'number' && (
                  <p className="text-3xl font-bold">{formatMoney(log.amount)}</p>
                )}
                {log.currency && (
                  <p className="text-xs text-muted-foreground uppercase">{log.currency}</p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Source" value={log.source?.replace(/_/g, ' ')} />
              <Field label="Event" value={log.rawEventType || '—'} mono />
              <Field label="Stripe Created" value={fmtDateTime(stripeCreated)} />
              <Field label="Recorded" value={fmtDateTime(recordedAt)} />
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t">
              {typeof log.feeAmount === 'number' && (
                <Field label="Stripe fee" value={formatMoney(log.feeAmount / 100)} />
              )}
              {typeof log.netAmount === 'number' && (
                <Field label="Net" value={formatMoney(log.netAmount / 100)} />
              )}
              {log.balanceTransactionId && (
                <Field label="Balance txn" value={log.balanceTransactionId} mono small />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Linked records — deep links into Firestore */}
        <Card>
          <CardHeader><CardTitle className="text-base">Linked records</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {log.linkedInvoiceId ? (
                <Link href={`/admin-portal/invoices/${log.linkedInvoiceId}`} className="block">
                  <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 hover:border-blue-400 transition-colors">
                    <p className="text-xs text-muted-foreground uppercase">Invoice</p>
                    <p className="font-semibold mt-0.5">{log.linkedInvoiceNumber || log.linkedInvoiceId}</p>
                    <p className="text-xs text-blue-700 mt-1">Open in admin →</p>
                  </div>
                </Link>
              ) : (
                <Field label="Invoice" value="—" />
              )}
              {log.linkedClientId ? (
                <Link href={`/admin-portal/clients/${log.linkedClientId}`} className="block">
                  <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 hover:border-blue-400 transition-colors">
                    <p className="text-xs text-muted-foreground uppercase">Client</p>
                    <p className="font-semibold mt-0.5">{log.linkedClientName || log.linkedClientId}</p>
                    <p className="text-xs text-blue-700 mt-1">Open in admin →</p>
                  </div>
                </Link>
              ) : log.customerEmail ? (
                <Field label="Customer email" value={log.customerEmail} />
              ) : null}
              {log.linkedScheduledInvoiceId && (
                <Link href={`/admin-portal/scheduled-invoices/${log.linkedScheduledInvoiceId}`} className="block">
                  <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 hover:border-violet-400 transition-colors">
                    <p className="text-xs text-muted-foreground uppercase">Scheduled invoice</p>
                    <p className="font-semibold mt-0.5">{log.linkedScheduledInvoiceId}</p>
                    <p className="text-xs text-violet-700 mt-1">Open schedule →</p>
                  </div>
                </Link>
              )}
              {log.linkedRecurringWorkOrderId && (
                <Link href={`/admin-portal/recurring-work-orders/${log.linkedRecurringWorkOrderId}`} className="block">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 hover:border-emerald-400 transition-colors">
                    <p className="text-xs text-muted-foreground uppercase">Recurring WO</p>
                    <p className="font-semibold mt-0.5">{log.linkedRecurringWorkOrderId}</p>
                    <p className="text-xs text-emerald-700 mt-1">Open RWO →</p>
                  </div>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment method */}
        {(log.paymentMethodType || log.cardBrand || log.bankName) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Payment method</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                {log.paymentMethodType === 'us_bank_account'
                  ? <Building2 className="h-8 w-8 text-emerald-600 flex-shrink-0" />
                  : <CreditCard className="h-8 w-8 text-blue-600 flex-shrink-0" />}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Type" value={log.paymentMethodType || '—'} />
                  {log.cardBrand && (
                    <Field label="Card" value={`${log.cardBrand} ••${log.cardLast4 || '----'}`} />
                  )}
                  {log.bankName && (
                    <Field label="Bank" value={`${log.bankName} ••${log.bankLast4 || '----'}`} />
                  )}
                  {(log.cardExpMonth || log.cardExpYear) && (
                    <Field label="Expiry" value={`${log.cardExpMonth || '--'}/${log.cardExpYear || '--'}`} />
                  )}
                  {log.cardFunding && <Field label="Funding" value={log.cardFunding} />}
                  {log.cardCountry && <Field label="Country" value={log.cardCountry} />}
                  {log.bankAccountType && <Field label="Account type" value={log.bankAccountType} />}
                  {log.paymentMethodId && (
                    <Field label="PM id" value={log.paymentMethodId} mono small />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Risk (cards only) */}
        {(typeof log.riskScore === 'number' || log.riskLevel || log.outcomeReason) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Risk + outcome</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {typeof log.riskScore === 'number' && <Field label="Risk score" value={String(log.riskScore)} />}
                {log.riskLevel && <Field label="Risk level" value={log.riskLevel} />}
                {log.outcomeType && <Field label="Outcome type" value={log.outcomeType} />}
                {log.outcomeReason && <Field label="Outcome reason" value={log.outcomeReason} />}
                {log.outcomeNetwork && <Field label="Network" value={log.outcomeNetwork} />}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Failure analysis */}
        {(log.status === 'failed' || log.status === 'requires_action') && (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-base text-red-700 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Why this failed + what to do
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Failure code" value={log.failureCode || '—'} mono />
                <Field label="Decline code" value={log.declineCode || '—'} mono />
                <Field label="Category" value={log.declineCategory || '—'} />
              </div>
              {log.failureMessage && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs uppercase text-red-700 font-semibold mb-1">Stripe message</p>
                  <p className="text-sm text-red-800">{log.failureMessage}</p>
                </div>
              )}
              {log.possibleCauses && log.possibleCauses.length > 0 && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Possible causes</p>
                  <ul className="text-sm space-y-1 list-disc pl-5">
                    {log.possibleCauses.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
              {log.nextSteps && log.nextSteps.length > 0 && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Next steps</p>
                  <ul className="text-sm space-y-1 list-disc pl-5 text-foreground">
                    {log.nextSteps.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Record mutation cascade */}
        {log.recordMutations && log.recordMutations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ListTree className="h-5 w-5" />
                Records updated by this event
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {log.recordMutations.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded-lg border border-border bg-muted/20">
                    <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{m.summary}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        {m.collection}/{m.docId}
                        {m.field && <> · {m.field}</>}
                        {m.from && <> : {m.from} → {m.to}</>}
                        {!m.from && m.to && <> = {m.to}</>}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDateTime(toDate(m.at))}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* External artifacts */}
        {(log.receiptUrl || log.hostedInvoiceUrl || log.invoicePdfUrl) && (
          <Card>
            <CardHeader><CardTitle className="text-base">External artifacts</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {log.receiptUrl && (
                <a href={log.receiptUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4 mr-2" />Receipt</Button>
                </a>
              )}
              {log.hostedInvoiceUrl && (
                <a href={log.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4 mr-2" />Hosted invoice</Button>
                </a>
              )}
              {log.invoicePdfUrl && (
                <a href={log.invoicePdfUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4 mr-2" />Invoice PDF</Button>
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Raw payload (collapsible) */}
        {log.rawPayload && (
          <Card>
            <CardHeader>
              <button
                type="button"
                className="w-full flex items-center justify-between"
                onClick={() => setShowRaw(s => !s)}
              >
                <CardTitle className="text-base">Raw Stripe payload</CardTitle>
                {showRaw ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CardHeader>
            {showRaw && (
              <CardContent>
                <pre className="text-xs font-mono bg-muted/40 rounded-md p-3 overflow-x-auto max-h-[60vh] whitespace-pre">
                  {JSON.stringify(log.rawPayload, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

function Field({ label, value, mono, small }: { label: string; value: string | undefined | null; mono?: boolean; small?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
      <p className={`mt-0.5 ${mono ? 'font-mono' : 'font-medium'} ${small ? 'text-xs' : 'text-sm'} break-all`}>
        {value || '—'}
      </p>
    </div>
  );
}
