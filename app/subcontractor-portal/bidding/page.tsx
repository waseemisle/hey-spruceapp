'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, serverTimestamp, updateDoc, Timestamp } from 'firebase/firestore';
import { createQuoteTimelineEvent } from '@/lib/timeline';
import { notifyQuoteSubmission, notifyAdminsOfBiddingRejection, notifyDiagnosticResultsSubmitted } from '@/lib/notifications';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { formatMoney } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClipboardList, Calendar, MapPin, Search, Stethoscope, FileText, X, Plus, Trash2, ChevronLeft, ChevronRight, Clock, Receipt, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { formatAddress } from '@/lib/utils';
import { PortalListPage } from '@/components/ui/portal-list-page';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';
import { ImageLightbox } from '@/components/ui/image-lightbox';


// Predefined service time slots the subcontractor picks from. The chosen
// label is stored verbatim on the quote and shown to client + admin
// (e.g. "Proposed Date Apr 25 at 8:00 AM - 10:00 AM").
// Diagnostic visits use 1-hour slots; full repair quotes use wider 2-hour windows.
const DIAGNOSTIC_TIME_SLOTS = [
  '12:00 AM - 1:00 AM',
  '1:00 AM - 2:00 AM',
  '2:00 AM - 3:00 AM',
  '3:00 AM - 4:00 AM',
  '4:00 AM - 5:00 AM',
  '5:00 AM - 6:00 AM',
  '6:00 AM - 7:00 AM',
  '7:00 AM - 8:00 AM',
  '8:00 AM - 9:00 AM',
  '9:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM',
  '11:00 AM - 12:00 PM',
  '12:00 PM - 1:00 PM',
  '1:00 PM - 2:00 PM',
  '2:00 PM - 3:00 PM',
  '3:00 PM - 4:00 PM',
  '4:00 PM - 5:00 PM',
  '5:00 PM - 6:00 PM',
  '6:00 PM - 7:00 PM',
  '7:00 PM - 8:00 PM',
  '8:00 PM - 9:00 PM',
  '9:00 PM - 10:00 PM',
  '10:00 PM - 11:00 PM',
  '11:00 PM - 12:00 AM',
] as const;
const SERVICE_TIME_SLOTS = [
  '12:00 AM - 2:00 AM',
  '2:00 AM - 4:00 AM',
  '4:00 AM - 6:00 AM',
  '6:00 AM - 8:00 AM',
  '8:00 AM - 10:00 AM',
  '10:00 AM - 12:00 PM',
  '12:00 PM - 2:00 PM',
  '2:00 PM - 4:00 PM',
  '4:00 PM - 6:00 PM',
  '6:00 PM - 8:00 PM',
  '8:00 PM - 10:00 PM',
  '10:00 PM - 12:00 AM',
] as const;

// ─── Schedule picker (Calendly-style date strip + time-slot grid) ───
type Accent = 'indigo' | 'emerald';

const ACCENT: Record<Accent, {
  ring: string;
  pillIdle: string;
  pillSelected: string;
  panelBg: string;
  panelBorder: string;
  divider: string;
  text: string;
}> = {
  indigo: {
    ring: 'focus-visible:ring-indigo-500',
    pillIdle: 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300',
    pillSelected: 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/25',
    panelBg: 'bg-white/70',
    panelBorder: 'border-indigo-200/60',
    divider: 'border-indigo-200/60',
    text: 'text-indigo-700',
  },
  emerald: {
    ring: 'focus-visible:ring-emerald-500',
    pillIdle: 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300',
    pillSelected: 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25',
    panelBg: 'bg-white/70',
    panelBorder: 'border-emerald-200/60',
    divider: 'border-emerald-200/60',
    text: 'text-emerald-700',
  },
};

