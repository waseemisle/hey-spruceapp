'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useViewControls } from '@/contexts/view-controls-context';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp, getDoc, deleteDoc, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import { shouldRequireAdminApproval } from '@/lib/admin-invoice-approval';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Receipt, Download, Send, CreditCard, Edit2, Save, X, Plus, Trash2, Search, Upload, Eye, Zap, CheckCircle, AlertCircle, RefreshCw, Loader2, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import { formatMoney } from '@/lib/money';
import { Quote } from '@/types';
import { toast } from 'sonner';
import { notifyClientOfInvoice } from '@/lib/notifications';
import { generateInvoiceNumber } from '@/lib/invoice-number';

interface Invoice {
  id: string;
  invoiceNumber: string;
  quoteId?: string;
  workOrderId: string;
  workOrderTitle: string;
  workOrderDescription?: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorId?: string;
  subcontractorName?: string;
  status: 'draft' | 'pending_approval' | 'sent' | 'paid';
  adminApprovalRequired?: boolean;
  adminApprovedAt?: any;
  adminApprovedBy?: string;
  totalAmount: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  dueDate: any;
  stripePaymentLink?: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  stripeInvoicePdf?: string;
  autoChargeAttempted?: boolean;
  autoChargeStatus?: 'pending' | 'succeeded' | 'failed' | 'requires_action';
  autoChargeError?: string;
  notes?: string;
  terms?: string;
  createdAt: any;
}

interface ClientBilling {
  defaultPaymentMethodId?: string;
  /**
   * Pretty label for the default PM — "Visa ···4242" for a card,
   * "Chase Bank ···6789" for a bank. Derived from the paymentMethods
   * array entry whose id matches defaultPaymentMethodId, falling back
   * to the legacy savedCardBrand/savedCardLast4 fields when older
   * clients haven't been migrated yet.
   */
  defaultMethodLabel?: string;
  defaultMethodType?: 'card' | 'us_bank_account';
  savedCardLast4?: string;
  savedCardBrand?: string;
  autoPayEnabled?: boolean;
}

type PendingInvoiceItem = {
  workOrderId: string;
  workOrderTitle: string;
  workOrderNumber?: string;
  clientId: string;
  clientName: string;
  subcontractorName?: string;
  quoteId: string;
  quoteStatus: Quote['status'];
  isDiagnostic: boolean;
  /** True iff the source quote already has the markup baked into clientLineItems. */
  markupAlreadyApplied: boolean;
  /** Marked-up amount if applied, else raw subcontractor cost. */
  amount: number;
};

