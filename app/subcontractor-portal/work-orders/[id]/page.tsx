'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { collection, doc, getDoc, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { formatMoney } from '@/lib/money';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ClipboardList, Calendar, MapPin, Stethoscope, FileText, Image as ImageIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { formatAddress } from '@/lib/utils';

import { PageContainer } from '@/components/ui/page-container';
interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  title?: string;
  description?: string;
  category?: string;
  priority?: string;
  status?: string;
  estimateBudget?: number;
  clientName?: string;
  locationName?: string;
  locationAddress?: any;
  images?: string[];
  scheduledServiceDate?: any;
  scheduledServiceTime?: string;
  diagnosticFee?: number;
  diagnosticResults?: string;
  diagnosticResultsImages?: string[];
  diagnosticResultsBy?: { id: string; name: string };
  diagnosticResultsSubmittedAt?: any;
  completedAt?: any;
  completionNotes?: string;
  completionImages?: string[];
}

interface QuoteSummary {
  id: string;
  isDiagnosticQuote?: boolean;
  status?: string;
  totalAmount?: number;
  diagnosticFee?: number;
  proposedServiceDate?: any;
  proposedServiceTime?: string;
  notes?: string;
  createdAt?: any;
  lineItems?: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
}

const formatDate = (val: any): string => {
  if (!val) return '—';
  const d: Date | null = val instanceof Date ? val : (val as Timestamp)?.toDate?.() ?? null;
  return d ? d.toLocaleDateString() : '—';
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  bidding: 'Bidding',
  quotes_received: 'Quotes Received',
  diagnostic_accepted: 'Diagnostic Accepted',
  diagnostic_submitted: 'Diagnostic Submitted',
  diagnostic_results_submitted: 'Results Submitted',
  scheduled: 'Scheduled',
  assigned: 'Assigned',
  accepted_by_subcontractor: 'Accepted',
  pending_invoice: 'Pending Invoice',
  completed: 'Completed',
  archived: 'Archived',
  rejected: 'Rejected',
};