// "YYYY-MM-DD" in LOCAL time (avoids the UTC-shift bug from toISOString).
const toLocalIso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function DateStrip({ value, onChange, accent }: { value: string; onChange: (iso: string) => void; accent: Accent }) {
  const styles = ACCENT[accent];
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const todayIso = toLocalIso(today);

  const [weekStart, setWeekStart] = useState<Date>(() => {
    if (value) {
      const [y, m, d] = value.split('-').map(Number);
      const picked = new Date(y, (m || 1) - 1, d || 1);
      picked.setHours(0, 0, 0, 0);
      return picked;
    }
    return today;
  });

  const days = useMemo<Date[]>(
    () => Array.from({ length: 7 }, (_: unknown, i: number) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }),
    [weekStart],
  );

  return (
    <>
      {/* Mobile: native date input — always fits, no overflow */}
      <input
        type="date"
        className={`sm:hidden w-full h-12 rounded-xl border ${styles.panelBorder} bg-white px-4 text-base font-semibold text-foreground focus:outline-none focus-visible:ring-2 ${styles.ring}`}
        value={value || todayIso}
        onChange={(e) => onChange(e.target.value)}
      />

      {/* sm+: visual week strip */}
      <div className="hidden sm:flex items-center gap-2">
        <button
          type="button"
          onClick={() => { const prev = new Date(weekStart); prev.setDate(prev.getDate() - 7); setWeekStart(prev); }}
          aria-label="Previous week"
          className="h-10 w-10 shrink-0 rounded-xl border border-border bg-white flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 grid grid-cols-7 gap-1.5 rounded-2xl border border-border bg-white p-1.5">
          {days.map((d) => {
            const iso = toLocalIso(d);
            const isSelected = value === iso;
            return (
              <button
                type="button"
                key={iso}
                onClick={() => onChange(iso)}
                aria-pressed={isSelected}
                className={`flex flex-col items-center justify-center rounded-xl px-1 py-2.5 text-center transition-all ${isSelected ? styles.pillSelected + ' border-transparent' : 'bg-white text-foreground hover:bg-muted'}`}
              >
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}>
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className="text-lg font-bold leading-none mt-1 tabular-nums">{d.getDate()}</span>
                <span className={`text-[10px] font-medium mt-0.5 ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}>
                  {d.toLocaleDateString('en-US', { month: 'short' })}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => { const next = new Date(weekStart); next.setDate(next.getDate() + 7); setWeekStart(next); }}
          aria-label="Next week"
          className="h-10 w-10 shrink-0 rounded-xl border border-border bg-white flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

function TimeSlotGrid({ slots, value, onChange, accent, columns = 3 }: { slots: readonly string[]; value: string; onChange: (slot: string) => void; accent: Accent; columns?: 3 | 4 }) {
  const styles = ACCENT[accent];
  /** 24× 1-hour labels need 1 column on very small screens; 12× 2-hour labels still overflow in 2-up below ~380px. */
  const manySlots = slots.length > 12;
  const gridCols = manySlots
    ? 'grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
    : columns === 4
      ? 'grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
      : 'grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

  return (
    <div className={`grid w-full min-w-0 ${gridCols} gap-2`}>
      {slots.map((slot) => {
        const isSelected = value === slot;
        return (
          <button
            type="button"
            key={slot}
            onClick={() => onChange(slot)}
            aria-pressed={isSelected}
            className={`min-h-[2.75rem] min-w-0 w-full max-w-full break-words rounded-lg border px-2 py-2 text-center text-[10px] font-semibold leading-snug tabular-nums transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 sm:rounded-xl sm:px-2.5 sm:py-2.5 sm:text-xs sm:leading-tight ${styles.ring} ${isSelected ? styles.pillSelected : styles.pillIdle}`}
          >
            {slot}
          </button>
        );
      })}
    </div>
  );
}

function SchedulePicker({
  date, onDateChange, time, onTimeChange, slots, accent, durationLabel, slotColumns,
}: {
  date: string; onDateChange: (iso: string) => void; time: string; onTimeChange: (slot: string) => void;
  slots: readonly string[]; accent: Accent; durationLabel: string; slotColumns?: 3 | 4;
}) {
  const styles = ACCENT[accent];
  return (
    <div className={`min-w-0 max-w-full overflow-hidden rounded-2xl border ${styles.panelBorder} ${styles.panelBg} p-3 sm:p-4 space-y-3 sm:space-y-4`}>
      <div>
        <p className="text-xs sm:text-sm font-semibold text-foreground mb-2">Pick a service date</p>
        <DateStrip value={date} onChange={onDateChange} accent={accent} />
      </div>
      <div className={`border-t border-dashed ${styles.divider}`} />
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <p className="text-xs sm:text-sm font-semibold text-foreground">Select a time slot</p>
          <span className={`text-[11px] sm:text-xs font-medium flex items-center gap-1 ${styles.text}`}>
            <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            {durationLabel}
          </span>
        </div>
        <TimeSlotGrid slots={slots} value={time} onChange={onTimeChange} accent={accent} columns={slotColumns} />
      </div>
    </div>
  );
}

interface WoDetail {
  id: string;
  workOrderNumber?: string;
  title?: string;
  category?: string;
  description?: string;
  priority?: string;
  locationName?: string;
  locationAddress?: string;
  status?: string;
  images?: string[];
}

interface BiddingWorkOrder {
  id: string;
  workOrderId?: string;
  workOrderIds?: string[];
  workOrderGroupId?: string;
  groupId?: string;
  workOrderNumber?: string;
  workOrderDetails?: WoDetail[];
  workOrderTitle: string;
  workOrderDescription: string;
  clientId: string;
  clientName: string;
  priority: string;
  category: string;
  locationName: string;
  locationAddress: string;
  images?: string[];
  estimateBudget?: number;
  /**
   * Bidding lifecycle:
   *  - 'pending'                       → nothing submitted yet; all 4 actions visible
   *  - 'diagnostic_requested'          → diagnostic request submitted, awaiting client
   *  - 'diagnostic_accepted'           → client approved the diagnostic; sub now submits Diagnostic Results
   *  - 'diagnostic_results_submitted'  → results submitted; sub can now Submit Quote
   *  - 'diagnostic_rejected'           → client rejected the diagnostic
   *  - 'quoted'                        → full quote submitted (direct path or post-diagnostic)
   *  - 'rejected'                      → sub rejected the opportunity
   */
  status: string;
  diagnosticFee?: number;
  rejectionReason?: string;
  diagnosticResults?: string;
  diagnosticResultsImages?: string[];
  diagnosticResultsSubmittedAt?: any;
  sharedAt: any;
  // Denormalized from companies/{companyId}.allowSubDirectInvoiceFromBidding at share time.
  // Controls whether the "Submit Invoice" path is shown in the UI.
  allowSubDirectInvoiceFromBidding?: boolean;
}

export default function SubcontractorBidding() {
  const { auth, db } = useFirebaseInstance();
  const [biddingWorkOrders, setBiddingWorkOrders] = useState<BiddingWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBidding, setSelectedBidding] = useState<BiddingWorkOrder | null>(null);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [viewWorkOrder, setViewWorkOrder] = useState<BiddingWorkOrder | null>(null);
  const [workOrderImages, setWorkOrderImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [quoteForm, setQuoteForm] = useState({
    proposedServiceDate: '',
    proposedServiceTime: '',
    notes: '',
  });

  /** Diagnostic fee for the initial visit — subcontractor bids this amount. Default $69. */
  const [diagnosticFee, setDiagnosticFee] = useState<string>('');

  // ─── Submit Diagnostic Results (after client accepts the diagnostic) ───
  const [showResultsForm, setShowResultsForm] = useState(false);
  const [resultsBidding, setResultsBidding] = useState<BiddingWorkOrder | null>(null);
  const [resultsText, setResultsText] = useState('');
  const [resultsImages, setResultsImages] = useState<string[]>([]);
  const [resultsSubmitting, setResultsSubmitting] = useState(false);
  const [uploadingResultsImages, setUploadingResultsImages] = useState(false);

  // ─── Direct Submit Quote (no diagnostic) ───
  const [showDirectQuoteForm, setShowDirectQuoteForm] = useState(false);
  const [directQuoteLineItems, setDirectQuoteLineItems] = useState<Array<{ description: string; quantity: number; unitPrice: number; amount: number }>>([
    { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
    { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
  ]);
  const [directQuoteNotes, setDirectQuoteNotes] = useState('');
  const [directQuoteServiceDate, setDirectQuoteServiceDate] = useState('');
  const [directQuoteServiceTime, setDirectQuoteServiceTime] = useState('');
  const [directQuoteSubmitting, setDirectQuoteSubmitting] = useState(false);

  // ─── Reject Quote Request ───
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  // ─── Edit permissions (loaded from subcontractorEditPermissions/{uid}) ───
  const [editPerms, setEditPerms] = useState({ canEditInvoice: false, canEditQuote: false, canEditDiagnostic: false });

  // ─── Edit mode flags ───
  const [isDiagnosticEdit, setIsDiagnosticEdit] = useState(false);
  const [isDiagnosticResultsEdit, setIsDiagnosticResultsEdit] = useState(false);

  // ─── Direct Invoice (bypass quote — only for companies with allowSubDirectInvoiceFromBidding) ───
  // eligibleDirectInvoiceIds: server-verified fallback for biddingWorkOrders docs created
  // before the allowSubDirectInvoiceFromBidding field was denormalized at share time.
  const [eligibleDirectInvoiceIds, setEligibleDirectInvoiceIds] = useState<Set<string>>(new Set());
  const [showDirectInvoiceForm, setShowDirectInvoiceForm] = useState(false);
  const [directInvoiceBidding, setDirectInvoiceBidding] = useState<BiddingWorkOrder | null>(null);
  const [directInvoiceLineItems, setDirectInvoiceLineItems] = useState<Array<{ description: string; quantity: number; unitPrice: number; amount: number }>>([
    { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
    { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
  ]);
  const [directInvoiceNotes, setDirectInvoiceNotes] = useState('');
  const [directInvoiceSubmitting, setDirectInvoiceSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Load edit permissions from Firestore (fire-and-forget; non-blocking)
        getDoc(doc(db, 'subcontractorEditPermissions', user.uid))
          .then(snap => {
            if (snap.exists()) {
              const d = snap.data() as any;
              setEditPerms({
                canEditInvoice: d.canEditInvoice ?? false,
                canEditQuote: d.canEditQuote ?? false,
                canEditDiagnostic: d.canEditDiagnostic ?? false,
              });
            }
          })
          .catch(console.error);

        // Fetch all active bidding rows for this sub; filter client-side so we
        // can show in-progress/accepted/rejected states without a composite
        // index on (subcontractorId, status, sharedAt).
        const biddingQuery = query(
          collection(db, 'biddingWorkOrders'),
          where('subcontractorId', '==', user.uid),
        );

        const unsubscribeSnapshot = onSnapshot(
          biddingQuery,
          (snapshot) => {
            const biddingData = snapshot.docs
              .map(d => ({ id: d.id, ...d.data() })) as BiddingWorkOrder[];
            // Show everything except rejected. Keep 'quoted' so subs with edit
            // permission can update their quote.
            const visible = biddingData
              .filter(b => b.status !== 'rejected')
              .sort((a, b) => (b.sharedAt?.toMillis?.() ?? 0) - (a.sharedAt?.toMillis?.() ?? 0));
            setBiddingWorkOrders(visible);
            setLoading(false);
          },
          (error) => {
            console.error('Bidding query error:', error);
            setLoading(false);
          }
        );

        return () => unsubscribeSnapshot();
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db]);

  // For biddingWorkOrders docs that pre-date the allowSubDirectInvoiceFromBidding field,
  // do a server-side eligibility check so the Submit Invoice button still appears.
  useEffect(() => {
    const unchecked = biddingWorkOrders.filter(
      b => b.status === 'pending' && !b.allowSubDirectInvoiceFromBidding && !eligibleDirectInvoiceIds.has(b.id),
    );
    if (unchecked.length === 0) return;

    const ids = unchecked.map(b => b.id).join(',');
    auth.currentUser?.getIdToken().then(token =>
      fetch(`/api/bidding/direct-invoice-eligible?ids=${ids}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(({ eligibleIds }: { eligibleIds: string[] }) => {
          if (eligibleIds.length > 0) {
            setEligibleDirectInvoiceIds(prev => new Set([...prev, ...eligibleIds]));
          }
        })
        .catch(console.error),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biddingWorkOrders]);

  // Fetch images from original work order if bidding doc doesn't have them
  useEffect(() => {
    if (!viewWorkOrder) {
      setWorkOrderImages([]);
      return;
    }
    if (viewWorkOrder.images && viewWorkOrder.images.length > 0) {
      setWorkOrderImages(viewWorkOrder.images);
      return;
    }
    // Fetch from original work order
    const fetchImages = async () => {
      try {
        const primaryId = viewWorkOrder.workOrderId || viewWorkOrder.workOrderIds?.[0];
        if (!primaryId) return;
        const woDoc = await getDoc(doc(db, 'workOrders', primaryId));
        if (woDoc.exists()) {
          const imgs = woDoc.data()?.images || [];
          setWorkOrderImages(imgs);
        }
      } catch (err) {
        console.error('Could not fetch work order images:', err);
      }
    };
    fetchImages();
  }, [viewWorkOrder, db]);

  const handleQuoteFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setQuoteForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // ─── Direct Submit Quote helpers ───
  const openDirectQuoteForm = (bidding: BiddingWorkOrder) => {
    setSelectedBidding(bidding);
    // If the client has already approved the diagnostic fee for this WO, the
    // sub's repair quote should include it as a pre-filled line item.
    const pinnedDiagFee = Number(bidding.diagnosticFee ?? 0);
    if ((bidding.status === 'diagnostic_accepted' || bidding.status === 'diagnostic_results_submitted') && pinnedDiagFee > 0) {
      setDirectQuoteLineItems([
        { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
        { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
        { description: 'Diagnostic Visit', quantity: 1, unitPrice: pinnedDiagFee, amount: pinnedDiagFee },
      ]);
    } else {
      setDirectQuoteLineItems([
        { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
        { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
      ]);
    }
    setDirectQuoteNotes('');
    setDirectQuoteServiceDate('');
    setDirectQuoteServiceTime('');
    setShowDirectQuoteForm(true);
  };

  const openEditQuoteForm = async (bidding: BiddingWorkOrder) => {
    setSelectedBidding(bidding);
    const quoteId = (bidding as any).quoteId;
    if (quoteId) {
      try {
        const qSnap = await getDoc(doc(db, 'quotes', quoteId));
        if (qSnap.exists()) {
          const d = qSnap.data() as any;
          setDirectQuoteLineItems(d.lineItems?.length ? d.lineItems : [
            { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
          ]);
          setDirectQuoteNotes(d.notes || '');
          const dateObj = d.proposedServiceDate?.toDate?.() || (d.proposedServiceDate ? new Date(d.proposedServiceDate) : null);
          setDirectQuoteServiceDate(dateObj ? dateObj.toISOString().split('T')[0] : '');
          setDirectQuoteServiceTime(d.proposedServiceTime || '');
        }
      } catch (err) {
        console.error('Could not load quote for edit:', err);
      }
    }
    setShowDirectQuoteForm(true);
  };

  // ─── Submit Diagnostic Results helpers ───
  const openResultsForm = (bidding: BiddingWorkOrder, isEdit = false) => {
    setResultsBidding(bidding);
    setResultsText(bidding.diagnosticResults || '');
    setResultsImages(bidding.diagnosticResultsImages || []);
    setIsDiagnosticResultsEdit(isEdit);
    setShowResultsForm(true);
  };

  const handleResultsImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingResultsImages(true);
    try {
      const { uploadMultipleToCloudinary } = await import('@/lib/cloudinary-upload');
      const urls = await uploadMultipleToCloudinary(files);
      setResultsImages(prev => [...prev, ...urls]);
    } catch (error: any) {
      console.error('Error uploading diagnostic results images:', error);
      toast.error(error?.message || 'Failed to upload images');
    } finally {
      setUploadingResultsImages(false);
      e.target.value = '';
    }
  };

  const removeResultsImage = (idx: number) => {
    setResultsImages(prev => prev.filter((_, i) => i !== idx));
  };

  // ─── Direct Invoice helpers ───
  const openDirectInvoiceForm = (bidding: BiddingWorkOrder) => {
    setDirectInvoiceBidding(bidding);
    setDirectInvoiceLineItems([
      { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
      { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
    ]);
    setDirectInvoiceNotes('');
    setShowDirectInvoiceForm(true);
  };

  const openEditInvoiceForm = async (bidding: BiddingWorkOrder) => {
    setDirectInvoiceBidding(bidding);
    const invoiceId = (bidding as any).directInvoiceId;
    if (invoiceId) {
      try {
        const invSnap = await getDoc(doc(db, 'invoices', invoiceId));
        if (invSnap.exists()) {
          const d = invSnap.data() as any;
          setDirectInvoiceLineItems(d.lineItems?.length ? d.lineItems : [
            { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
          ]);
          setDirectInvoiceNotes(d.notes || '');
        }
      } catch (err) {
        console.error('Could not load invoice for edit:', err);
        setDirectInvoiceLineItems([{ description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 }]);
        setDirectInvoiceNotes('');
      }
    }
    setShowDirectInvoiceForm(true);
  };

  const updateDirectInvoiceLineItem = (idx: number, field: 'description' | 'quantity' | 'unitPrice' | 'amount', value: string) => {
    setDirectInvoiceLineItems(prev => {
      const next = [...prev];
      const item = { ...next[idx] };
      if (field === 'description') item.description = value;
      else {
        const num = parseFloat(value) || 0;
        if (field === 'quantity') { item.quantity = num; item.amount = parseFloat((num * item.unitPrice).toFixed(2)); }
        else if (field === 'unitPrice') { item.unitPrice = num; item.amount = parseFloat((item.quantity * num).toFixed(2)); }
        else if (field === 'amount') { item.amount = num; }
      }
      next[idx] = item;
      return next;
    });
  };
  const addDirectInvoiceLineItem = () => setDirectInvoiceLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  const removeDirectInvoiceLineItem = (idx: number) => setDirectInvoiceLineItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  const directInvoiceTotal = directInvoiceLineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0);

  const handleSubmitDirectInvoice = async () => {
    if (!directInvoiceBidding) return;
    const validItems = directInvoiceLineItems.filter(li => li.description.trim() && Number(li.amount) > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one line item with a description and amount');
      return;
    }
    if (directInvoiceTotal <= 0) {
      toast.error('Invoice total must be greater than zero');
      return;
    }
    setDirectInvoiceSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const primaryWorkOrderId = directInvoiceBidding.workOrderId || directInvoiceBidding.workOrderIds?.[0];
      if (!primaryWorkOrderId) {
        toast.error('This bidding item is missing a work order reference.');
        return;
      }

      const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
      const subData = subDoc.exists() ? subDoc.data() : {};
      const subName = (subData as any).fullName || (subData as any).businessName || 'Subcontractor';

      const idToken = await currentUser.getIdToken();
      const isEditMode = directInvoiceBidding.status === 'direct_invoice_submitted';
      const existingInvoiceId = isEditMode ? (directInvoiceBidding as any).directInvoiceId : undefined;

      const res = await fetch('/api/work-orders/bidding-direct-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          biddingWorkOrderId: directInvoiceBidding.id,
          workOrderId: primaryWorkOrderId,
          lineItems: validItems,
          notes: directInvoiceNotes,
          totalAmount: directInvoiceTotal,
          subName,
          ...(existingInvoiceId ? { existingInvoiceId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as any).error || 'Failed to submit invoice');
        return;
      }

      const data = await res.json();

      if (!isEditMode) {
        // Fire-and-forget: notify admins that a direct invoice arrived.
        void (async () => {
          try {
            await fetch('/api/email/send-quote-notification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              keepalive: true,
              body: JSON.stringify({
                notifyAdmins: true,
                workOrderNumber: directInvoiceBidding.workOrderNumber || primaryWorkOrderId,
                workOrderTitle: directInvoiceBidding.workOrderTitle,
                subcontractorName: subName,
                quoteAmount: directInvoiceTotal,
                category: directInvoiceBidding.category || '',
                locationName: directInvoiceBidding.locationName || '',
                priority: directInvoiceBidding.priority || '',
                description: directInvoiceBidding.workOrderDescription || '',
              }),
            });
          } catch (err) {
            console.error('[bidding] Direct invoice admin notification failed:', err);
          }
        })();
      }

      toast.success(isEditMode ? 'Invoice updated successfully!' : `Invoice ${(data as any).invoiceNumber} submitted successfully!`);
      setShowDirectInvoiceForm(false);
      setDirectInvoiceBidding(null);
      setDirectInvoiceLineItems([
        { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
        { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
      ]);
      setDirectInvoiceNotes('');
    } catch (error) {
      console.error('Error submitting direct invoice:', error);
      toast.error('Failed to submit invoice');
    } finally {
      setDirectInvoiceSubmitting(false);
    }
  };

  const handleSubmitResults = async () => {
    if (!resultsBidding) return;
    const trimmed = resultsText.trim();
    if (!trimmed) {
      toast.error('Please describe the diagnostic results.');
      return;
    }
    setResultsSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('You must be signed in to submit results.');
        return;
      }
      const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
      const subData = subDoc.exists() ? subDoc.data() : {};
      const subName = (subData as any).fullName || (subData as any).businessName || 'Subcontractor';

      // 1) Update the bidding card
      await updateDoc(doc(db, 'biddingWorkOrders', resultsBidding.id), {
        ...(isDiagnosticResultsEdit ? {} : { status: 'diagnostic_results_submitted', diagnosticResultsSubmittedAt: serverTimestamp() }),
        diagnosticResults: trimmed,
        diagnosticResultsImages: resultsImages,
        ...(isDiagnosticResultsEdit
          ? { diagnosticResultsEditedAt: serverTimestamp(), diagnosticResultsEditedBy: subName }
          : {}),
        updatedAt: serverTimestamp(),
      });

      // 2) Mirror onto the parent work order so admin + client see it
      try {
        const primaryId = resultsBidding.workOrderId || resultsBidding.workOrderIds?.[0];
        if (!primaryId) throw new Error('Missing workOrderId');
        const workOrderRef = doc(db, 'workOrders', primaryId);
        const workOrderSnap = await getDoc(workOrderRef);
        if (workOrderSnap.exists()) {
          const woData = workOrderSnap.data();
          const existingTimeline = woData?.timeline || [];
          const woTimelineEvent = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Timestamp.now(),
            type: 'diagnostic_results_submitted',
            userId: currentUser.uid,
            userName: subName,
            userRole: 'subcontractor',
            details: `Diagnostic results submitted by ${subName}.`,
            metadata: {
              biddingWorkOrderId: resultsBidding.id,
              imageCount: resultsImages.length,
            },
          };
          await updateDoc(workOrderRef, {
            diagnosticResults: trimmed,
            diagnosticResultsImages: resultsImages,
            diagnosticResultsSubmittedAt: serverTimestamp(),
            diagnosticResultsBy: { id: currentUser.uid, name: subName },
            updatedAt: serverTimestamp(),
            timeline: [...existingTimeline, woTimelineEvent],
          });
        }
      } catch (workOrderUpdateError) {
        console.warn('Could not mirror diagnostic results onto work order:', workOrderUpdateError);
      }

      if (!isDiagnosticResultsEdit) {
        const diagTok = await auth.currentUser?.getIdToken().catch(() => undefined);
        notifyDiagnosticResultsSubmitted(
          resultsBidding.workOrderId || resultsBidding.workOrderIds?.[0] || '',
          resultsBidding.workOrderNumber || resultsBidding.workOrderId || resultsBidding.workOrderIds?.[0] || '',
          subName,
          resultsBidding.clientId || null,
          diagTok,
        ).catch(console.error);
      }

      toast.success(isDiagnosticResultsEdit ? 'Diagnostic results updated successfully!' : 'Diagnostic results submitted. You can now submit your quote.');
      setShowResultsForm(false);
      setResultsBidding(null);
      setIsDiagnosticResultsEdit(false);
      setResultsText('');
      setResultsImages([]);
    } catch (error: any) {
      console.error('Error submitting diagnostic results:', error);
      toast.error(error?.message || 'Failed to submit diagnostic results');
    } finally {
      setResultsSubmitting(false);
    }
  };

  const updateDirectLineItem = (idx: number, field: 'description' | 'quantity' | 'unitPrice' | 'amount', value: string) => {
    setDirectQuoteLineItems(prev => {
      const next = [...prev];
      const item = { ...next[idx] };
      if (field === 'description') item.description = value;
      else {
        const num = parseFloat(value) || 0;
        if (field === 'quantity') { item.quantity = num; item.amount = parseFloat((num * item.unitPrice).toFixed(2)); }
        else if (field === 'unitPrice') { item.unitPrice = num; item.amount = parseFloat((item.quantity * num).toFixed(2)); }
        else if (field === 'amount') { item.amount = num; }
      }
      next[idx] = item;
      return next;
    });
  };
  const addDirectLineItem = () => setDirectQuoteLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  const removeDirectLineItem = (idx: number) => setDirectQuoteLineItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  const directQuoteTotal = directQuoteLineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0);

  const handleSubmitDirectQuote = async () => {
    if (!selectedBidding) return;
    const validItems = directQuoteLineItems.filter(li => li.description.trim() && Number(li.amount) > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one line item with description and amount');
      return;
    }
    if (!directQuoteServiceDate || !directQuoteServiceTime) {
      toast.error('Please pick a proposed service date and time');
      return;
    }
    setDirectQuoteSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
      if (!subDoc.exists()) return;
      const subData = subDoc.data();

      const primaryWorkOrderId = selectedBidding.workOrderId || selectedBidding.workOrderIds?.[0];
      if (!primaryWorkOrderId) {
        toast.error('This bidding item is missing a work order reference.');
        return;
      }

      const labor = validItems.filter(li => li.description.toLowerCase().includes('labor')).reduce((s, li) => s + Number(li.amount), 0);
      const material = validItems.filter(li => li.description.toLowerCase().includes('material')).reduce((s, li) => s + Number(li.amount), 0);
      const total = validItems.reduce((s, li) => s + Number(li.amount), 0);

      const createdByName = subData.fullName || subData.businessName || 'Subcontractor';
      const timelineEvent = createQuoteTimelineEvent({
        type: 'created',
        userId: currentUser.uid,
        userName: createdByName,
        userRole: 'subcontractor',
        details: `Quote submitted — total ${formatMoney(total)}`,
        metadata: { source: 'subcontractor_bidding_direct', workOrderNumber: selectedBidding.workOrderNumber },
      });

      const isEditMode = selectedBidding.status === 'quoted';
      const existingQuoteId = isEditMode ? (selectedBidding as any).quoteId : null;

      let quoteRef: { id: string };
      if (isEditMode && existingQuoteId) {
        // Update existing quote
        const editTimelineEvent = createQuoteTimelineEvent({
          type: 'created',
          userId: currentUser.uid,
          userName: createdByName,
          userRole: 'subcontractor',
          details: `Quote updated — total ${formatMoney(total)}`,
          metadata: { source: 'subcontractor_bidding_direct_edit' },
        });
        const existingQSnap = await getDoc(doc(db, 'quotes', existingQuoteId));
        const existingQTimeline = existingQSnap.exists() ? (existingQSnap.data().timeline || []) : [];
        await updateDoc(doc(db, 'quotes', existingQuoteId), {
          laborCost: labor,
          materialCost: material,
          totalAmount: total,
          originalAmount: total,
          proposedServiceDate: new Date(directQuoteServiceDate),
          proposedServiceTime: directQuoteServiceTime,
          lineItems: validItems,
          notes: directQuoteNotes,
          editedAt: serverTimestamp(),
          editedBy: currentUser.uid,
          editedByName: createdByName,
          updatedAt: serverTimestamp(),
          timeline: [...existingQTimeline, editTimelineEvent],
        });
        quoteRef = { id: existingQuoteId };
      } else {
        quoteRef = await addDoc(collection(db, 'quotes'), {
          workOrderId: primaryWorkOrderId,
          ...(Array.isArray(selectedBidding.workOrderIds) && selectedBidding.workOrderIds.length >= 2
            ? { workOrderIds: selectedBidding.workOrderIds.map(String) }
            : {}),
          ...(selectedBidding.workOrderGroupId ? { workOrderGroupId: String(selectedBidding.workOrderGroupId) } : {}),
          workOrderNumber: selectedBidding.workOrderNumber,
          workOrderTitle: selectedBidding.workOrderTitle,
          subcontractorId: currentUser.uid,
          subcontractorName: subData.fullName || subData.businessName,
          subcontractorEmail: subData.email,
          clientId: selectedBidding.clientId,
          clientName: selectedBidding.clientName,
          clientEmail: (selectedBidding as any).clientEmail || '',
          laborCost: labor,
          materialCost: material,
          additionalCosts: 0,
          discountAmount: 0,
          totalAmount: total,
          originalAmount: total,
          proposedServiceDate: new Date(directQuoteServiceDate),
          proposedServiceTime: directQuoteServiceTime,
          lineItems: validItems,
          notes: directQuoteNotes,
          status: 'pending',
          isDiagnosticQuote: false,
          createdBy: currentUser.uid,
          creationSource: 'subcontractor_bidding_direct',
          timeline: [timelineEvent],
          systemInformation: {
            createdBy: { id: currentUser.uid, name: createdByName, role: 'subcontractor', timestamp: Timestamp.now() },
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (!isEditMode) {
        const quoteNotifyToken = await auth.currentUser?.getIdToken().catch(() => undefined);
        await notifyQuoteSubmission(
          selectedBidding.clientId,
          primaryWorkOrderId,
          selectedBidding.workOrderNumber || primaryWorkOrderId,
          subData.fullName || subData.businessName,
          total,
          quoteNotifyToken,
        );

        void (async () => {
          try {
            const res = await fetch('/api/email/send-quote-notification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              keepalive: true,
              body: JSON.stringify({
                notifyAdmins: true,
                workOrderNumber: selectedBidding.workOrderNumber || selectedBidding.workOrderId,
                workOrderTitle: selectedBidding.workOrderTitle,
                subcontractorName: subData.fullName || subData.businessName,
                quoteAmount: total,
                category: selectedBidding.category || '',
                locationName: selectedBidding.locationName || '',
                priority: selectedBidding.priority || '',
                description: selectedBidding.workOrderDescription || '',
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (data && typeof data.adminsTotal === 'number') {
              if (data.adminsTotal === 0) {
                console.warn('[bidding] Admin notification skipped — no admin recipients configured.');
              } else if (data.adminsFailed > 0) {
                console.warn(`[bidding] Admin notification partial: ${data.adminsSent}/${data.adminsTotal} sent, ${data.adminsFailed} failed.`);
              }
            }
          } catch (err) {
            console.error('[bidding] Admin notification fetch failed:', err);
          }
        })();

        // Update work order status + quotesReceived (best effort)
        try {
          const ids = Array.isArray(selectedBidding.workOrderIds) && selectedBidding.workOrderIds.length >= 2
            ? selectedBidding.workOrderIds.map(String)
            : [primaryWorkOrderId];
          await Promise.all(ids.map(async (woId) => {
            const workOrderRef = doc(db, 'workOrders', woId);
            const workOrderSnapshot = await getDoc(workOrderRef);
            if (!workOrderSnapshot.exists()) return;
            const currentStatus = workOrderSnapshot.data()?.status as string | undefined;
            const statusesEligibleForQuote = ['pending', 'approved', 'bidding', 'diagnostic_accepted', 'diagnostic_results_submitted'];
            const woData = workOrderSnapshot.data();
            const existingTimeline = woData?.timeline || [];
            const existingSysInfo = woData?.systemInformation || {};
            const woTimelineEvent = {
              id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Timestamp.now(),
              type: 'quote_received',
              userId: currentUser.uid,
              userName: subData.fullName || subData.businessName,
              userRole: 'subcontractor',
              details: `Quote received from ${subData.fullName || subData.businessName} - ${formatMoney(total)}`,
              metadata: {
                quoteId: quoteRef.id,
                amount: total,
                ...(selectedBidding.workOrderGroupId ? { workOrderGroupId: selectedBidding.workOrderGroupId } : {}),
              },
            };
            const updatedSysInfo = {
              ...existingSysInfo,
              quotesReceived: [
                ...(existingSysInfo.quotesReceived || []),
                { quoteId: quoteRef.id, subcontractorId: currentUser.uid, subcontractorName: subData.fullName || subData.businessName, amount: total, timestamp: Timestamp.now() },
              ],
            };
            if (currentStatus === 'quotes_received') {
              await updateDoc(workOrderRef, { updatedAt: serverTimestamp(), timeline: [...existingTimeline, woTimelineEvent], systemInformation: updatedSysInfo });
            } else if (!currentStatus || statusesEligibleForQuote.includes(currentStatus)) {
              await updateDoc(workOrderRef, { status: 'quotes_received', quoteReceivedAt: serverTimestamp(), updatedAt: serverTimestamp(), timeline: [...existingTimeline, woTimelineEvent], systemInformation: updatedSysInfo });
            }
          }));
        } catch (e) { console.error('Quote submitted, but failed to update work order:', e); }

        try {
          await updateDoc(doc(db, 'biddingWorkOrders', selectedBidding.id), {
            status: 'quoted',
            quotedAt: serverTimestamp(),
            quoteId: quoteRef.id,
            updatedAt: serverTimestamp(),
          });
        } catch (e) { console.error('Quote submitted, but failed to update biddingWorkOrder:', e); }
      } else {
        // Edit mode — add a quote_updated timeline event on the work order
        try {
          const primaryId = selectedBidding.workOrderId || selectedBidding.workOrderIds?.[0];
          if (primaryId) {
            const woRef = doc(db, 'workOrders', primaryId);
            const woSnap = await getDoc(woRef);
            if (woSnap.exists()) {
              const existingTimeline = woSnap.data().timeline || [];
              await updateDoc(woRef, {
                updatedAt: serverTimestamp(),
                timeline: [...existingTimeline, {
                  id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  timestamp: Timestamp.now(),
                  type: 'quote_updated',
                  userId: currentUser.uid,
                  userName: subData.fullName || subData.businessName,
                  userRole: 'subcontractor',
                  details: `Quote updated by ${subData.fullName || subData.businessName} — ${formatMoney(total)}`,
                  metadata: { quoteId: quoteRef.id, amount: total },
                }],
              });
            }
          }
        } catch (e) { console.error('Quote updated, but failed to add WO timeline event:', e); }

        try {
          await updateDoc(doc(db, 'biddingWorkOrders', selectedBidding.id), {
            quoteEditedAt: serverTimestamp(),
            quoteEditedBy: createdByName,
            updatedAt: serverTimestamp(),
          });
        } catch (e) { console.error('Quote updated, but failed to stamp biddingWorkOrder:', e); }
      }

      toast.success(isEditMode ? 'Quote updated successfully!' : 'Quote submitted successfully!');
      setShowDirectQuoteForm(false);
      setSelectedBidding(null);
      setDirectQuoteLineItems([
        { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
        { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
      ]);
      setDirectQuoteNotes('');
      setDirectQuoteServiceDate('');
      setDirectQuoteServiceTime('');
    } catch (error) {
      console.error('Error submitting direct quote:', error);
      toast.error('Failed to submit quote');
    } finally {
      setDirectQuoteSubmitting(false);
    }
  };

  const handleRejectBidding = async (bidding: BiddingWorkOrder) => {
    if (!confirm(`Reject this quote request for "${bidding.workOrderTitle}"? This will remove it from your bidding list.`)) return;
    setRejectingId(bidding.id);
    try {
      const currentUser = auth.currentUser;
      await updateDoc(doc(db, 'biddingWorkOrders', bidding.id), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: currentUser?.uid || null,
        updatedAt: serverTimestamp(),
      });
      // Fire-and-forget admin notification
      try {
        const subDoc = currentUser ? await getDoc(doc(db, 'subcontractors', currentUser.uid)) : null;
        const subName = subDoc?.exists()
          ? ((subDoc.data() as any).fullName || (subDoc.data() as any).businessName || 'Subcontractor')
          : 'Subcontractor';
        const primaryId = bidding.workOrderId || bidding.workOrderIds?.[0] || '';
        const rejectTok = await auth.currentUser?.getIdToken().catch(() => undefined);
        notifyAdminsOfBiddingRejection(
          primaryId,
          bidding.workOrderNumber || primaryId,
          bidding.workOrderTitle,
          subName,
          rejectTok,
        ).catch(console.error);
      } catch (notifyErr) {
        console.error('Failed to notify admins of bidding rejection:', notifyErr);
      }
      toast.success('Quote request rejected');
    } catch (error) {
      console.error('Error rejecting bidding:', error);
      toast.error('Failed to reject quote request');
    } finally {
      setRejectingId(null);
    }
  };

  const openEditDiagnosticForm = async (bidding: BiddingWorkOrder) => {
    setSelectedBidding(bidding);
    setDiagnosticFee(String(bidding.diagnosticFee || ''));
    const diagQuoteId = (bidding as any).diagnosticQuoteId;
    if (diagQuoteId) {
      try {
        const qSnap = await getDoc(doc(db, 'quotes', diagQuoteId));
        if (qSnap.exists()) {
          const d = qSnap.data() as any;
          const dateObj = d.proposedServiceDate?.toDate?.() || (d.proposedServiceDate ? new Date(d.proposedServiceDate) : null);
          setQuoteForm({
            proposedServiceDate: dateObj ? dateObj.toISOString().split('T')[0] : '',
            proposedServiceTime: d.proposedServiceTime || '',
            notes: d.notes || '',
          });
        }
      } catch (err) {
        console.error('Could not load diagnostic quote for edit:', err);
      }
    }
    setIsDiagnosticEdit(true);
    setShowQuoteForm(true);
  };

  const handleSubmitQuote = async () => {
    if (!selectedBidding) return;

    const isGroup = Array.isArray(selectedBidding.workOrderIds) && selectedBidding.workOrderIds.length >= 2;
    if (isGroup) {
      toast.error('Diagnostic Requests are not available for combined work order bundles. Please submit a quote instead.');
      return;
    }
    if (!selectedBidding.workOrderId) {
      toast.error('This bidding item is missing a work order reference.');
      return;
    }
    const workOrderId = selectedBidding.workOrderId;

    if (!quoteForm.proposedServiceDate || !quoteForm.proposedServiceTime) {
      toast.error('Please fill in all required fields (including service date and time)');
      return;
    }

    const feeNum = Number(diagnosticFee);
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      toast.error('Please enter a valid diagnostic fee');
      return;
    }

    setSubmitting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
      if (!subDoc.exists()) return;

      const subData = subDoc.data();

      // The bid is a diagnostic quote — the only amount is the diagnostic fee.
      // If the client later approves a repair, the subcontractor submits a separate repair quote.
      const total = feeNum;
      const diagnosticLineItem = [{
        description: 'Diagnostic Visit',
        quantity: 1,
        unitPrice: feeNum,
        amount: feeNum,
      }];

      // Do not read client profile from subcontractor context (rules may block this).
      // Prefer any email already embedded on the bidding doc; otherwise skip client email notification.
      const clientEmail = (selectedBidding as any).clientEmail || '';

      const createdByName = subData.fullName || subData.businessName || 'Subcontractor';
      const timelineEvent = createQuoteTimelineEvent({
        type: 'sent_to_client',
        userId: currentUser.uid,
        userName: createdByName,
        userRole: 'subcontractor',
        details: `Diagnostic request submitted to client — fee ${formatMoney(feeNum)}`,
        metadata: {
          source: 'subcontractor_bidding',
          workOrderNumber: selectedBidding.workOrderNumber,
          isDiagnosticQuote: true,
          diagnosticFee: feeNum,
        },
      });
      const existingDiagQuoteId = isDiagnosticEdit ? (selectedBidding as any).diagnosticQuoteId : null;

      let quoteRef: { id: string };
      if (isDiagnosticEdit && existingDiagQuoteId) {
        // Update existing diagnostic quote
        const editTlEvent = createQuoteTimelineEvent({
          type: 'created',
          userId: currentUser.uid,
          userName: createdByName,
          userRole: 'subcontractor',
          details: `Diagnostic request updated — fee ${formatMoney(feeNum)}`,
          metadata: { source: 'subcontractor_bidding_edit', isDiagnosticQuote: true },
        });
        const existingDQSnap = await getDoc(doc(db, 'quotes', existingDiagQuoteId));
        const existingDQTimeline = existingDQSnap.exists() ? (existingDQSnap.data().timeline || []) : [];
        await updateDoc(doc(db, 'quotes', existingDiagQuoteId), {
          totalAmount: total,
          originalAmount: total,
          clientAmount: total,
          diagnosticFee: feeNum,
          lineItems: diagnosticLineItem,
          proposedServiceDate: new Date(quoteForm.proposedServiceDate),
          proposedServiceTime: quoteForm.proposedServiceTime,
          notes: quoteForm.notes,
          editedAt: serverTimestamp(),
          editedBy: currentUser.uid,
          editedByName: createdByName,
          updatedAt: serverTimestamp(),
          timeline: [...existingDQTimeline, editTlEvent],
        });
        quoteRef = { id: existingDiagQuoteId };
      } else {
        // Diagnostic Requests skip admin markup — send directly to the client.
        quoteRef = await addDoc(collection(db, 'quotes'), {
          workOrderId: workOrderId,
          workOrderNumber: selectedBidding.workOrderNumber,
          workOrderTitle: selectedBidding.workOrderTitle,
          subcontractorId: currentUser.uid,
          subcontractorName: subData.fullName || subData.businessName,
          subcontractorEmail: subData.email,
          clientId: selectedBidding.clientId,
          clientName: selectedBidding.clientName,
          clientEmail: clientEmail,
          laborCost: 0,
          materialCost: 0,
          additionalCosts: 0,
          discountAmount: 0,
          totalAmount: total,
          originalAmount: total,
          clientAmount: total,
          markupPercentage: 0,
          proposedServiceDate: new Date(quoteForm.proposedServiceDate),
          proposedServiceTime: quoteForm.proposedServiceTime,
          lineItems: diagnosticLineItem,
          notes: quoteForm.notes,
          status: 'sent_to_client',
          sentToClientAt: serverTimestamp(),
          isDiagnosticQuote: true,
          diagnosticFee: feeNum,
          createdBy: currentUser.uid,
          creationSource: 'subcontractor_bidding',
          timeline: [timelineEvent],
          systemInformation: {
            createdBy: { id: currentUser.uid, name: createdByName, role: 'subcontractor', timestamp: Timestamp.now() },
            sentToClientBy: { id: currentUser.uid, name: createdByName, role: 'subcontractor', timestamp: Timestamp.now(), autoForwarded: true },
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (!isDiagnosticEdit) {
        // Notify admins + client that a Diagnostic Request arrived
        fetch('/api/notifications/diagnostic-request-submitted', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            clientId: selectedBidding.clientId,
            clientEmail,
            clientName: selectedBidding.clientName,
            workOrderId: selectedBidding.workOrderId,
            workOrderNumber: selectedBidding.workOrderNumber || selectedBidding.workOrderId,
            workOrderTitle: selectedBidding.workOrderTitle,
            subcontractorName: subData.fullName || subData.businessName,
            diagnosticFee: feeNum,
            proposedServiceDate: quoteForm.proposedServiceDate,
            proposedServiceTime: quoteForm.proposedServiceTime,
          }),
        }).catch(console.error);

        // Record diagnostic request on the parent work order timeline
        try {
          const workOrderRef = doc(db, 'workOrders', selectedBidding.workOrderId);
          const workOrderSnapshot = await getDoc(workOrderRef);
          if (workOrderSnapshot.exists()) {
            const workOrderData = workOrderSnapshot.data();
            const existingTimeline = workOrderData?.timeline || [];
            const existingSysInfo = workOrderData?.systemInformation || {};
            const woTimelineEvent = {
              id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Timestamp.now(),
              type: 'diagnostic_request_received',
              userId: currentUser.uid,
              userName: subData.fullName || subData.businessName,
              userRole: 'subcontractor',
              details: `Diagnostic Request received from ${subData.fullName || subData.businessName} - ${formatMoney(total)} (sent directly to client)`,
              metadata: { quoteId: quoteRef.id, amount: total, diagnosticFee: feeNum, isDiagnosticQuote: true },
            };
            const existingDiag = existingSysInfo.diagnosticRequests || [];
            const updatedSysInfo = {
              ...existingSysInfo,
              diagnosticRequests: [...existingDiag, { quoteId: quoteRef.id, subcontractorId: currentUser.uid, subcontractorName: subData.fullName || subData.businessName, diagnosticFee: feeNum, timestamp: Timestamp.now() }],
            };
            await updateDoc(workOrderRef, { updatedAt: serverTimestamp(), timeline: [...existingTimeline, woTimelineEvent], systemInformation: updatedSysInfo });
          }
        } catch (workOrderUpdateError) {
          console.error('Diagnostic request submitted, but failed to update work order:', workOrderUpdateError);
        }

        try {
          await updateDoc(doc(db, 'biddingWorkOrders', selectedBidding.id), {
            status: 'diagnostic_requested',
            quotedAt: serverTimestamp(),
            diagnosticQuoteId: quoteRef.id,
            updatedAt: serverTimestamp(),
          });
        } catch (biddingUpdateError) {
          console.error('Diagnostic request submitted, but failed to update biddingWorkOrder:', biddingUpdateError);
        }
      } else {
        // Edit mode — stamp the bidding card
        try {
          await updateDoc(doc(db, 'biddingWorkOrders', selectedBidding.id), {
            diagnosticFee: feeNum,
            diagnosticEditedAt: serverTimestamp(),
            diagnosticEditedBy: createdByName,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.error('Diagnostic request updated, but failed to stamp biddingWorkOrder:', e);
        }
      }

      toast.success(isDiagnosticEdit ? 'Diagnostic request updated successfully!' : 'Diagnostic Request sent to client!');
      setShowQuoteForm(false);
      setSelectedBidding(null);
      setIsDiagnosticEdit(false);
      setQuoteForm({ proposedServiceDate: '', proposedServiceTime: '', notes: '' });
      setDiagnosticFee('');
    } catch (error) {
      console.error('Error submitting diagnostic bid:', error);
      toast.error('Failed to submit diagnostic bid');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBiddingWorkOrders = biddingWorkOrders.filter(bidding => {
    const searchLower = searchQuery.toLowerCase();
    return !searchQuery ||
      bidding.workOrderTitle.toLowerCase().includes(searchLower) ||
      bidding.workOrderDescription.toLowerCase().includes(searchLower) ||
      bidding.clientName.toLowerCase().includes(searchLower) ||
      bidding.category.toLowerCase().includes(searchLower) ||
      bidding.locationName.toLowerCase().includes(searchLower) ||
      formatAddress(bidding.locationAddress).toLowerCase().includes(searchLower);
  });

  const getPriorityBadge = (priority: string) => {
    const styles = {
      low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      medium: 'bg-amber-50 text-amber-700 border-amber-200',
      high: 'bg-red-50 text-red-700 border-red-200',
    };
    return styles[priority as keyof typeof styles] || 'bg-muted text-foreground border-border';
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
        </div>
      </>
    );
  }

  if (viewWorkOrder) {
    return (
      <>
        <PortalListPage
            title="Work Order Details"
            subtitle={viewWorkOrder.workOrderNumber ? `Work Order: ${viewWorkOrder.workOrderNumber}` : viewWorkOrder.workOrderTitle}
            icon={ClipboardList}
            heroAction={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-10 rounded-xl px-4 font-semibold" onClick={() => setViewWorkOrder(null)}>
                  Back
                </Button>
                {viewWorkOrder.status === 'pending' && (
                  <>
                    {(viewWorkOrder.allowSubDirectInvoiceFromBidding || eligibleDirectInvoiceIds.has(viewWorkOrder.id)) && (
                      <Button
                        className="h-10 rounded-xl px-4 font-semibold gap-1.5 bg-primary hover:bg-primary/90 shadow-sm shadow-primary/25"
                        onClick={() => {
                          openDirectInvoiceForm(viewWorkOrder);
                          setViewWorkOrder(null);
                        }}
                      >
                        <Receipt className="h-4 w-4" />
                        Submit Invoice
                      </Button>
                    )}
                    <Button
                      className="h-10 rounded-xl px-4 font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/25"
                      onClick={() => {
                        openDirectQuoteForm(viewWorkOrder);
                        setViewWorkOrder(null);
                      }}
                    >
                      <FileText className="h-4 w-4" />
                      Submit Quote
                    </Button>
                    {!(Array.isArray(viewWorkOrder.workOrderIds) && viewWorkOrder.workOrderIds.length >= 2) && (
                      <Button
                        className="h-10 rounded-xl px-4 font-semibold gap-1.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-600/25"
                        onClick={() => {
                          setSelectedBidding(viewWorkOrder);
                          setShowQuoteForm(true);
                          setViewWorkOrder(null);
                        }}
                      >
                        <Stethoscope className="h-4 w-4" />
                        Submit Diagnostic Request
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="h-10 rounded-xl px-4 font-semibold gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                      disabled={rejectingId === viewWorkOrder.id}
                      onClick={async () => {
                        await handleRejectBidding(viewWorkOrder);
                        setViewWorkOrder(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                      {rejectingId === viewWorkOrder.id ? 'Rejecting…' : 'Reject Quote Request'}
                    </Button>
                  </>
                )}
                {viewWorkOrder.status === 'diagnostic_accepted' && (
                  <Button
                    className="h-10 rounded-xl px-4 font-semibold gap-1.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-600/25"
                    onClick={() => { openResultsForm(viewWorkOrder); setViewWorkOrder(null); }}
                  >
                    <Stethoscope className="h-4 w-4" />
                    Submit Diagnostic Results
                  </Button>
                )}
                {viewWorkOrder.status === 'diagnostic_results_submitted' && (
                  <>
                    <Button
                      className="h-10 rounded-xl px-4 font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/25"
                      onClick={() => { openDirectQuoteForm(viewWorkOrder); setViewWorkOrder(null); }}
                    >
                      <FileText className="h-4 w-4" />
                      Submit Quote
                    </Button>
                    {editPerms.canEditDiagnostic && (
                      <Button
                        variant="outline"
                        className="h-10 rounded-xl px-4 font-semibold gap-1.5"
                        onClick={() => { openResultsForm(viewWorkOrder, true); setViewWorkOrder(null); }}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit Diagnostic Results
                      </Button>
                    )}
                  </>
                )}
                {viewWorkOrder.status === 'diagnostic_requested' && editPerms.canEditDiagnostic && (
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl px-4 font-semibold gap-1.5"
                    onClick={() => { openEditDiagnosticForm(viewWorkOrder); setViewWorkOrder(null); }}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit Diagnostic Request
                  </Button>
                )}
                {viewWorkOrder.status === 'quoted' && editPerms.canEditQuote && (
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl px-4 font-semibold gap-1.5"
                    onClick={() => { openEditQuoteForm(viewWorkOrder); setViewWorkOrder(null); }}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit Quote
                  </Button>
                )}
                {viewWorkOrder.status === 'direct_invoice_submitted' && editPerms.canEditInvoice && (
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl px-4 font-semibold gap-1.5"
                    onClick={() => { openEditInvoiceForm(viewWorkOrder); setViewWorkOrder(null); }}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit Invoice
                  </Button>
                )}
              </div>
            }
        >

          {/* Combined bundle: show each WO as its own card */}
          {Array.isArray(viewWorkOrder.workOrderIds) && viewWorkOrder.workOrderIds.length >= 2 && viewWorkOrder.workOrderDetails?.length ? (
            <div className="space-y-4">
              {/* Shared meta (client, location, date) */}
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardContent className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Client</p>
                      <p className="font-semibold text-foreground">{viewWorkOrder.clientName}</p>
                    </div>
                    {viewWorkOrder.locationName && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Location</p>
                        <p className="font-semibold text-foreground">{viewWorkOrder.locationName}</p>
                        {viewWorkOrder.locationAddress && (
                          <p className="text-xs text-muted-foreground">{formatAddress(viewWorkOrder.locationAddress)}</p>
                        )}
                      </div>
                    )}
                    {viewWorkOrder.sharedAt && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Shared Date</p>
                        <p className="font-semibold text-foreground">{viewWorkOrder.sharedAt?.toDate?.().toLocaleDateString() || 'N/A'}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              {/* Individual WO cards */}
              {viewWorkOrder.workOrderDetails.map((wo, i) => (
                <Card key={wo.id} className="rounded-2xl border border-border shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-primary uppercase tracking-wide">Work Order {i + 1}</p>
                        <p className="font-bold text-base text-foreground">{wo.workOrderNumber || wo.id}</p>
                        {wo.title && <p className="text-sm text-muted-foreground">{wo.title}</p>}
                      </div>
                      {wo.priority && (
                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${getPriorityBadge(wo.priority)}`}>
                          {wo.priority}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-4 space-y-2 text-sm">
                    {wo.category && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-xs font-semibold uppercase tracking-wide w-24 flex-shrink-0">Category</span>
                        <span>{wo.category}</span>
                      </div>
                    )}
                    {wo.description && (
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{wo.description}</p>
                    )}
                    {wo.images && wo.images.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                        {wo.images.map((img, j) => (
                          <button key={j} onClick={() => { setLightboxImages(wo.images!); setLightboxIndex(j); }} className="block rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors cursor-pointer">
                            <img src={img} alt={`Attachment ${j + 1}`} className="w-full h-20 object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            /* Single WO detail */
            <Card className="rounded-2xl border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Work Order Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                  {viewWorkOrder.workOrderTitle && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Title</p>
                      <p className="text-sm font-semibold text-foreground">{viewWorkOrder.workOrderTitle}</p>
                    </div>
                  )}
                  {viewWorkOrder.workOrderNumber && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Work Order #</p>
                      <p className="text-sm font-semibold text-foreground">{viewWorkOrder.workOrderNumber}</p>
                    </div>
                  )}
                  {viewWorkOrder.category && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Category</p>
                      <p className="text-sm text-foreground">{viewWorkOrder.category}</p>
                    </div>
                  )}
                  {viewWorkOrder.priority && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Priority</p>
                      <p className="text-sm text-foreground capitalize">{viewWorkOrder.priority}</p>
                    </div>
                  )}
                  {viewWorkOrder.estimateBudget != null && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Estimate Budget</p>
                      <p className="text-sm text-foreground">{formatMoney(viewWorkOrder.estimateBudget)}</p>
                    </div>
                  )}
                  {viewWorkOrder.locationName && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Location Name</p>
                      <p className="text-sm text-foreground">{viewWorkOrder.locationName}</p>
                    </div>
                  )}
                  {viewWorkOrder.locationAddress && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Address</p>
                      <p className="text-sm text-foreground">{formatAddress(viewWorkOrder.locationAddress)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Client</p>
                    <p className="text-sm text-foreground">{viewWorkOrder.clientName}</p>
                  </div>
                  {viewWorkOrder.sharedAt && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Shared Date</p>
                      <p className="text-sm text-foreground">{viewWorkOrder.sharedAt?.toDate?.().toLocaleDateString() || 'N/A'}</p>
                    </div>
                  )}
                </div>
                {viewWorkOrder.workOrderDescription && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{viewWorkOrder.workOrderDescription}</p>
                  </div>
                )}
                {workOrderImages.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Attachments ({workOrderImages.length})</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {workOrderImages.map((img, i) => (
                        <button key={i} onClick={() => { setLightboxImages(workOrderImages); setLightboxIndex(i); }} className="block rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors cursor-pointer">
                          <img src={img} alt={`Attachment ${i + 1}`} className="w-full h-24 object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </PortalListPage>
      </>
    );
  }

  if (showResultsForm && resultsBidding) {
    return (
      <>
        <PortalListPage className="!space-y-4"
            title="Submit Diagnostic Results"
            subtitle={resultsBidding.workOrderNumber ? `Work Order: ${resultsBidding.workOrderNumber}` : resultsBidding.workOrderTitle}
            icon={Stethoscope}
            heroAction={
              <Button variant="outline" className="h-10 rounded-xl px-4 font-semibold" onClick={() => {
                setShowResultsForm(false);
                setResultsBidding(null);
              }}>
                Cancel
              </Button>
            }
        >

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 xl:gap-6 items-start">
            <div className="space-y-4 lg:sticky lg:top-4 lg:z-[1] lg:max-h-[min(85dvh,calc(100dvh-6rem))] lg:overflow-y-auto lg:pr-1">
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <ClipboardList className="h-5 w-5 shrink-0" />
                    Work Order Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {resultsBidding.workOrderTitle && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Title</p>
                        <p className="font-semibold text-foreground">{resultsBidding.workOrderTitle}</p>
                      </div>
                    )}
                    {resultsBidding.workOrderNumber && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Work Order #</p>
                        <p className="font-semibold text-foreground">{resultsBidding.workOrderNumber}</p>
                      </div>
                    )}
                    {resultsBidding.category && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Category</p>
                        <p className="text-foreground">{resultsBidding.category}</p>
                      </div>
                    )}
                    {resultsBidding.priority && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Priority</p>
                        <p className="text-foreground capitalize">{resultsBidding.priority}</p>
                      </div>
                    )}
                    {resultsBidding.locationName && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Location</p>
                        <p className="text-foreground">{resultsBidding.locationName}</p>
                      </div>
                    )}
                    {resultsBidding.locationAddress && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Address</p>
                        <p className="text-foreground">{formatAddress(resultsBidding.locationAddress)}</p>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <p className="text-xs font-medium text-muted-foreground">Client</p>
                      <p className="text-foreground">{resultsBidding.clientName}</p>
                    </div>
                  </div>
                  {resultsBidding.workOrderDescription && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto">{resultsBidding.workOrderDescription}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0">
              <Card className="rounded-2xl border border-indigo-200/60 shadow-sm bg-indigo-50/40 dark:bg-indigo-950/10">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-indigo-900 dark:text-indigo-200">
                    <Stethoscope className="h-5 w-5 shrink-0" />
                    Diagnostic Results
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4 sm:space-y-5">
                    <div>
                      <Label htmlFor="resultsText" className="text-sm font-semibold text-foreground">
                        What did you find on the diagnostic visit? *
                      </Label>
                      <textarea
                        id="resultsText"
                        name="resultsText"
                        value={resultsText}
                        onChange={(e) => setResultsText(e.target.value)}
                        rows={6}
                        className="mt-1.5 w-full px-3.5 py-2.5 border border-input bg-background rounded-xl text-sm placeholder:text-muted-foreground hover:border-foreground/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                        placeholder="Describe the issues found, the cause if known, and what the repair will involve..."
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Visible to the admin and the client on the work order.
                      </p>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold text-foreground">Photos (optional)</Label>
                      <div className="mt-1.5 flex flex-wrap gap-2 sm:gap-3">
                        {resultsImages.map((url, idx) => (
                          <div key={idx} className="relative h-20 w-20 rounded-lg overflow-hidden border border-border group">
                            <img src={url} alt={`Result ${idx + 1}`} className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeResultsImage(idx)}
                              className="absolute top-0.5 right-0.5 h-6 w-6 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              aria-label="Remove image"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <label className={`h-20 w-20 rounded-lg border-2 border-dashed border-input flex items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors ${uploadingResultsImages ? 'opacity-50 pointer-events-none' : ''}`}>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handleResultsImageUpload}
                            disabled={uploadingResultsImages}
                          />
                          <Plus className="h-5 w-5 text-muted-foreground" />
                        </label>
                      </div>
                      {uploadingResultsImages && (
                        <p className="text-xs text-muted-foreground mt-2">Uploading…</p>
                      )}
                    </div>

                    <div className="sticky bottom-0 z-10 -mx-6 px-6 py-3 mt-2 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 border-t border-border lg:static lg:bg-transparent lg:backdrop-blur-none lg:border-t-0 lg:p-0 lg:mt-0">
                      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-xl px-5 font-semibold w-full sm:w-auto"
                          onClick={() => {
                            setShowResultsForm(false);
                            setResultsBidding(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={handleSubmitResults}
                          loading={resultsSubmitting} disabled={resultsSubmitting || uploadingResultsImages}
                          className="h-10 rounded-xl px-5 font-semibold gap-1.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-600/25 w-full sm:w-auto"
                        >
                          <Stethoscope className="h-4 w-4" />
                          {resultsSubmitting ? 'Submitting...' : 'Submit Diagnostic Results'}
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </PortalListPage>
      </>
    );
  }

  if (showDirectInvoiceForm && directInvoiceBidding) {
    return (
      <>
        <PortalListPage className="!space-y-4"
            title="Submit Invoice"
            subtitle={directInvoiceBidding.workOrderNumber ? `Work Order: ${directInvoiceBidding.workOrderNumber}` : directInvoiceBidding.workOrderTitle}
            icon={Receipt}
            heroAction={
              <Button variant="outline" className="h-10 rounded-xl px-4 font-semibold" onClick={() => {
                setShowDirectInvoiceForm(false);
                setDirectInvoiceBidding(null);
              }}>
                Cancel
              </Button>
            }
        >

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 xl:gap-6 items-start">
            <div className="space-y-4 lg:sticky lg:top-4 lg:z-[1] lg:max-h-[min(85dvh,calc(100dvh-6rem))] lg:overflow-y-auto lg:pr-1">
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <ClipboardList className="h-5 w-5 shrink-0" />
                    Work Order Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {directInvoiceBidding.workOrderTitle && (
                      <div className="md:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Title</p>
                        <p className="text-sm font-semibold text-foreground">{directInvoiceBidding.workOrderTitle}</p>
                      </div>
                    )}
                    {directInvoiceBidding.workOrderNumber && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Work Order #</p>
                        <p className="text-sm font-semibold text-foreground">{directInvoiceBidding.workOrderNumber}</p>
                      </div>
                    )}
                    {directInvoiceBidding.locationName && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Location</p>
                        <p className="text-sm text-foreground">{directInvoiceBidding.locationName}</p>
                      </div>
                    )}
                    {directInvoiceBidding.locationAddress && (
                      <div className="md:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Address</p>
                        <p className="text-sm text-foreground">{formatAddress(directInvoiceBidding.locationAddress)}</p>
                      </div>
                    )}
                  </div>
                  {directInvoiceBidding.workOrderDescription && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3 max-h-48 overflow-y-auto">{directInvoiceBidding.workOrderDescription}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0">
              <Card className="rounded-2xl border border-primary/20 shadow-sm bg-primary/10 dark:bg-primary/15">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground dark:text-muted-foreground">
                    <Receipt className="h-5 w-5 shrink-0" />
                    Invoice Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4 sm:space-y-5">
                <div className="rounded-2xl bg-white/70 border border-primary/20 p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-foreground">Line Items *</p>
                    <Button type="button" size="sm" variant="outline" onClick={addDirectInvoiceLineItem} className="h-8 rounded-lg text-xs font-semibold gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add Item
                    </Button>
                  </div>
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <div className="col-span-5">Description</div>
                    <div className="col-span-2">Quantity</div>
                    <div className="col-span-2">Rate</div>
                    <div className="col-span-2 text-right">Total</div>
                    <div className="col-span-1" />
                  </div>
                  <div className="space-y-2">
                    {directInvoiceLineItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-12 sm:col-span-5">
                          <Label className="sm:hidden text-[11px] font-medium text-muted-foreground">Description</Label>
                          <Input
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateDirectInvoiceLineItem(idx, 'description', e.target.value)}
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2">
                          <Label className="sm:hidden text-[11px] font-medium text-muted-foreground">Quantity</Label>
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder="0"
                            value={item.quantity || ''}
                            onChange={(e) => updateDirectInvoiceLineItem(idx, 'quantity', e.target.value)}
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2">
                          <Label className="sm:hidden text-[11px] font-medium text-muted-foreground">Rate</Label>
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder="0.00"
                            value={item.unitPrice || ''}
                            onChange={(e) => updateDirectInvoiceLineItem(idx, 'unitPrice', e.target.value)}
                          />
                        </div>
                        <div className="col-span-4 sm:col-span-2 text-right text-sm font-semibold tabular-nums self-center sm:self-end">
                          <Label className="sm:hidden text-[11px] font-medium text-muted-foreground text-left block">Total</Label>
                          {formatMoney(item.amount)}
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex justify-end self-center sm:self-end">
                          {directInvoiceLineItems.length > 1 && (
                            <Button type="button" size="icon" variant="ghost" onClick={() => removeDirectInvoiceLineItem(idx)} className="h-9 w-9 rounded-lg text-rose-600 hover:bg-rose-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="invoiceNotes">Additional Notes (Optional)</Label>
                  <textarea
                    id="invoiceNotes"
                    value={directInvoiceNotes}
                    onChange={(e) => setDirectInvoiceNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3.5 py-2.5 border border-input bg-background rounded-xl text-sm placeholder:text-muted-foreground hover:border-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
                    placeholder="Any additional information for the client..."
                  />
                </div>

                <div className="rounded-2xl bg-white/70 border border-primary/20 px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Invoice Total</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Submitted directly to client</p>
                    </div>
                    <p className="text-2xl font-bold text-primary tabular-nums">{formatMoney(directInvoiceTotal)}</p>
                  </div>
                </div>

                <div className="sticky bottom-0 z-10 -mx-6 px-6 py-3 mt-2 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 border-t border-border lg:static lg:bg-transparent lg:backdrop-blur-none lg:border-t-0 lg:p-0 lg:mt-0">
                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                  <Button type="button" variant="outline" className="h-10 rounded-xl px-5 font-semibold w-full sm:w-auto" onClick={() => {
                    setShowDirectInvoiceForm(false);
                    setDirectInvoiceBidding(null);
                  }}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitDirectInvoice}
                    loading={directInvoiceSubmitting} disabled={directInvoiceSubmitting}
                    className="h-10 rounded-xl px-5 font-semibold gap-1.5 bg-primary hover:bg-primary/90 shadow-sm shadow-primary/25 w-full sm:w-auto"
                  >
                    <Receipt className="h-4 w-4" />
                    {directInvoiceSubmitting ? 'Submitting...' : 'Submit Invoice'}
                  </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
            </div>
          </div>
        </PortalListPage>
      </>
    );
  }

  if (showDirectQuoteForm && selectedBidding) {
    return (
      <>
        <PortalListPage className="!space-y-4"
            title="Submit Quote"
            subtitle={selectedBidding.workOrderNumber ? `Work Order: ${selectedBidding.workOrderNumber}` : selectedBidding.workOrderTitle}
            icon={FileText}
            heroAction={
              <Button variant="outline" className="h-10 rounded-xl px-4 font-semibold" onClick={() => {
                setShowDirectQuoteForm(false);
                setSelectedBidding(null);
              }}>
                Cancel
              </Button>
            }
        >

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 xl:gap-6 items-start">
            <div className="space-y-4 lg:sticky lg:top-4 lg:z-[1] lg:max-h-[min(85dvh,calc(100dvh-6rem))] lg:overflow-y-auto lg:pr-1">
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <ClipboardList className="h-5 w-5 shrink-0" />
                    Work Order Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedBidding.workOrderTitle && (
                      <div className="md:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Title</p>
                        <p className="text-sm font-semibold text-foreground">{selectedBidding.workOrderTitle}</p>
                      </div>
                    )}
                    {selectedBidding.workOrderNumber && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Work Order #</p>
                        <p className="text-sm font-semibold text-foreground">{selectedBidding.workOrderNumber}</p>
                      </div>
                    )}
                    {selectedBidding.locationName && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Location</p>
                        <p className="text-sm text-foreground">{selectedBidding.locationName}</p>
                      </div>
                    )}
                    {selectedBidding.locationAddress && (
                      <div className="md:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Address</p>
                        <p className="text-sm text-foreground">{formatAddress(selectedBidding.locationAddress)}</p>
                      </div>
                    )}
                  </div>
                  {selectedBidding.workOrderDescription && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3 max-h-48 overflow-y-auto">{selectedBidding.workOrderDescription}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0">
              <Card className="rounded-2xl border border-emerald-200/60 shadow-sm bg-emerald-50/40 dark:bg-emerald-950/10">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-emerald-900 dark:text-emerald-200">
                    <FileText className="h-5 w-5 shrink-0" />
                    Quote Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4 sm:space-y-5">
                <SchedulePicker
                  date={directQuoteServiceDate}
                  onDateChange={setDirectQuoteServiceDate}
                  time={directQuoteServiceTime}
                  onTimeChange={setDirectQuoteServiceTime}
                  slots={SERVICE_TIME_SLOTS}
                  accent="emerald"
                  durationLabel="2-hour window"
                />

                <div className="rounded-2xl bg-white/70 border border-emerald-200/60 p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-foreground">Line Items *</p>
                    <Button type="button" size="sm" variant="outline" onClick={addDirectLineItem} className="h-8 rounded-lg text-xs font-semibold gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add Item
                    </Button>
                  </div>
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <div className="col-span-5">Description</div>
                    <div className="col-span-2">Quantity</div>
                    <div className="col-span-2">Rate</div>
                    <div className="col-span-2 text-right">Total</div>
                    <div className="col-span-1" />
                  </div>
                  <div className="space-y-2">
                    {directQuoteLineItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-12 sm:col-span-5">
                          <Label className="sm:hidden text-[11px] font-medium text-muted-foreground">Description</Label>
                          <Input
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateDirectLineItem(idx, 'description', e.target.value)}
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2">
                          <Label className="sm:hidden text-[11px] font-medium text-muted-foreground">Quantity</Label>
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder="0"
                            value={item.quantity || ''}
                            onChange={(e) => updateDirectLineItem(idx, 'quantity', e.target.value)}
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2">
                          <Label className="sm:hidden text-[11px] font-medium text-muted-foreground">Rate</Label>
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder="0.00"
                            value={item.unitPrice || ''}
                            onChange={(e) => updateDirectLineItem(idx, 'unitPrice', e.target.value)}
                          />
                        </div>
                        <div className="col-span-4 sm:col-span-2 text-right text-sm font-semibold tabular-nums self-center sm:self-end">
                          <Label className="sm:hidden text-[11px] font-medium text-muted-foreground text-left block">Total</Label>
                          {formatMoney(item.amount)}
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex justify-end self-center sm:self-end">
                          {directQuoteLineItems.length > 1 && (
                            <Button type="button" size="icon" variant="ghost" onClick={() => removeDirectLineItem(idx)} className="h-9 w-9 rounded-lg text-rose-600 hover:bg-rose-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="directNotes">Additional Notes (Optional)</Label>
                  <textarea
                    id="directNotes"
                    value={directQuoteNotes}
                    onChange={(e) => setDirectQuoteNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3.5 py-2.5 border border-input bg-background rounded-xl text-sm placeholder:text-muted-foreground hover:border-foreground/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                    placeholder="Any additional information..."
                  />
                </div>

                <div className="rounded-2xl bg-white/70 border border-emerald-200/60 px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quote Total</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Submitted to client for approval</p>
                    </div>
                    <p className="text-2xl font-bold text-emerald-700 tabular-nums">{formatMoney(directQuoteTotal)}</p>
                  </div>
                </div>

                <div className="sticky bottom-0 z-10 -mx-6 px-6 py-3 mt-2 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 border-t border-border lg:static lg:bg-transparent lg:backdrop-blur-none lg:border-t-0 lg:p-0 lg:mt-0">
                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                  <Button type="button" variant="outline" className="h-10 rounded-xl px-5 font-semibold w-full sm:w-auto" onClick={() => {
                    setShowDirectQuoteForm(false);
                    setSelectedBidding(null);
                  }}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitDirectQuote}
                    loading={directQuoteSubmitting} disabled={directQuoteSubmitting}
                    className="h-10 rounded-xl px-5 font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 w-full sm:w-auto"
                  >
                    <FileText className="h-4 w-4" />
                    {directQuoteSubmitting ? 'Submitting...' : 'Submit Quote'}
                  </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
            </div>
          </div>
        </PortalListPage>
      </>
    );
  }

  if (showQuoteForm && selectedBidding) {
    return (
      <>
        <PortalListPage className="!space-y-4"
            title="Submit Diagnostic Request"
            subtitle={selectedBidding.workOrderNumber ? `Work Order: ${selectedBidding.workOrderNumber}` : selectedBidding.workOrderTitle}
            icon={Stethoscope}
            heroAction={
              <Button variant="outline" className="h-10 rounded-xl px-4 font-semibold" onClick={() => {
                setShowQuoteForm(false);
                setSelectedBidding(null);
              }}>
                Cancel
              </Button>
            }
        >

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 xl:gap-6 items-start">
            <div className="space-y-4 lg:sticky lg:top-4 lg:z-[1] lg:max-h-[min(85dvh,calc(100dvh-6rem))] lg:overflow-y-auto lg:pr-1">
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <ClipboardList className="h-5 w-5 shrink-0" />
                    Work Order Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedBidding.workOrderTitle && (
                      <div className="md:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Title</p>
                        <p className="text-sm font-semibold text-foreground">{selectedBidding.workOrderTitle}</p>
                      </div>
                    )}
                    {selectedBidding.workOrderNumber && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Work Order #</p>
                        <p className="text-sm font-semibold text-foreground">{selectedBidding.workOrderNumber}</p>
                      </div>
                    )}
                    {selectedBidding.category && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Category</p>
                        <p className="text-sm text-foreground">{selectedBidding.category}</p>
                      </div>
                    )}
                    {selectedBidding.priority && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Priority</p>
                        <p className="text-sm text-foreground capitalize">{selectedBidding.priority}</p>
                      </div>
                    )}
                    {(selectedBidding as any).estimateBudget != null && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Estimate Budget</p>
                        <p className="text-sm text-foreground">{formatMoney((selectedBidding as any).estimateBudget)}</p>
                      </div>
                    )}
                    {selectedBidding.locationName && (
                      <div className="md:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Location</p>
                        <p className="text-sm text-foreground">{selectedBidding.locationName}</p>
                      </div>
                    )}
                    {selectedBidding.locationAddress && (
                      <div className="md:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Address</p>
                        <p className="text-sm text-foreground">{selectedBidding.locationAddress}</p>
                      </div>
                    )}
                  </div>
                  {selectedBidding.workOrderDescription && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto">{selectedBidding.workOrderDescription}</p>
                    </div>
                  )}
                  {selectedBidding.images && selectedBidding.images.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Attachments ({selectedBidding.images.length})</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 gap-1.5 sm:gap-2">
                        {selectedBidding.images.map((img, i) => (
                          <button key={i} type="button" onClick={() => { setLightboxImages(selectedBidding.images!); setLightboxIndex(i); }} className="block rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors cursor-pointer">
                            <img src={img} alt={`Attachment ${i + 1}`} className="w-full h-16 sm:h-20 object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0">
              <Card className="rounded-2xl border border-indigo-200/60 shadow-sm bg-indigo-50/40 dark:bg-indigo-950/10">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-indigo-900 dark:text-indigo-200">
                    <Stethoscope className="h-5 w-5 shrink-0" />
                    Diagnostic Request
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4 sm:space-y-5">
                <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label htmlFor="diagnosticFee" className="text-sm font-semibold text-foreground">Diagnostic Fee *</Label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none">$</span>
                      <Input
                        id="diagnosticFee"
                        name="diagnosticFee"
                        type="number"
                        min="0"
                        step="0.01"
                        value={diagnosticFee}
                        onChange={(e) => setDiagnosticFee(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0.00"
                        required
                        className="pl-7"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <SchedulePicker
                      date={quoteForm.proposedServiceDate}
                      onDateChange={(iso) => setQuoteForm(prev => ({ ...prev, proposedServiceDate: iso }))}
                      time={quoteForm.proposedServiceTime}
                      onTimeChange={(slot) => setQuoteForm(prev => ({ ...prev, proposedServiceTime: slot }))}
                      slots={DIAGNOSTIC_TIME_SLOTS}
                      accent="indigo"
                      durationLabel="1-hour window"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="notes">Additional Notes (Optional)</Label>
                    <textarea
                      id="notes"
                      name="notes"
                      value={quoteForm.notes}
                      onChange={handleQuoteFormChange}
                      rows={3}
                      className="w-full px-3.5 py-2.5 border border-input bg-background rounded-xl text-sm placeholder:text-muted-foreground hover:border-foreground/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                      placeholder="Any additional information..."
                    />
                  </div>
                </div>

                <div className="rounded-2xl bg-white/70 border border-indigo-200/60 px-4 py-3 sm:px-5 sm:py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 sm:mb-3">Bid Summary</p>
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Diagnostic Visit</span>
                      <span className="font-semibold tabular-nums">{formatMoney(Number(diagnosticFee))}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-indigo-200/60 pt-3">
                      <span className="text-sm font-semibold text-foreground">Total Bid</span>
                      <span className="text-2xl font-bold text-indigo-700 tabular-nums">{formatMoney(Number(diagnosticFee))}</span>
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-0 z-10 -mx-6 px-6 py-3 mt-2 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 border-t border-border lg:static lg:bg-transparent lg:backdrop-blur-none lg:border-t-0 lg:p-0 lg:mt-0">
                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl px-5 font-semibold w-full sm:w-auto"
                    onClick={() => {
                      setShowQuoteForm(false);
                      setSelectedBidding(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitQuote}
                    loading={submitting} disabled={submitting}
                    className="h-10 rounded-xl px-5 font-semibold gap-1.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-600/25 w-full sm:w-auto"
                  >
                    <Stethoscope className="h-4 w-4" />
                    {submitting ? 'Submitting...' : 'Submit Diagnostic Request'}
                  </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
            </div>
          </div>
        </PortalListPage>
      </>
    );
  }

  return (
    <>
      <PortalListPage
        title="Available Work Orders"
        subtitle="Submit quotes for available jobs"
        icon={ClipboardList}
      >

        <StatCards
          items={[
            { label: 'Pending', value: biddingWorkOrders.length, icon: ClipboardList, color: 'blue' },
          ]}
        />

        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, description, client, category, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-xl"
          />
        </div>

        {filteredBiddingWorkOrders.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No work orders available"
            subtitle="Check back later for new bidding opportunities"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBiddingWorkOrders.map((bidding) => (
              <div
                key={bidding.id}
                className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3.5 shadow-sm hover:shadow-md hover:border-foreground/10 transition-all"
              >
                {/* Row 1: title + priority badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{bidding.workOrderTitle}</p>
                    {bidding.workOrderNumber && (
                      <p className="text-[11px] font-medium text-muted-foreground tracking-wide mt-0.5">WO: {bidding.workOrderNumber}</p>
                    )}
                    {Array.isArray(bidding.workOrderIds) && bidding.workOrderIds.length >= 2 && (
                      <p className="text-[11px] font-medium text-primary tracking-wide mt-0.5">
                        Combined bundle · {bidding.workOrderIds.length} work orders
                      </p>
                    )}
                  </div>
                  {bidding.priority && (
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${getPriorityBadge(bidding.priority)}`}>
                      {bidding.priority}
                    </span>
                  )}
                </div>

                {/* Row 2: secondary info */}
                <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5 truncate"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Client</span> <span className="text-foreground/80 truncate">{bidding.clientName}</span></span>
                  {bidding.locationName && (
                    <span className="flex items-center gap-1.5 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{bidding.locationName}{bidding.locationAddress && ` · ${formatAddress(bidding.locationAddress)}`}</span>
                    </span>
                  )}
                  {bidding.category && (
                    <span className="flex items-center gap-1.5 truncate"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Category</span> <span className="text-foreground/80 truncate">{bidding.category}</span></span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    Shared {bidding.sharedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                  </span>
                </div>

                {bidding.workOrderDescription && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{bidding.workOrderDescription}</p>
                )}

                {bidding.images && bidding.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {bidding.images.map((image, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="shrink-0 rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors cursor-pointer"
                        onClick={() => { setLightboxImages(bidding.images!); setLightboxIndex(idx); }}
                        aria-label={`View image ${idx + 1}`}
                      >
                        <img
                          src={image}
                          alt={`Work order ${idx + 1}`}
                          className="h-14 w-14 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Status banners for post-submission states */}
                {bidding.status === 'diagnostic_requested' && (
                  <div className="rounded-xl bg-indigo-50 border border-indigo-200/60 px-3 py-2.5 text-xs text-indigo-900 space-y-2">
                    <div className="flex items-start gap-2">
                      <Stethoscope className="h-4 w-4 mt-0.5 shrink-0 text-indigo-600" />
                      <div>
                        <strong>Diagnostic Request submitted.</strong> Awaiting client approval.
                        {(bidding as any).diagnosticEditedAt && (
                          <span className="ml-2 inline-flex items-center gap-1 text-indigo-500 italic"><Pencil className="h-3 w-3" />Edited</span>
                        )}
                      </div>
                    </div>
                    {editPerms.canEditDiagnostic && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                        onClick={() => openEditDiagnosticForm(bidding)}>
                        <Pencil className="h-3 w-3" />Edit Diagnostic Request
                      </Button>
                    )}
                  </div>
                )}
                {bidding.status === 'diagnostic_accepted' && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200/60 px-3 py-2.5 text-xs text-emerald-900 flex items-start gap-2">
                    <Stethoscope className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                    <span>
                      <strong>Diagnostic accepted by the client{bidding.diagnosticFee ? ` — ${formatMoney(bidding.diagnosticFee)}` : ''}.</strong>
                      {' '}Submit your diagnostic results to continue.
                    </span>
                  </div>
                )}
                {bidding.status === 'diagnostic_results_submitted' && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200/60 px-3 py-2.5 text-xs text-emerald-900 space-y-2">
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                      <div>
                        <strong>Diagnostic results submitted.</strong>{' '}You can now submit your quote.
                        {(bidding as any).diagnosticResultsEditedAt && (
                          <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 italic"><Pencil className="h-3 w-3" />Edited</span>
                        )}
                      </div>
                    </div>
                    {editPerms.canEditDiagnostic && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                        onClick={() => openResultsForm(bidding, true)}>
                        <Pencil className="h-3 w-3" />Edit Diagnostic Results
                      </Button>
                    )}
                  </div>
                )}
                {bidding.status === 'diagnostic_rejected' && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200/60 px-3 py-2.5 text-xs text-rose-900 flex items-start gap-2">
                    <X className="h-4 w-4 mt-0.5 shrink-0 text-rose-600" />
                    <span>
                      <strong>Diagnostic Request rejected by the client.</strong>
                      {bidding.rejectionReason ? ` Reason: ${bidding.rejectionReason}` : ''}
                    </span>
                  </div>
                )}
                {bidding.status === 'quoted' && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200/60 px-3 py-2.5 text-xs text-emerald-900 space-y-2">
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                      <div>
                        <strong>Quote submitted.</strong> Request Pending.
                        {(bidding as any).quoteEditedAt && (
                          <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 italic">
                            <Pencil className="h-3 w-3" />Edited
                          </span>
                        )}
                      </div>
                    </div>
                    {editPerms.canEditQuote && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                        onClick={() => openEditQuoteForm(bidding)}>
                        <Pencil className="h-3 w-3" />Edit Quote
                      </Button>
                    )}
                  </div>
                )}

                {/* Status banner — direct invoice submitted */}
                {bidding.status === 'direct_invoice_submitted' && (
                  <div className="rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5 text-xs text-foreground space-y-2">
                    <div className="flex items-start gap-2">
                      <Receipt className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                      <div>
                        <strong>Invoice submitted.</strong> You have been assigned to this work order. Complete the work and mark it done when finished.
                        {(bidding as any).invoiceEditedAt && (
                          <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground italic">
                            <Pencil className="h-3 w-3" />Edited
                          </span>
                        )}
                      </div>
                    </div>
                    {editPerms.canEditInvoice && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => openEditInvoiceForm(bidding)}>
                        <Pencil className="h-3 w-3" />Edit Invoice
                      </Button>
                    )}
                  </div>
                )}

                {/* Single action — all other actions accessible inside the detail view */}
                <div className="border-t border-border pt-3 mt-auto">
                  <Button
                    variant="outline"
                    className="h-9 w-full rounded-xl text-xs font-semibold gap-1.5"
                    onClick={() => setViewWorkOrder(bidding)}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    View Work Order
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PortalListPage>

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