function InvoicesManagementInner() {
  const searchParams = useSearchParams();
  const workOrderIdFilter = searchParams.get('workOrderId');
  const { viewMode } = useViewControls();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clientBillingMap, setClientBillingMap] = useState<Record<string, ClientBilling>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'pending_approval' | 'sent' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [chargingInvoice, setChargingInvoice] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [refreshingLinks, setRefreshingLinks] = useState(false);

  const handleRefreshLegacyStripeLinks = async () => {
    setRefreshingLinks(true);
    let totalProcessed = 0;
    let totalFailed = 0;
    let lastFound = 0;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        toast.error('You must be signed in.');
        return;
      }
      // Run the backfill in batches until the server reports remaining: 0.
      // Each call processes up to 25 invoices.
      // Cap iterations defensively.
      for (let i = 0; i < 40; i += 1) {
        const res = await fetch('/api/stripe/backfill-payment-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Refresh failed (HTTP ${res.status})`);
        }
        const data = await res.json();
        totalProcessed += Number(data.processed) || 0;
        totalFailed += Number(data.failed) || 0;
        lastFound = Number(data.totalFound) || 0;
        if (i === 0 && lastFound === 0) {
          toast.success('No legacy Stripe links to refresh.');
          return;
        }
        if (Number(data.remaining) === 0) break;
      }
      if (totalFailed > 0) {
        toast.error(`Refreshed ${totalProcessed} link${totalProcessed === 1 ? '' : 's'} — ${totalFailed} failed`);
      } else {
        toast.success(`Refreshed ${totalProcessed} Stripe link${totalProcessed === 1 ? '' : 's'} to hosted invoice URLs.`);
      }
    } catch (err: any) {
      console.error('Backfill error:', err);
      toast.error(err?.message || 'Failed to refresh Stripe links');
    } finally {
      setRefreshingLinks(false);
    }
  };
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    notes: '',
    terms: '',
    status: 'draft' as Invoice['status'],
  });

  const [lineItems, setLineItems] = useState<Invoice['lineItems']>([
    { description: '', quantity: 1, unitPrice: 0, amount: 0 }
  ]);

  const fetchInvoices = async () => {
    try {
      const invoicesQuery = query(
        collection(db, 'invoices'),
        orderBy('createdAt', 'desc'),
        limit(500),
      );
      const snapshot = await getDocs(invoicesQuery);
      const invoicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Invoice[];
      setInvoices(invoicesData);

      // Load billing info for unique clients that have unpaid invoices.
      // We fetch the paymentMethods[] array too so we can build a clean
      // human label for the Auto Charge button regardless of card vs bank.
      const unpaidClientIds = [...new Set(
        invoicesData
          .filter(inv => inv.status === 'sent')
          .map(inv => inv.clientId)
      )];
      if (unpaidClientIds.length > 0) {
        const billingMap: Record<string, ClientBilling> = {};
        await Promise.all(unpaidClientIds.map(async (clientId) => {
          try {
            const clientSnap = await getDoc(doc(db, 'clients', clientId));
            if (clientSnap.exists()) {
              const d = clientSnap.data();
              const methods: any[] = Array.isArray(d.paymentMethods) ? d.paymentMethods : [];
              const defaultPm = methods.find((m: any) => m.id === d.defaultPaymentMethodId);
              let label = '';
              let type: 'card' | 'us_bank_account' | undefined;
              if (defaultPm) {
                if (defaultPm.type === 'us_bank_account') {
                  type = 'us_bank_account';
                  label = `${defaultPm.bankName || defaultPm.brand || 'Bank'} ···${defaultPm.last4 || ''}`;
                } else {
                  type = 'card';
                  const brand = (defaultPm.brand || 'Card').replace(/^./, (c: string) => c.toUpperCase());
                  label = `${brand} ···${defaultPm.last4 || ''}`;
                }
              } else if (d.savedCardBrand && d.savedCardLast4) {
                type = 'card';
                const brand = String(d.savedCardBrand).replace(/^./, (c: string) => c.toUpperCase());
                label = `${brand} ···${d.savedCardLast4}`;
              }
              billingMap[clientId] = {
                defaultPaymentMethodId: d.defaultPaymentMethodId,
                defaultMethodLabel: label || undefined,
                defaultMethodType: type,
                savedCardLast4: d.savedCardLast4,
                savedCardBrand: d.savedCardBrand,
                autoPayEnabled: d.autoPayEnabled,
              };
            }
          } catch {}
        }));
        setClientBillingMap(billingMap);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoCharge = async (invoice: Invoice) => {
    const billing = clientBillingMap[invoice.clientId];
    if (!billing?.defaultPaymentMethodId) {
      toast.error('This client has no saved card or bank account. Ask them to add one or add it from the client detail page.');
      return;
    }
    const methodLabel = billing.defaultMethodLabel || 'saved payment method';
    if (!confirm(`Auto-charge ${formatMoney(invoice.totalAmount)} from ${invoice.clientName}'s ${methodLabel}?`)) return;
    setChargingInvoice(invoice.id);
    try {
      const res = await fetch('/api/stripe/charge-saved-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, clientId: invoice.clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Charge failed');
      if (data.status === 'succeeded') {
        toast.success(`${formatMoney(invoice.totalAmount)} charged successfully! Invoice marked as paid.`);
      } else {
        toast.warning(`Charge requires authentication from the client (status: ${data.status}).`);
      }
      fetchInvoices();
    } catch (error: any) {
      toast.error(error.message || 'Failed to charge invoice');
    } finally {
      setChargingInvoice(null);
    }
  };

  const fetchAcceptedQuotes = async () => {
    try {
      // Pull every quote that has reached the client OR is sitting in the
      // admin's queue — these are the candidates for invoice generation.
      // Rejected / draft / invoiced quotes are skipped.
      // Firestore's `where(... 'in' ...)` is capped at 10 values; we have 3.
      const quotesQuery = query(
        collection(db, 'quotes'),
        where('status', 'in', ['pending', 'sent_to_client', 'accepted']),
        limit(500),
      );
      const snapshot = await getDocs(quotesQuery);
      const acceptedQuotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quote));
      setQuotes(acceptedQuotes);
    } catch (error) {
      console.error('Error fetching quotes:', error);
    }
  };

  // Set of WO ids whose status is 'archived'. Used to filter the
  // Pending Invoice Generation panel — archived work orders shouldn't
  // show up as billing candidates because they were intentionally
  // shelved. Fetched separately so the existing invoice/quote queries
  // stay focused.
  const [archivedWorkOrderIds, setArchivedWorkOrderIds] = useState<Set<string>>(new Set());

  // Pending-panel in-page create state. `creatingForWoId` drives the
  // spinner on the row that's currently being processed; the rest is
  // the edit-modal form state — opens when the admin clicks Create
  // Invoice on a Pending row, pre-populated with the source quote's
  // line items / amounts. Always shown (regardless of markup mode) so
  // the admin can review every detail before the invoice is written.
  const [creatingForWoId, setCreatingForWoId] = useState<string | null>(null);
  const [editingPendingItem, setEditingPendingItem] = useState<PendingInvoiceItem | null>(null);
  const [editLineItems, setEditLineItems] = useState<Invoice['lineItems']>([]);
  const [editMarkupContext, setEditMarkupContext] = useState<'editable' | 'locked' | 'diagnostic'>('editable');
  const [editMarkupPercent, setEditMarkupPercent] = useState('20');
  const [editDueDate, setEditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTerms, setEditTerms] = useState('Payment due within 30 days. Late payments may incur additional fees.');
  const [editStatus, setEditStatus] = useState<'draft' | 'sent'>('draft');
  const [editDiscountAmount, setEditDiscountAmount] = useState('0');
  const [editClientPms, setEditClientPms] = useState<Array<{ id: string; type?: string; last4?: string; brand?: string; bankName?: string; isDefault?: boolean }>>([]);
  const [editAutoChargePmId, setEditAutoChargePmId] = useState('');
  const [editPmLoading, setEditPmLoading] = useState(false);

  // Load the selected client's saved PMs when the pending-item modal opens.
  useEffect(() => {
    const clientId = editingPendingItem?.clientId;
    if (!clientId) { setEditClientPms([]); setEditAutoChargePmId(''); return; }
    let cancelled = false;
    setEditPmLoading(true);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'clients', clientId));
        if (cancelled || !snap.exists()) { setEditClientPms([]); setEditAutoChargePmId(''); return; }
        const cd = snap.data() as any;
        const raw: any[] = Array.isArray(cd.paymentMethods) ? cd.paymentMethods : [];
        const chargeable = raw
          .filter((m: any) => m?.id && m.verificationStatus !== 'pending')
          .map((m: any) => ({ id: m.id, type: m.type, last4: m.last4, brand: m.brand, bankName: m.bankName, isDefault: !!m.isDefault }));
        if (chargeable.length === 0 && cd.defaultPaymentMethodId && cd.savedCardLast4) {
          chargeable.push({ id: cd.defaultPaymentMethodId, type: 'card', last4: cd.savedCardLast4, brand: cd.savedCardBrand || 'card', bankName: undefined, isDefault: true });
        }
        if (!cancelled) {
          setEditClientPms(chargeable);
          const defId = cd.defaultPaymentMethodId && chargeable.some((m: any) => m.id === cd.defaultPaymentMethodId)
            ? cd.defaultPaymentMethodId : (chargeable[0]?.id || '');
          setEditAutoChargePmId(defId);
        }
      } catch { if (!cancelled) { setEditClientPms([]); setEditAutoChargePmId(''); } }
      finally { if (!cancelled) setEditPmLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [editingPendingItem?.clientId]);

  const fetchArchivedWorkOrderIds = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'workOrders'),
        where('status', '==', 'archived'),
      ));
      setArchivedWorkOrderIds(new Set(snap.docs.map(d => d.id)));
    } catch (error) {
      console.error('Error fetching archived work order ids:', error);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchAcceptedQuotes();
    fetchArchivedWorkOrderIds();
  }, []);

  /**
   * Work orders that have at least one received quote AND no invoice yet.
   * Surfaced in a panel at the top of the page so admins see what's
   * waiting to be billed instead of having to hunt for it on the work
   * orders page.
   *
   * Selection rule per WO — pick the most useful quote to seed the
   * invoice from:
   *   • prefer status === 'accepted' (client said yes), then
   *     'sent_to_client' (in client's hands), then 'pending' (admin
   *     hasn't shared yet);
   *   • prefer non-diagnostic over diagnostic so a repair quote wins
   *     over the original diagnostic visit when both exist.
   * Type lives at module scope (above InvoicesManagementInner) so the
   * edit-modal state declared at the top of the component can also
   * reference it.
   */
  const pendingInvoiceItems: PendingInvoiceItem[] = (() => {
    if (loading || quotes.length === 0) return [];
    const invoicedWoIds = new Set(invoices.map(i => i.workOrderId).filter(Boolean));
    const byWo = new Map<string, Quote[]>();
    for (const q of quotes) {
      if (!q.workOrderId) continue;
      if (invoicedWoIds.has(q.workOrderId)) continue;
      // Skip archived work orders — they were intentionally shelved and
      // shouldn't appear as billing candidates. The set is empty until
      // fetchArchivedWorkOrderIds resolves; once it does, the panel
      // re-renders and these rows fall out.
      if (archivedWorkOrderIds.has(q.workOrderId)) continue;
      const list = byWo.get(q.workOrderId) || [];
      list.push(q);
      byWo.set(q.workOrderId, list);
    }
    const rank = (q: Quote) => {
      let r = q.status === 'accepted' ? 0 : q.status === 'sent_to_client' ? 1 : 2;
      if (q.isDiagnosticQuote) r += 10;
      return r;
    };
    return Array.from(byWo.entries())
      .map(([woId, qs]) => {
        const sorted = [...qs].sort((a, b) => rank(a) - rank(b));
        const best = sorted[0];
        const hasClientLineItems = Array.isArray((best as any).clientLineItems) && (best as any).clientLineItems.length > 0;
        const markupAlreadyApplied =
          !!best.markupPercentage && best.markupPercentage > 0 && (hasClientLineItems || (best.clientAmount > 0 && best.clientAmount !== best.totalAmount));
        const displayAmount =
          markupAlreadyApplied && best.clientAmount
            ? best.clientAmount
            : best.totalAmount || best.clientAmount || 0;
        return {
          workOrderId: woId,
          workOrderTitle: best.workOrderTitle || 'Untitled',
          workOrderNumber: (best as any).workOrderNumber,
          clientId: best.clientId,
          clientName: best.clientName,
          subcontractorName: best.subcontractorName,
          quoteId: best.id,
          quoteStatus: best.status,
          isDiagnostic: !!best.isDiagnosticQuote,
          markupAlreadyApplied,
          amount: displayAmount,
        };
      })
      // Sort: not-yet-shared (admin still needs to do something) first,
      // then ready-to-bill, with newest at the top within each group.
      .sort((a, b) => {
        const stage = (i: PendingInvoiceItem) =>
          i.quoteStatus === 'pending' ? 0 : i.quoteStatus === 'sent_to_client' ? 1 : 2;
        return stage(a) - stage(b);
      });
  })();

  /**
   * In-page invoice creation from the Pending panel — replaces the
   * old navigate-to-/invoices/new flow so admins stay on the invoices
   * list. Mirrors the work-orders page's one-click "Generate & Send
   * Invoice" UX.
   *
   * Markup logic:
   *   • markupAlreadyApplied (quote was shared with client at a
   *     markup) → use the quote's clientLineItems / clientAmount
   *     as-is. Don't re-apply markup.
   *   • diagnostic → use raw lineItems with NO markup, ever.
   *   • editable (quote not yet shared) → caller passes a markup %
   *     gathered from the inline modal; we scale lineItems by
   *     (1 + markup/100).
   */
  /**
   * Persists an invoice using values the admin reviewed in the edit
   * modal. Doesn't recompute from the quote — every field the user
   * sees in the modal (line items, markup %, due date, notes, status)
   * flows through here unmodified, so what the admin confirmed is
   * what's written.
   */
  type CreateInvoiceParams = {
    item: PendingInvoiceItem;
    lineItems: Invoice['lineItems'];
    markupPercent: number;
    markupContext: 'editable' | 'locked' | 'diagnostic';
    dueDate: Date;
    notes: string;
    terms: string;
    status: 'draft' | 'sent';
    discountAmount: number;
    autoChargePmId?: string;
    autoChargeMethodLabel?: string;
  };

  const createInvoiceForPendingItem = async (params: CreateInvoiceParams) => {
    const { item, lineItems: editedLineItems, markupPercent, markupContext, dueDate, notes, terms, status, discountAmount, autoChargePmId, autoChargeMethodLabel } = params;
    setCreatingForWoId(item.workOrderId);
    try {
      const quote = quotes.find(q => q.id === item.quoteId);
      if (!quote) {
        toast.error('Source quote not found.');
        return;
      }
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('You must be logged in.');
        return;
      }

      const round2 = (n: number) => Math.round(n * 100) / 100;

      // The modal already let the admin edit line items directly. For
      // the editable-markup path the displayed prices are the RAW
      // sub-cost values; we apply the markup factor at submit time so
      // what gets persisted matches what the totals breakdown showed.
      // Locked/diagnostic skip this — admin saw the final numbers.
      const factor = markupContext === 'editable' && markupPercent > 0
        ? 1 + markupPercent / 100
        : 1;
      const finalLineItems: Invoice['lineItems'] = factor === 1
        ? editedLineItems.map(li => ({
            description: String(li.description || ''),
            quantity: Number(li.quantity ?? 1),
            unitPrice: round2(Number(li.unitPrice ?? 0)),
            amount: round2(Number(li.amount ?? 0)),
          }))
        : editedLineItems.map(li => ({
            description: String(li.description || ''),
            quantity: Number(li.quantity ?? 1),
            unitPrice: round2(Number(li.unitPrice ?? 0) * factor),
            amount: round2(Number(li.amount ?? 0) * factor),
          }));

      const subtotalAmount = round2(finalLineItems.reduce((s, li) => s + (li.amount || 0), 0));
      const discountNum = round2(Math.max(0, discountAmount || 0));
      const totalAmount = round2(Math.max(0, subtotalAmount - discountNum));
      if (!totalAmount || totalAmount <= 0) {
        toast.error('Cannot create invoice: total must be greater than 0.');
        return;
      }
      if (finalLineItems.some(li => !li.description?.trim())) {
        toast.error('Every line item needs a description.');
        return;
      }

      // Resolve client email (quotes don't always carry it).
      let clientEmail = quote.clientEmail || '';
      if (!clientEmail && quote.clientId) {
        const cd = await getDoc(doc(db, 'clients', quote.clientId));
        if (cd.exists()) {
          clientEmail = (cd.data() as any).email || (cd.data() as any).clientEmail || '';
        }
      }
      if (!clientEmail) {
        toast.error('Client has no email on file. Add one before invoicing.');
        return;
      }

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? (adminDoc.data() as any).fullName || 'Admin' : 'Admin';

      const invoiceNumber = generateInvoiceNumber();

      const createdEvent = createInvoiceTimelineEvent({
        type: 'created',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: `Invoice created from quote ${quote.id}${
          markupContext === 'locked'
            ? ` (markup ${quote.markupPercentage || 0}% from shared quote)`
            : markupContext === 'diagnostic'
              ? ' (diagnostic visit, no markup)'
              : markupPercent > 0
                ? ` with ${markupPercent}% markup applied at create`
                : ' with no markup'
        }`,
        metadata: {
          source: 'pending_panel',
          quoteId: quote.id,
          workOrderId: quote.workOrderId,
          markupPercentage: markupContext === 'locked' ? (quote.markupPercentage || 0) : markupPercent,
        },
      });

      const invoiceRef = await addDoc(collection(db, 'invoices'), {
        invoiceNumber,
        quoteId: quote.id,
        workOrderId: quote.workOrderId,
        workOrderTitle: quote.workOrderTitle || '',
        clientId: quote.clientId,
        clientName: quote.clientName,
        clientEmail,
        subcontractorId: quote.subcontractorId,
        subcontractorName: quote.subcontractorName,
        status,
        totalAmount,
        lineItems: finalLineItems,
        discountAmount: discountNum,
        dueDate,
        notes,
        terms,
        ...(autoChargePmId ? { autoChargePaymentMethodId: autoChargePmId, autoChargeMethodLabel: autoChargeMethodLabel || '' } : {}),
        markupPercentage: markupContext === 'locked' ? (quote.markupPercentage || 0) : markupPercent,
        markupAppliedAtCreate: markupContext === 'editable' && markupPercent > 0,
        markupContext,
        createdBy: currentUser.uid,
        createdByName: adminName,
        creationSource: 'pending_panel',
        timeline: [createdEvent],
        systemInformation: {
          createdBy: {
            id: currentUser.uid,
            name: adminName,
            role: 'admin',
            timestamp: Timestamp.now(),
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Best-effort Stripe payment link in the background — keeps the
      // UI responsive (per the No Stuck Buttons rule).
      fetch('/api/stripe/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoiceRef.id,
          invoiceNumber,
          amount: totalAmount,
          customerEmail: clientEmail,
          clientName: quote.clientName,
          clientId: quote.clientId,
        }),
      })
        .then(async res => {
          if (!res.ok) return;
          const data = await res.json().catch(() => null);
          if (data?.paymentLink) {
            try {
              await updateDoc(doc(db, 'invoices', invoiceRef.id), {
                stripePaymentLink: data.paymentLink,
                stripeInvoiceId: data.stripeInvoiceId || data.sessionId,
              });
            } catch (e) {
              console.warn('Could not persist Stripe link on invoice:', e);
            }
          }
        })
        .catch(err => console.error('Stripe link (background) failed:', err));

      toast.success(`Invoice ${invoiceNumber} created${
        markupContext === 'editable' && markupPercent > 0 ? ` with ${markupPercent}% markup` : ''
      }.`);

      // Refresh the lists so the new invoice appears and the row falls
      // out of the Pending panel. Close the edit modal here too —
      // success path only; on error we leave the modal open so the
      // admin can retry without re-entering everything.
      fetchInvoices();
      setEditingPendingItem(null);
    } catch (err: any) {
      console.error('createInvoiceForPendingItem failed:', err);
      toast.error(err?.message || 'Failed to create invoice');
    } finally {
      setCreatingForWoId(null);
    }
  };

  /**
   * Open the edit modal pre-populated from the source quote. The
   * modal lets the admin tweak line items, markup, due date, notes,
   * and status before the invoice is written. Used for ALL three
   * markup contexts (locked / diagnostic / editable) so the create
   * flow is consistent — the admin always sees a preview first.
   */
  const handlePanelCreateClick = (item: PendingInvoiceItem) => {
    const quote = quotes.find(q => q.id === item.quoteId);
    if (!quote) {
      toast.error('Source quote not found.');
      return;
    }

    // Resolve markup mode + initial line items.
    const clientLineItems = (quote as any).clientLineItems as any[] | undefined;
    const ctx: 'editable' | 'locked' | 'diagnostic' =
      item.isDiagnostic ? 'diagnostic' : item.markupAlreadyApplied ? 'locked' : 'editable';

    let seedLineItems: Invoice['lineItems'] = [];
    if (ctx === 'locked' && Array.isArray(clientLineItems) && clientLineItems.length > 0) {
      // Already-marked-up client-facing rows.
      seedLineItems = clientLineItems.map((li: any) => ({
        description: String(li.description || ''),
        quantity: Number(li.quantity ?? 1),
        unitPrice: Number(li.unitPrice ?? 0),
        amount: Number(li.amount ?? (Number(li.quantity ?? 1) * Number(li.unitPrice ?? 0))),
      }));
    } else if (Array.isArray(quote.lineItems) && quote.lineItems.length > 0) {
      // Raw subcontractor cost. For the editable path the markup field
      // multiplies these at submit time; for diagnostic it's used as-is.
      seedLineItems = quote.lineItems.map((li: any) => ({
        description: String(li.description || ''),
        quantity: Number(li.quantity ?? 1),
        unitPrice: Number(li.unitPrice ?? 0),
        amount: Number(li.amount ?? (Number(li.quantity ?? 1) * Number(li.unitPrice ?? 0))),
      }));
    } else {
      // Fallback: a single line summarising the total.
      const total = Number(
        ctx === 'locked'
          ? (quote.clientAmount ?? quote.totalAmount ?? 0)
          : (quote.totalAmount ?? quote.clientAmount ?? 0),
      );
      if (total > 0) {
        seedLineItems = [{ description: quote.workOrderTitle || 'Service', quantity: 1, unitPrice: total, amount: total }];
      } else {
        seedLineItems = [{ description: '', quantity: 1, unitPrice: 0, amount: 0 }];
      }
    }

    // Initial markup value: existing % from the quote when locked,
    // 0 for diagnostic, blank-default 20 for editable.
    const initialMarkup =
      ctx === 'locked'
        ? String(quote.markupPercentage || 0)
        : ctx === 'diagnostic'
          ? '0'
          : '20';

    // Default due date: 30 days out, ISO yyyy-mm-dd for <input type="date">.
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const isoDue = due.toISOString().slice(0, 10);

    setEditingPendingItem(item);
    setEditLineItems(seedLineItems);
    setEditMarkupContext(ctx);
    setEditMarkupPercent(initialMarkup);
    setEditDueDate(isoDue);
    setEditNotes(quote.notes || '');
    setEditTerms('Payment due within 30 days. Late payments may incur additional fees.');
    setEditDiscountAmount('0');
    setEditStatus('draft');
  };

  /** Read-modify-write helpers for the modal's editable line items. */
  const updateEditLineItem = (index: number, field: keyof Invoice['lineItems'][number], raw: string) => {
    setEditLineItems(prev => {
      const next = [...prev];
      const item = { ...next[index] };
      if (field === 'description') {
        item.description = raw;
      } else {
        const num = parseFloat(raw) || 0;
        (item as any)[field] = num;
        if (field === 'quantity' || field === 'unitPrice') {
          item.amount = (field === 'quantity' ? num : item.quantity) * (field === 'unitPrice' ? num : item.unitPrice);
        }
        if (field === 'amount') item.amount = num;
      }
      next[index] = item;
      return next;
    });
  };

  const addEditLineItem = () =>
    setEditLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, amount: 0 }]);

  const removeEditLineItem = (i: number) =>
    setEditLineItems(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  /** Submit handler — validates the modal form and persists the invoice. */
  const handleConfirmEditAndCreate = () => {
    if (!editingPendingItem) return;
    const num = parseFloat(editMarkupPercent);
    const markupNum = Number.isFinite(num) && num >= 0 ? num : 0;
    if (editMarkupContext === 'editable' && (!Number.isFinite(num) || num < 0)) {
      toast.error('Enter a valid markup % (0 or higher).');
      return;
    }
    if (!editDueDate) {
      toast.error('Pick a due date.');
      return;
    }
    if (editLineItems.length === 0 || editLineItems.every(li => !li.description.trim())) {
      toast.error('Add at least one line item.');
      return;
    }
    const selectedPm = editClientPms.find((m) => m.id === editAutoChargePmId);
    const pmLabel = selectedPm
      ? selectedPm.type === 'us_bank_account'
        ? `${selectedPm.bankName || selectedPm.brand || 'Bank'} ••${selectedPm.last4 || ''}`
        : `${(selectedPm.brand || 'Card').replace(/^./, (c) => c.toUpperCase())} ••${selectedPm.last4 || ''}`
      : '';
    createInvoiceForPendingItem({
      item: editingPendingItem,
      lineItems: editLineItems,
      markupPercent: markupNum,
      markupContext: editMarkupContext,
      dueDate: new Date(editDueDate),
      notes: editNotes,
      terms: editTerms,
      status: editStatus,
      discountAmount: parseFloat(editDiscountAmount) || 0,
      autoChargePmId: editAutoChargePmId || undefined,
      autoChargeMethodLabel: pmLabel || undefined,
    });
  };

  const generateInvoiceFromQuote = async (quote: any) => {
    try {
      setGenerating(quote.id);
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const invoiceNumber = generateInvoiceNumber();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data()?.fullName : 'Admin';

      // Resolve client email — quotes may not store it, so fall back to the clients collection
      let clientEmail = quote.clientEmail || '';
      if (!clientEmail && quote.clientId) {
        const clientDoc = await getDoc(doc(db, 'clients', quote.clientId));
        if (clientDoc.exists()) {
          clientEmail = clientDoc.data()?.email || clientDoc.data()?.clientEmail || '';
        }
      }

      const createdEvent = createInvoiceTimelineEvent({
        type: 'created',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: 'Invoice created from accepted quote',
        metadata: { source: 'from_quote', quoteId: quote.id, workOrderNumber: quote.workOrderNumber },
      });
      const invoiceData = {
        invoiceNumber,
        quoteId: quote.id,
        workOrderId: quote.workOrderId,
        workOrderTitle: quote.workOrderTitle,
        clientId: quote.clientId,
        clientName: quote.clientName,
        clientEmail,
        subcontractorId: quote.subcontractorId,
        subcontractorName: quote.subcontractorName,
        status: 'draft',
        totalAmount: quote.clientAmount || quote.totalAmount,
        lineItems: quote.lineItems || [],
        discountAmount: quote.discountAmount || 0,
        dueDate: dueDate,
        notes: quote.notes || '',
        terms: 'Payment due within 30 days. Late payments may incur additional fees.',
        createdBy: currentUser.uid,
        creationSource: 'from_quote',
        timeline: [createdEvent],
        systemInformation: {
          createdBy: {
            id: currentUser.uid,
            name: adminName,
            role: 'admin',
            timestamp: Timestamp.now(),
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Validate required fields before creating invoice
      if (!invoiceData.totalAmount || invoiceData.totalAmount <= 0) {
        toast.error('Cannot create invoice: Quote amount must be greater than 0');
        setGenerating(null);
        return;
      }

      if (!clientEmail) {
        toast.error('Cannot create invoice: Client email is missing. Please add an email to this client.');
        setGenerating(null);
        return;
      }

      // TODO(invoice-approval): when generating an invoice from an accepted
      // quote, mirror the gating in app/admin-portal/work-orders/page.tsx
      // handleSendInvoice — check isInvoiceApprovalRequiredForClient and
      // create with status='pending_approval' + approvalDeadlineAt instead of
      // sending immediately. See /lib/invoice-approval.ts.
      const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);

      // Create Stripe payment link
      try {
        const stripeResponse = await fetch('/api/stripe/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: invoiceRef.id,
            invoiceNumber: invoiceNumber,
            amount: invoiceData.totalAmount,
            customerEmail: clientEmail,
            clientName: quote.clientName || invoiceData.clientName,
            clientId: quote.clientId || invoiceData.clientId,
          }),
        });

        const stripeData = await stripeResponse.json();
        
        if (!stripeResponse.ok) {
          console.error('Stripe payment link creation failed:', stripeData);
          toast.error(`Failed to create payment link: ${stripeData.error || 'Unknown error'}`);
          // Still create invoice but mark as draft
          await updateDoc(doc(db, 'invoices', invoiceRef.id), {
            status: 'draft',
            updatedAt: serverTimestamp(),
          });
        } else if (stripeData.paymentLink) {
          const sentEvent = createInvoiceTimelineEvent({
            type: 'sent',
            userId: currentUser.uid,
            userName: adminName,
            userRole: 'admin',
            details: 'Invoice sent to client with payment link',
            metadata: { invoiceNumber },
          });
          const invSnap = await getDoc(doc(db, 'invoices', invoiceRef.id));
          const invData = invSnap.data();
          const existingTimeline = invData?.timeline || [];
          const existingSysInfo = invData?.systemInformation || {};

          // Per-client admin-approval gate. When the client has the
          // requireInvoiceApproval flag on, the invoice is born in
          // 'pending_approval' with NO client email or notification —
          // admin must explicitly Approve & notify on the invoices page.
          const adminApprovalNeeded = await shouldRequireAdminApproval(db, quote.clientId);

          if (adminApprovalNeeded) {
            await updateDoc(doc(db, 'invoices', invoiceRef.id), {
              stripePaymentLink: stripeData.paymentLink,
              stripeSessionId: stripeData.sessionId,
              status: 'pending_approval',
              adminApprovalRequired: true,
              timeline: [...existingTimeline, createInvoiceTimelineEvent({
                type: 'created',
                userId: currentUser.uid,
                userName: adminName,
                userRole: 'admin',
                details: 'Invoice generated from quote — awaiting internal admin approval before client is notified',
                metadata: { invoiceNumber, source: 'from_quote' },
              })],
              systemInformation: existingSysInfo,
              updatedAt: serverTimestamp(),
            });
            toast.success(`Invoice ${invoiceNumber} created — pending internal admin approval. Client not notified yet.`);
          } else {
            await updateDoc(doc(db, 'invoices', invoiceRef.id), {
              stripePaymentLink: stripeData.paymentLink,
              stripeSessionId: stripeData.sessionId,
              status: 'sent',
              sentAt: serverTimestamp(),
              timeline: [...existingTimeline, sentEvent],
              systemInformation: {
                ...existingSysInfo,
                sentBy: {
                  id: currentUser.uid,
                  name: adminName,
                  timestamp: Timestamp.now(),
                },
              },
              updatedAt: serverTimestamp(),
            });

            // Notify client of invoice
            await notifyClientOfInvoice(
              quote.clientId,
              invoiceRef.id,
              invoiceNumber,
              quote.workOrderNumber || quote.workOrderId || '',
              invoiceData.totalAmount
            );

            toast.success(`Invoice ${invoiceNumber} generated, payment link created, and sent to client`);
          }
        } else {
          toast.success(`Invoice ${invoiceNumber} created successfully. Create payment link to send.`);
        }
      } catch (error: any) {
        console.error('Error creating payment link:', error);
        const errorMessage = error?.message || error?.error || 'Unknown error';
        toast.error(`Failed to create payment link: ${errorMessage}. Invoice ${invoiceNumber} created but not sent.`);
        // Still update invoice but mark as draft
        await updateDoc(doc(db, 'invoices', invoiceRef.id), {
          status: 'draft',
          updatedAt: serverTimestamp(),
        });
      }

      // Mark the quote as invoiced so it no longer appears in the pending list
      await updateDoc(doc(db, 'quotes', quote.id), {
        status: 'invoiced',
        invoiceId: invoiceRef.id,
        updatedAt: serverTimestamp(),
      });

      fetchInvoices();
      fetchAcceptedQuotes();
    } catch (error) {
      console.error('Error generating invoice:', error);
      toast.error('Failed to generate invoice');
    } finally {
      setGenerating(null);
    }
  };

  const createStripePaymentLink = async (invoice: Invoice) => {
    // Validate required fields
    if (!invoice.totalAmount || invoice.totalAmount <= 0) {
      toast.error('Cannot create payment link: Invoice amount must be greater than 0');
      return;
    }

    if (!invoice.clientEmail) {
      toast.error('Cannot create payment link: Client email is missing');
      return;
    }

    try {
      const response = await fetch('/api/stripe/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.totalAmount,
          customerEmail: invoice.clientEmail,
          clientName: invoice.clientName || 'Client',
          clientId: invoice.clientId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payment link');
      }

      const data = await response.json();
      
      if (!data.paymentLink) {
        throw new Error(data.error || 'Payment link not returned');
      }

      // Update invoice with Stripe payment link
      await updateDoc(doc(db, 'invoices', invoice.id), {
        stripePaymentLink: data.paymentLink,
        stripeSessionId: data.sessionId,
        updatedAt: serverTimestamp(),
      });

      toast.success('Stripe payment link created successfully');
      fetchInvoices();
    } catch (error: any) {
      console.error('Error creating payment link:', error);
      const errorMessage = error?.message || error?.error || 'Unknown error';
      toast.error(`Failed to create payment link: ${errorMessage}`);
    }
  };

  /**
   * Prefer Stripe's hosted invoice PDF when available (carries pay-online
   * link + Stripe layout). Falls back to the local generator only when
   * the Stripe PDF isn't ready (draft / Stripe link still pending).
   */
  const downloadInvoice = (invoice: Invoice) => {
    try {
      if (invoice.stripeInvoicePdf) {
        window.open(invoice.stripeInvoicePdf, '_blank', 'noopener,noreferrer');
        return;
      }
      downloadInvoicePDF({
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        workOrderName: invoice.workOrderTitle,
        vendorName: invoice.subcontractorName,
        serviceDescription: invoice.workOrderDescription,
        lineItems: invoice.lineItems,
        subtotal: invoice.totalAmount,
        discountAmount: 0,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate?.toDate?.()?.toLocaleDateString?.() || 'N/A',
        notes: invoice.notes,
        terms: invoice.terms,
      });
    } catch (error) {
      console.error('Error downloading invoice:', error);
      toast.error('Failed to download invoice');
    }
  };

  const resetForm = () => {
    setFormData({
      notes: '',
      terms: '',
      status: 'draft',
    });
    setLineItems([{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenEdit = (invoice: Invoice) => {
    setFormData({
      notes: invoice.notes || '',
      terms: invoice.terms || '',
      status: invoice.status,
    });
    setLineItems(invoice.lineItems.length > 0 ? invoice.lineItems : [{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
    setEditingId(invoice.id);
    setShowModal(true);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof Invoice['lineItems'][0], value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'quantity' || field === 'unitPrice') {
      updated[index].amount = updated[index].quantity * updated[index].unitPrice;
    }

    setLineItems(updated);
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const handleSubmit = async () => {
    if (!editingId) return;

    setSubmitting(true);

    try {
      const totalAmount = calculateTotal();

      await updateDoc(doc(db, 'invoices', editingId), {
        lineItems: lineItems.filter(item => item.description && item.amount > 0),
        totalAmount,
        notes: formData.notes,
        terms: formData.terms,
        status: formData.status,
        updatedAt: serverTimestamp(),
      });

      toast.success('Invoice updated successfully');
      resetForm();
      fetchInvoices();
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      toast.error(error.message || 'Failed to save invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const markAsSent = async (invoiceId: string) => {
    try {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) {
        toast.error('Invoice not found');
        return;
      }
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data()?.fullName : 'Admin';

      // Per-client admin-approval gate. If the client has the
      // requireInvoiceApproval flag on, "Mark as Sent" is disallowed
      // here — the admin must use "Approve & notify client" on a
      // pending_approval row, which is the canonical first-touch with
      // the customer.
      const adminApprovalNeeded = await shouldRequireAdminApproval(db, invoice.clientId);
      if (adminApprovalNeeded) {
        const stamped = (invoice as any).adminApprovalRequired === true;
        if (stamped) {
          toast.error(
            `${invoice.invoiceNumber} requires internal admin approval. Use "Approve & notify client" to send.`,
          );
          return;
        }
      }

      const sentEvent = createInvoiceTimelineEvent({
        type: 'sent',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: 'Invoice marked as sent to client',
        metadata: { invoiceNumber: invoice.invoiceNumber },
      });
      const existingTimeline = (invoice as any).timeline || [];
      const existingSysInfo = (invoice as any).systemInformation || {};
      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'sent',
        sentAt: serverTimestamp(),
        timeline: [...existingTimeline, sentEvent],
        systemInformation: {
          ...existingSysInfo,
          sentBy: {
            id: currentUser.uid,
            name: adminName,
            timestamp: Timestamp.now(),
          },
        },
        updatedAt: serverTimestamp(),
      });

      // Notify client of invoice
      await notifyClientOfInvoice(
        invoice.clientId,
        invoiceId,
        invoice.invoiceNumber,
        invoice.workOrderTitle,
        invoice.totalAmount
      );

      toast.success('Invoice marked as sent and client notified');
      fetchInvoices();
    } catch (error) {
      console.error('Error marking invoice as sent:', error);
      toast.error('Failed to update invoice status');
    }
  };

  const approveAndNotifyClient = async (invoiceId: string) => {
    setApprovingId(invoiceId);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/invoices/${invoiceId}/admin-approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || `Approval failed: HTTP ${res.status}`);
      } else if (data?.skipped) {
        toast.info(data.message || 'Already approved.');
      } else {
        toast.success(data.message || 'Approved — client notified.');
      }
      fetchInvoices();
    } catch (err: any) {
      toast.error(err?.message || 'Approval request failed');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeleteInvoice = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setShowDeleteModal(true);
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    try {
      await deleteDoc(doc(db, 'invoices', invoiceToDelete.id));
      toast.success('Invoice deleted successfully');
      setShowDeleteModal(false);
      setInvoiceToDelete(null);
      fetchInvoices();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Failed to delete invoice');
    }
  };

  const handleUploadPdf = async () => {
    if (!selectedFile) {
      toast.error('Please select a PDF file');
      return;
    }

    setUploadingPdf(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/invoices/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process PDF');
      }

      toast.success('Invoice created successfully from uploaded PDF!');
      setShowUploadModal(false);
      setSelectedFile(null);
      fetchInvoices();
    } catch (error: any) {
      console.error('Error uploading PDF:', error);
      toast.error(error.message || 'Failed to process PDF');
    } finally {
      setUploadingPdf(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (workOrderIdFilter && inv.workOrderId !== workOrderIdFilter) return false;
    // Filter by status
    const statusMatch = filter === 'all' || inv.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      inv.invoiceNumber.toLowerCase().includes(searchLower) ||
      inv.workOrderTitle.toLowerCase().includes(searchLower) ||
      inv.clientName.toLowerCase().includes(searchLower) ||
      inv.clientEmail.toLowerCase().includes(searchLower) ||
      (inv.subcontractorName && inv.subcontractorName.toLowerCase().includes(searchLower));

    return statusMatch && searchMatch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'text-amber-700 bg-amber-50 border border-amber-200';
      case 'sent': return 'text-blue-700 bg-blue-50 border border-blue-200';
      case 'paid': return 'text-emerald-700 bg-emerald-50 border border-emerald-200';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            {workOrderIdFilter && (
              <p className="text-sm text-muted-foreground mb-1">
                Showing invoices for this work order ·{' '}
                <Link href={`/admin-portal/work-orders/${workOrderIdFilter}`} className="text-primary hover:underline">
                  Back to work order
                </Link>
                {' · '}
                <Link href="/admin-portal/invoices" className="text-primary hover:underline">
                  All invoices
                </Link>
              </p>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Invoices</h1>
            <p className="text-muted-foreground mt-2">Generate and manage invoices with Stripe payment links</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRefreshLegacyStripeLinks}
              disabled={refreshingLinks}
              title="Replace any saved checkout.stripe.com links with hosted invoice URLs"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshingLinks ? 'animate-spin' : ''}`} />
              {refreshingLinks ? 'Refreshing…' : 'Refresh Stripe Links'}
            </Button>
            <Link href="/admin-portal/invoices/new">
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create Invoice
              </Button>
            </Link>
            <Button onClick={() => setShowUploadModal(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Invoice
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices by number, title, client, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/*
          Pending Invoice Generation — work orders with received quotes
          that don't have an invoice yet. Pinned at the top so admins
          see what's waiting to be billed without having to scan the
          work-orders page.
          The "Add markup at create" / "Markup applied · ready" hint
          tells the admin which mode the create flow will land in:
            • markup already applied (quote was shared with client) →
              the create page pulls the marked-up clientLineItems
              and the markup field is locked / informational
            • diagnostic visit → create page hides the markup field
            • not yet shared → create page shows an editable Markup %
              that scales the line items at submit time
        */}
        {pendingInvoiceItems.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
                <FileText className="h-5 w-5" />
                Pending Invoice Generation ({pendingInvoiceItems.length})
              </CardTitle>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/70 mt-1">
                Work orders that have received quotes but no invoice yet. Click <span className="font-semibold">Create Invoice</span> to generate one — line items pre-fill from the quote.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pendingInvoiceItems.map(item => (
                  <div
                    key={item.workOrderId}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-card border border-amber-100 dark:border-amber-900/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-foreground truncate">
                        {item.workOrderNumber ? <span className="font-mono text-xs text-muted-foreground mr-2">{item.workOrderNumber}</span> : null}
                        {item.workOrderTitle}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {item.clientName}
                        {item.subcontractorName ? <> · Sub: {item.subcontractorName}</> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-semibold text-sm tabular-nums">{formatMoney(item.amount)}</div>
                        <div className="text-[11px]">
                          {item.isDiagnostic ? (
                            <span className="text-blue-700 dark:text-blue-300">Diagnostic visit</span>
                          ) : item.markupAlreadyApplied ? (
                            <span className="text-emerald-700 dark:text-emerald-300">Markup applied · ready</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-300">Add markup at create</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                        disabled={creatingForWoId === item.workOrderId}
                        onClick={() => handlePanelCreateClick(item)}
                      >
                        {creatingForWoId === item.workOrderId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        {creatingForWoId === item.workOrderId ? 'Creating…' : 'Create Invoice'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'all',              label: 'All' },
            { value: 'draft',            label: 'Draft' },
            { value: 'pending_approval', label: 'Pending Approval' },
            { value: 'sent',             label: 'Sent' },
            { value: 'paid',             label: 'Paid' },
          ] as const).map(({ value, label }) => (
            <Button
              key={value}
              variant={filter === value ? 'default' : 'outline'}
              onClick={() => setFilter(value)}
              size="sm"
            >
              {label} ({invoices.filter(i => value === 'all' || i.status === value).length})
            </Button>
          ))}
        </div>

        {/* Invoices — list or grid based on viewMode */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-lg border border-border p-6 space-y-4 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-5 w-32 rounded bg-muted" />
                  <div className="h-6 w-16 rounded-full bg-muted" />
                </div>
                <div className="h-4 w-48 rounded bg-muted" />
                <div className="h-8 w-24 rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : filteredInvoices.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No invoices found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work Order</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {filteredInvoices.map((invoice) => {
                  const dueDate = invoice.dueDate?.toDate ? invoice.dueDate.toDate() : invoice.dueDate ? new Date(invoice.dueDate) : null;
                  const hasSavedCardRow = invoice.status === 'sent' && clientBillingMap[invoice.clientId]?.defaultPaymentMethodId;
                  return (
                    <tr key={invoice.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{invoice.invoiceNumber}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">{invoice.workOrderTitle}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{invoice.clientName}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(invoice.status)}`}>
                          {invoice.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">
                        {formatMoney(invoice.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {dueDate ? dueDate.toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Button asChild size="sm" variant="outline" title="View">
                            <Link href={`/admin-portal/invoices/${invoice.id}`} aria-label="View invoice">
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleOpenEdit(invoice)} title="Edit">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadInvoice(invoice)} title="Download PDF">
                            <Download className="h-4 w-4" />
                          </Button>
                          {hasSavedCardRow && !invoice.autoChargeAttempted && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                              onClick={() => handleAutoCharge(invoice)}
                              disabled={chargingInvoice === invoice.id}
                              title={`Auto-charge ${clientBillingMap[invoice.clientId]?.defaultMethodLabel || 'saved payment method'}`}
                            >
                              {chargingInvoice === invoice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                              <span className="text-xs font-semibold">Auto Charge</span>
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDeleteInvoice(invoice)} title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInvoices.map((invoice) => {
              const dueDate = invoice.dueDate?.toDate ? invoice.dueDate.toDate() : invoice.dueDate ? new Date(invoice.dueDate) : null;
              const hasSavedCard = invoice.status === 'sent' && clientBillingMap[invoice.clientId]?.defaultPaymentMethodId;
              return (
                <div key={invoice.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                  {/* Top row: invoice number + status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{invoice.workOrderTitle}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(invoice.status)}`}>
                      {invoice.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Client + amount */}
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground truncate">{invoice.clientName}</span>
                    <span className="font-bold text-foreground shrink-0">{formatMoney(invoice.totalAmount)}</span>
                  </div>

                  {/* Due date + optional badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {dueDate && <span>Due {dueDate.toLocaleDateString()}</span>}
                    {invoice.stripePaymentLink && (
                      <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">Link ready</span>
                    )}
                    {hasSavedCard && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                        <CreditCard className="h-3 w-3" />
                        {clientBillingMap[invoice.clientId]?.defaultMethodLabel || 'On file'}
                      </span>
                    )}
                    {invoice.autoChargeAttempted && (
                      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
                        invoice.autoChargeStatus === 'succeeded' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        invoice.autoChargeStatus === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {invoice.autoChargeStatus === 'succeeded' ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                        {invoice.autoChargeStatus}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                    <Link href={`/admin-portal/invoices/${invoice.id}`} className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs">
                        <Eye className="h-3.5 w-3.5 mr-1" />View
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => handleOpenEdit(invoice)} title="Edit">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => downloadInvoice(invoice)} title="Download PDF">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {invoice.status === 'draft' && !invoice.stripePaymentLink && (
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => createStripePaymentLink(invoice)} title="Create Payment Link">
                        <CreditCard className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {invoice.status === 'draft' && invoice.stripePaymentLink && (
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => markAsSent(invoice.id)} title="Mark as Sent">
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/*
                      Auto Charge — only renders for sent invoices where the
                      client has a saved payment method (defaultPaymentMethodId).
                      Hides itself once auto-charge has already been attempted
                      so admin doesn't double-charge. Calls handleAutoCharge,
                      which posts to /api/stripe/charge-saved-card; webhook
                      then enriches the invoice with charge ID + receipt URL.
                    */}
                    {hasSavedCard && !invoice.autoChargeAttempted && (
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        onClick={() => handleAutoCharge(invoice)}
                        disabled={chargingInvoice === invoice.id}
                        title={`Auto-charge ${clientBillingMap[invoice.clientId]?.defaultMethodLabel || 'saved payment method'}`}
                      >
                        {chargingInvoice === invoice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                        {chargingInvoice === invoice.id ? 'Charging…' : 'Auto Charge'}
                      </Button>
                    )}
                    {/*
                      Approve & notify client — only renders for invoices
                      that are admin-pending AND already have a Stripe link
                      (otherwise the customer email would have no way to
                      pay). The button asks the server to flip status to
                      'sent' + send the email + fire the in-app notification
                      atomically. See /api/invoices/[id]/admin-approve.
                    */}
                    {invoice.status === 'pending_approval' && (invoice as any).adminApprovalRequired && (
                      invoice.stripePaymentLink ? (
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={() => approveAndNotifyClient(invoice.id)}
                          disabled={approvingId === invoice.id}
                          title="Approve & notify client"
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                          {approvingId === invoice.id ? 'Approving…' : 'Approve & notify'}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          onClick={() => createStripePaymentLink(invoice)}
                          title="Generate payment link before approving"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                        </Button>
                      )
                    )}
                    <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDeleteInvoice(invoice)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Modal */}
        {showModal && editingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-card rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-card z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Edit Invoice</h2>
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Line Items */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <Label>Line Items</Label>
                    <Button size="sm" variant="outline" onClick={addLineItem}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {lineItems.map((item, index) => (
                      <div key={index} className="border border-border rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-6">
                            <Label className="text-xs">Description</Label>
                            <Input
                              placeholder="Service description"
                              value={item.description}
                              onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-xs">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-xs">Unit Price ($)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            />
                          </div>
                          <div className="md:col-span-2 flex items-end gap-2">
                            <div className="flex-1">
                              <Label className="text-xs">Amount</Label>
                              <div className="text-lg font-bold text-blue-600">
                                {formatMoney(item.amount)}
                              </div>
                            </div>
                            {lineItems.length > 1 && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => removeLineItem(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total Amount:</span>
                      <span className="text-2xl font-bold text-blue-600">
                        {formatMoney(calculateTotal())}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label>Notes</Label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md p-2 min-h-[80px]"
                    placeholder="Additional notes..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

                {/* Terms */}
                <div>
                  <Label>Terms</Label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md p-2 min-h-[80px]"
                    placeholder="Payment terms..."
                    value={formData.terms}
                    onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                  />
                </div>

                {/* Status */}
                <div>
                  <Label>Status</Label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={formData.status}
                    onValueChange={(v) => setFormData({ ...formData, status: v as Invoice['status'] })}
                    options={[
                      { value: 'draft', label: 'Draft' },
                      { value: 'sent', label: 'Sent' },
                      { value: 'paid', label: 'Paid' },
                    ]}
                    placeholder="Status"
                    aria-label="Invoice status"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    loading={submitting} disabled={submitting}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : 'Update Invoice'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    loading={submitting} disabled={submitting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/*
          Pending-panel edit modal — full review of every field that
          will be written before the invoice is created. Opens for all
          three markup contexts (locked / diagnostic / editable) so the
          flow is consistent and the admin always sees a preview.
        */}
        {editingPendingItem && (() => {
          const round2 = (n: number) => Math.round(n * 100) / 100;
          const subtotal = editLineItems.reduce((s, li) => s + (li.amount || 0), 0);
          const markupNum = (() => {
            const n = parseFloat(editMarkupPercent);
            return Number.isFinite(n) && n >= 0 ? n : 0;
          })();
          const markupApplies = editMarkupContext === 'editable' && markupNum > 0;
          const markupAmount = markupApplies ? subtotal * (markupNum / 100) : 0;
          const previewTotal = round2(subtotal + markupAmount);
          const isBusy = creatingForWoId === editingPendingItem.workOrderId;
          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
              <div className="bg-card rounded-lg w-full max-w-3xl my-8 shadow-xl">
                <div className="flex items-start justify-between p-5 border-b border-border">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Create Invoice</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {editingPendingItem.workOrderTitle} · {editingPendingItem.clientName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPendingItem(null)}
                    disabled={isBusy}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  {/* Client + WO info (read-only) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground text-xs">Client</Label>
                      <p className="font-medium">{editingPendingItem.clientName}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Work Order</Label>
                      <p className="font-medium">{editingPendingItem.workOrderTitle}</p>
                      {editingPendingItem.workOrderNumber && (
                        <p className="text-xs text-muted-foreground">{editingPendingItem.workOrderNumber}</p>
                      )}
                    </div>
                  </div>

                  {/* Line items editor */}
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Line Items</Label>
                    <div className="mt-2 space-y-2">
                      <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] font-semibold text-muted-foreground uppercase px-1">
                        <div className="col-span-5">Description</div>
                        <div className="col-span-2 text-right">Qty</div>
                        <div className="col-span-2 text-right">Unit $</div>
                        <div className="col-span-2 text-right">Amount</div>
                        <div className="col-span-1" />
                      </div>
                      {editLineItems.map((li, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-12 md:col-span-5">
                            <Input
                              value={li.description}
                              onChange={e => updateEditLineItem(i, 'description', e.target.value)}
                              placeholder="Description"
                            />
                          </div>
                          <div className="col-span-4 md:col-span-2">
                            <Input
                              type="number" min="0" step="0.01"
                              value={li.quantity || ''}
                              onChange={e => updateEditLineItem(i, 'quantity', e.target.value)}
                              onWheel={e => e.currentTarget.blur()}
                              placeholder="Qty"
                            />
                          </div>
                          <div className="col-span-4 md:col-span-2">
                            <Input
                              type="number" min="0" step="0.01"
                              value={li.unitPrice || ''}
                              onChange={e => updateEditLineItem(i, 'unitPrice', e.target.value)}
                              onWheel={e => e.currentTarget.blur()}
                              placeholder="Unit $"
                            />
                          </div>
                          <div className="col-span-3 md:col-span-2">
                            <Input
                              type="number" min="0" step="0.01"
                              value={li.amount || ''}
                              onChange={e => updateEditLineItem(i, 'amount', e.target.value)}
                              onWheel={e => e.currentTarget.blur()}
                              placeholder="Amount"
                            />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            {editLineItems.length > 1 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
                                onClick={() => removeEditLineItem(i)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={addEditLineItem}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add Line Item
                      </Button>
                    </div>
                  </div>

                  {/* Markup — context-aware */}
                  {editMarkupContext === 'diagnostic' ? (
                    <div className="rounded-md border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
                      <span className="font-semibold">Diagnostic visit</span> — no markup is applied to diagnostic fees.
                    </div>
                  ) : editMarkupContext === 'locked' ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                      <span className="font-semibold">Markup already applied</span> ({editMarkupPercent || '0'}%) — the line
                      items above are the client-facing prices from the shared quote. Re-applying would double-charge,
                      so the field is locked.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 items-start">
                      <div>
                        <Label htmlFor="editMarkupPercent" className="text-xs">Markup %</Label>
                        <Input
                          id="editMarkupPercent"
                          type="number" min="0" max="500" step="0.1"
                          className="mt-1"
                          value={editMarkupPercent}
                          onChange={e => setEditMarkupPercent(e.target.value)}
                          onWheel={e => e.currentTarget.blur()}
                          autoFocus
                        />
                      </div>
                      <p className="text-xs text-muted-foreground sm:mt-6">
                        Each line item&apos;s unit price will be multiplied by (1 + markup/100) at create time.
                      </p>
                    </div>
                  )}

                  {/* Status + Due Date */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="editStatus" className="text-xs">Status</Label>
                      <select
                        id="editStatus"
                        className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={editStatus}
                        onChange={e => setEditStatus(e.target.value as 'draft' | 'sent')}
                      >
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="editDueDate" className="text-xs">Due Date</Label>
                      <Input
                        id="editDueDate"
                        type="date"
                        className="mt-1"
                        value={editDueDate}
                        onChange={e => setEditDueDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <Label htmlFor="editNotes" className="text-xs">Notes</Label>
                    <textarea
                      id="editNotes"
                      className="mt-1 w-full border border-input rounded-md p-2 min-h-[70px] text-sm bg-background"
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      placeholder="Optional notes for the invoice"
                    />
                  </div>

                  {/* Discount + Total */}
                  {(() => {
                    const discountNum = Math.max(0, parseFloat(editDiscountAmount) || 0);
                    const finalTotal = Math.max(0, previewTotal - discountNum);
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
                        <div>
                          <Label className="text-xs">Discount ($)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="mt-1"
                            value={editDiscountAmount}
                            onChange={e => setEditDiscountAmount(e.target.value)}
                            onWheel={e => e.currentTarget.blur()}
                            placeholder="0"
                          />
                        </div>
                        <div className="rounded-lg border border-border p-3 bg-muted/30">
                          {markupApplies && (
                            <div className="text-xs text-muted-foreground mb-1 space-y-0.5">
                              <div className="flex justify-between">
                                <span>Subtotal</span><span>{formatMoney(subtotal)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Markup ({markupNum}%)</span>
                                <span className="text-amber-700">+{formatMoney(markupAmount)}</span>
                              </div>
                              {discountNum > 0 && (
                                <div className="flex justify-between">
                                  <span>Discount</span>
                                  <span className="text-green-700">−{formatMoney(discountNum)}</span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">Invoice Total</div>
                          <div className="text-lg font-bold">{formatMoney(finalTotal)}</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Auto-charge PM picker */}
                  <div>
                    <Label className="text-xs">Auto-Charge Payment Method</Label>
                    {editPmLoading ? (
                      <p className="mt-1 text-xs text-muted-foreground">Loading saved methods…</p>
                    ) : editClientPms.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Client has no saved payment method. A Stripe pay link will be sent instead.
                      </p>
                    ) : (
                      <>
                        <select
                          value={editAutoChargePmId}
                          onChange={e => setEditAutoChargePmId(e.target.value)}
                          className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {editClientPms.map(pm => (
                            <option key={pm.id} value={pm.id}>
                              {pm.type === 'us_bank_account'
                                ? `${pm.bankName || pm.brand || 'Bank'} ••${pm.last4 || ''}`
                                : `${(pm.brand || 'Card').replace(/^./, c => c.toUpperCase())} ••${pm.last4 || ''}`
                              }{pm.isDefault ? ' (client default)' : ''}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-muted-foreground">
                          The Auto Charge button on this invoice will bill this saved method.
                        </p>
                      </>
                    )}
                  </div>

                  {/* Terms */}
                  <div>
                    <Label htmlFor="editTerms" className="text-xs">Terms</Label>
                    <textarea
                      id="editTerms"
                      className="mt-1 w-full border border-input rounded-md p-2 min-h-[60px] text-sm bg-background"
                      value={editTerms}
                      onChange={e => setEditTerms(e.target.value)}
                      placeholder="Payment terms..."
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end p-5 border-t border-border">
                  <Button
                    variant="outline"
                    onClick={() => setEditingPendingItem(null)}
                    disabled={isBusy}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={handleConfirmEditAndCreate}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating…</>
                    ) : (
                      <><Plus className="h-4 w-4 mr-1.5" /> Create Invoice</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

        {showUploadModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-card rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Upload Invoice PDF</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowUploadModal(false);
                      setSelectedFile(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <Label>Select PDF File</Label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full border border-gray-300 rounded-md p-2 mt-1"
                  />
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Selected: {selectedFile.name}
                    </p>
                  )}
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• We'll extract invoice details from the PDF</li>
                    <li>• An invoice will be created with GroundOps branding</li>
                    <li>• A Stripe payment link will be generated</li>
                    <li>• The invoice will be available in your system</li>
                  </ul>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowUploadModal(false);
                      setSelectedFile(null);
                    }}
                    disabled={uploadingPdf}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUploadPdf}
                    disabled={uploadingPdf || !selectedFile}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingPdf ? 'Processing...' : 'Upload & Process'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && invoiceToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-card rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6">
                <h2 className="text-2xl font-bold mb-4">Delete Invoice</h2>
                <p className="text-foreground mb-4">
                  Are you sure you want to delete invoice <strong>"{invoiceToDelete.invoiceNumber}"</strong>?
                </p>
                <div className="bg-muted p-4 rounded mb-4">
                  <p className="text-sm"><strong>Client:</strong> {invoiceToDelete.clientName}</p>
                  <p className="text-sm"><strong>Amount:</strong> ${invoiceToDelete.totalAmount?.toFixed(2) || '0.00'}</p>
                </div>
                <p className="text-sm text-red-600 mb-4">This action cannot be undone.</p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setInvoiceToDelete(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmDeleteInvoice}
                    className="flex-1"
                  >
                    Delete Invoice
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default function InvoicesManagement() {
  return (
    <Suspense
      fallback={
        <AdminLayout>
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          </div>
        </AdminLayout>
      }
    >
      <InvoicesManagementInner />
    </Suspense>
  );
}