export default function SubWorkOrderDetail() {
  const params = useParams();
  const workOrderId = String(params?.id || '');
  const { db, auth } = useFirebaseInstance();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    let unsubWO: (() => void) | null = null;
    let unsubQuotes: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user || !workOrderId) {
        setLoading(false);
        return;
      }

      // workOrders read access requires sub to be on the doc — read once + subscribe
      try {
        const initial = await getDoc(doc(db, 'workOrders', workOrderId));
        if (initial.exists()) {
          setWorkOrder({ id: initial.id, ...initial.data() } as WorkOrder);
        }
      } catch (err) {
        console.warn('Initial work order fetch failed:', err);
      }

      unsubWO = onSnapshot(
        doc(db, 'workOrders', workOrderId),
        (snap) => {
          if (snap.exists()) setWorkOrder({ id: snap.id, ...snap.data() } as WorkOrder);
          setLoading(false);
        },
        (err) => {
          console.warn('Work order subscription error:', err);
          setLoading(false);
        },
      );

      unsubQuotes = onSnapshot(
        query(
          collection(db, 'quotes'),
          where('workOrderId', '==', workOrderId),
          where('subcontractorId', '==', user.uid),
        ),
        (snap) => {
          setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() })) as QuoteSummary[]);
        },
        (err) => {
          console.warn('Quotes subscription error:', err);
        },
      );
    });

    return () => {
      unsubAuth();
      unsubWO?.();
      unsubQuotes?.();
    };
  }, [auth, db, workOrderId]);

  const diagnosticQuote = quotes.find(q => q.isDiagnosticQuote);
  const repairQuotes = quotes.filter(q => !q.isDiagnosticQuote);

  if (loading) {
    return (
      <SubcontractorLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </SubcontractorLayout>
    );
  }

  if (!workOrder) {
    return (
      <SubcontractorLayout>
        <PageContainer>
          <Card className="rounded-2xl border border-border shadow-sm">
            <CardContent className="p-8 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Work order not found or you no longer have access.</p>
              <Link href="/subcontractor-portal/assigned" className="inline-block mt-4">
                <Button variant="outline" className="h-9 rounded-xl gap-1.5">
                  <ArrowLeft className="h-4 w-4" /> Back to Assigned Jobs
                </Button>
              </Link>
            </CardContent>
          </Card>
        </PageContainer>
      </SubcontractorLayout>
    );
  }

  const status = workOrder.status || '';
  const statusLabel = STATUS_LABELS[status] || status;

  return (
    <SubcontractorLayout>
      <PageContainer>
        <PageHeader
          title="Work Order Details"
          subtitle={workOrder.workOrderNumber ? `Work Order: ${workOrder.workOrderNumber}` : workOrder.title}
          icon={ClipboardList}
          iconClassName="text-blue-600"
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/subcontractor-portal/assigned">
                <Button variant="outline" className="h-10 rounded-xl px-4 font-semibold gap-1.5">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              </Link>
            </div>
          }
        />

        {/* Overview */}
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {workOrder.title || 'Work Order'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workOrder.workOrderNumber && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Work Order #</p>
                  <p className="text-sm font-semibold text-foreground">{workOrder.workOrderNumber}</p>
                </div>
              )}
              {statusLabel && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Status</p>
                  <p className="text-sm font-semibold text-foreground capitalize">{statusLabel}</p>
                </div>
              )}
              {workOrder.category && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Category</p>
                  <p className="text-sm text-foreground">{workOrder.category}</p>
                </div>
              )}
              {workOrder.priority && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Priority</p>
                  <p className="text-sm text-foreground capitalize">{workOrder.priority}</p>
                </div>
              )}
              {workOrder.estimateBudget != null && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Estimate Budget</p>
                  <p className="text-sm text-foreground">{formatMoney(workOrder.estimateBudget)}</p>
                </div>
              )}
              {workOrder.clientName && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Client</p>
                  <p className="text-sm text-foreground">{workOrder.clientName}</p>
                </div>
              )}
              {workOrder.locationName && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> Location
                  </p>
                  <p className="text-sm text-foreground">{workOrder.locationName}</p>
                  {workOrder.locationAddress && (
                    <p className="text-xs text-muted-foreground">{formatAddress(workOrder.locationAddress)}</p>
                  )}
                </div>
              )}
              {(workOrder.scheduledServiceDate || workOrder.scheduledServiceTime) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> Scheduled Service
                  </p>
                  <p className="text-sm text-foreground">
                    {workOrder.scheduledServiceDate ? formatDate(workOrder.scheduledServiceDate) : '—'}
                    {workOrder.scheduledServiceTime ? ` at ${workOrder.scheduledServiceTime}` : ''}
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

            {Array.isArray(workOrder.images) && workOrder.images.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" /> Attachments ({workOrder.images.length})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {workOrder.images.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => { setLightboxImages(workOrder.images || []); setLightboxIndex(idx); }}
                      className="block rounded-lg overflow-hidden border border-border hover:border-blue-400 transition-colors cursor-pointer"
                    >
                      <img src={url} alt={`Attachment ${idx + 1}`} className="w-full h-24 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagnostic Request */}
        {diagnosticQuote && (
          <Card className="rounded-2xl border border-indigo-200/60 shadow-sm bg-indigo-50/40 dark:bg-indigo-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                <Stethoscope className="h-5 w-5" />
                Diagnostic Request
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Diagnostic Fee</p>
                  <p className="text-sm font-semibold text-indigo-700">
                    {formatMoney(diagnosticQuote.diagnosticFee ?? diagnosticQuote.totalAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Status</p>
                  <p className="text-sm font-semibold text-foreground capitalize">{(diagnosticQuote.status || '').replace(/_/g, ' ')}</p>
                </div>
                {diagnosticQuote.proposedServiceDate && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Proposed Service</p>
                    <p className="text-sm text-foreground">
                      {formatDate(diagnosticQuote.proposedServiceDate)}
                      {diagnosticQuote.proposedServiceTime ? ` at ${diagnosticQuote.proposedServiceTime}` : ''}
                    </p>
                  </div>
                )}
                {diagnosticQuote.createdAt && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Submitted</p>
                    <p className="text-sm text-foreground">{formatDate(diagnosticQuote.createdAt)}</p>
                  </div>
                )}
              </div>
              {diagnosticQuote.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap bg-white/70 rounded-lg p-3">{diagnosticQuote.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Diagnostic Results */}
        {workOrder.diagnosticResults && (
          <Card className="rounded-2xl border border-indigo-200/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                <Stethoscope className="h-5 w-5" />
                Diagnostic Results
                {workOrder.diagnosticResultsBy?.name && (
                  <span className="text-xs font-normal text-muted-foreground">— {workOrder.diagnosticResultsBy.name}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap">{workOrder.diagnosticResults}</p>
              {Array.isArray(workOrder.diagnosticResultsImages) && workOrder.diagnosticResultsImages.length > 0 && (
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {workOrder.diagnosticResultsImages.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => { setLightboxImages(workOrder.diagnosticResultsImages || []); setLightboxIndex(idx); }}
                      className="block rounded-lg overflow-hidden border border-border hover:border-indigo-400 transition-colors cursor-pointer"
                    >
                      <img src={url} alt={`Diagnostic result ${idx + 1}`} className="h-20 w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Repair / Direct Quotes */}
        {repairQuotes.length > 0 && (
          <Card className="rounded-2xl border border-emerald-200/60 shadow-sm bg-emerald-50/40 dark:bg-emerald-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
                <FileText className="h-5 w-5" />
                Quote ({repairQuotes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {repairQuotes.map((q) => (
                <div key={q.id} className="rounded-xl bg-white/70 border border-emerald-200/60 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-foreground">
                      Total: {formatMoney(q.totalAmount)}
                    </p>
                    <p className="text-xs font-semibold text-muted-foreground capitalize">
                      {(q.status || '').replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {q.proposedServiceDate && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Proposed Service</p>
                        <p className="text-foreground">
                          {formatDate(q.proposedServiceDate)}
                          {q.proposedServiceTime ? ` at ${q.proposedServiceTime}` : ''}
                        </p>
                      </div>
                    )}
                    {q.createdAt && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Submitted</p>
                        <p className="text-foreground">{formatDate(q.createdAt)}</p>
                      </div>
                    )}
                  </div>
                  {Array.isArray(q.lineItems) && q.lineItems.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Line Items</p>
                      <div className="space-y-1">
                        {q.lineItems.map((li, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-foreground">{li.description} ({li.quantity} × ${Number(li.unitPrice).toFixed(2)})</span>
                            <span className="font-semibold tabular-nums">{formatMoney(li.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {q.notes && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{q.notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Completion */}
        {(workOrder.completedAt || workOrder.completionNotes || (Array.isArray(workOrder.completionImages) && workOrder.completionImages.length > 0)) && (
          <Card className="rounded-2xl border border-emerald-200/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
                <FileText className="h-5 w-5" />
                Completion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {workOrder.completedAt && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Completed</p>
                  <p className="text-sm text-foreground">{formatDate(workOrder.completedAt)}</p>
                </div>
              )}
              {workOrder.completionNotes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{workOrder.completionNotes}</p>
                </div>
              )}
              {Array.isArray(workOrder.completionImages) && workOrder.completionImages.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Completion Images</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {workOrder.completionImages.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => { setLightboxImages(workOrder.completionImages || []); setLightboxIndex(idx); }}
                        className="block rounded-lg overflow-hidden border border-border hover:border-emerald-400 transition-colors cursor-pointer"
                      >
                        <img src={url} alt={`Completion ${idx + 1}`} className="h-20 w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </PageContainer>

      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}
    </SubcontractorLayout>
  );
}
