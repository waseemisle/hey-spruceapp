'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Receipt, Download, ArrowLeft, History, Paperclip, CreditCard, Edit2, X, Plus, Trash2, CheckCircle, Image as ImageIcon, Send, Zap } from 'lucide-react';
import Link from 'next/link';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import { formatMoney } from '@/lib/money';
import InvoiceSystemInfo from '@/components/invoice-system-info';
import { toast } from 'sonner';
import type { InvoiceTimelineEvent, InvoiceSystemInformation } from '@/types';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import { ImageLightbox } from '@/components/ui/image-lightbox';

interface Invoice {
  id: string;
  invoiceNumber: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle: string;
  workOrderDescription?: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorName?: string;
  status: 'draft' | 'sent' | 'paid';
  totalAmount: number;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  discountAmount?: number;
  dueDate: any;
  paidAt?: any;
  completedDate?: any;
  purchaseOrderNumber?: string;
  notes?: string;
  terms?: string;
  createdAt: any;
  sentAt?: any;
  timeline?: InvoiceTimelineEvent[];
  systemInformation?: InvoiceSystemInformation;
  creationSource?: string;
  stripePaymentLink?: string;
  stripeSessionId?: string;
  stripeInvoiceId?: string;
  stripeChargeId?: string;
  stripeReceiptUrl?: string;
  stripeInvoicePdf?: string;
  stripeHostedInvoiceUrl?: string;
  // Margin Edge auto-forward audit (per-company opt-in)
  marginEdgeSentAt?: any;
  marginEdgeMessageId?: string;
  marginEdgeSentTo?: string;
  marginEdgeError?: string;
  // Auto-charge audit (set when create-payment-link/charge-saved-card
  // attempts an off-session charge against the client's saved card)
  autoChargeAttempted?: boolean;
  autoChargeStatus?: 'pending' | 'succeeded' | 'failed' | 'requires_action';
  autoChargeError?: string;
  // Per-invoice auto-charge target. Pinned at create time from the picker
  // on /invoices/new + the WO invoice modal so the Auto Charge button
  // doesn't silently re-route to whatever happens to be the client's
  // current default. Falls back to client.defaultPaymentMethodId when
  // missing (legacy invoices created before this field existed).
  autoChargePaymentMethodId?: string;
  autoChargeMethodLabel?: string;
  attachments?: Array<{ name: string; url: string }>;
  completionDetails?: string;
  completionNotes?: string;
  completionImages?: string[];
}

type InvoiceTab = 'charges' | 'completion' | 'history' | 'attachments';

interface ClientPaymentMethod {
  id: string;
  type?: 'card' | 'us_bank_account';
  last4?: string;
  brand?: string;
  bankName?: string;
  verificationStatus?: 'pending' | 'verified';
  isDefault?: boolean;
}

interface ClientBilling {
  savedCardLast4?: string;
  savedCardBrand?: string;
  savedCardExpMonth?: number;
  savedCardExpYear?: number;
  defaultPaymentMethodId?: string;
  defaultMethodLabel?: string; // e.g. "Visa ••1234" or "Bank ••5678"
  // Full list of saved PMs so the admin can pick which one to auto-charge
  // on a per-invoice basis. Pending banks are filtered out at render time
  // because they can't be charged until micro-deposit verification clears.
  paymentMethods?: ClientPaymentMethod[];
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionAmount?: number;
  subscriptionBillingDay?: number;
}

const labelForPaymentMethod = (pm: ClientPaymentMethod): string => {
  if (pm.type === 'us_bank_account') {
    return `${pm.bankName || pm.brand || 'Bank'} ••${pm.last4 || ''}`;
  }
  const brand = pm.brand ? pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1) : 'Card';
  return `${brand} ••${pm.last4 || ''}`;
};

export default function AdminInvoiceDetail() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<InvoiceTab>('charges');
  const [relatedInvoices, setRelatedInvoices] = useState<Invoice[]>([]);
  const [clientBilling, setClientBilling] = useState<ClientBilling | null>(null);
  // Per-company Margin Edge integration flag — when false, the ME UI on
  // this invoice (Approve & Forward button + future-actions) is hidden.
  // Resolved from the client's parent company doc; defaults to false so
  // a missing/loading flag never accidentally exposes the integration.
  const [companyMarginEdgeEnabled, setCompanyMarginEdgeEnabled] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ status: '', notes: '', terms: '', discountAmount: '' });
  const [editLineItems, setEditLineItems] = useState<Array<{ description: string; quantity: number; unitPrice: number; amount: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [charging, setCharging] = useState(false);
  const [resharing, setResharing] = useState(false);
  const [openingPayLink, setOpeningPayLink] = useState(false);
  // Per-invoice override for which saved PM to auto-charge. Initialized
  // from the client's defaultPaymentMethodId once billing data loads, but
  // an admin can flip it via the picker so a single invoice can be charged
  // to the bank account while another goes on the card.
  const [selectedChargePmId, setSelectedChargePmId] = useState<string>('');

  const handleOpenPayLink = async () => {
    if (!invoice) return;
    let link = invoice.stripePaymentLink;
    // Only mint a payment link if we don't have one yet. The /api route is
    // idempotent — it reuses the existing Stripe invoice when amount + status
    // are still good — so calling it on every click is harmless, but skipping
    // the round-trip when we already have a working link is faster and avoids
    // any chance of the older "void + recreate" pattern recurring.
    if (!link && invoice.status !== 'paid') {
      try {
        setOpeningPayLink(true);
        const res = await fetch('/api/stripe/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: invoice.id }),
        });
        const data = await res.json();
        if (res.ok && data.paymentLink) {
          link = data.paymentLink as string;
          setInvoice(prev => prev ? { ...prev, stripePaymentLink: link, stripeInvoiceId: data.stripeInvoiceId || prev.stripeInvoiceId } : prev);
        } else {
          console.error('Stripe payment-link request returned:', data);
        }
      } catch (err) {
        console.error('Failed to fetch Stripe link:', err);
      } finally {
        setOpeningPayLink(false);
      }
    }
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      toast.error('Payment link not available');
    }
  };
  /** edit = save only; reshare = opened from Reshare Invoice (save & reshare with client) */
  const [editModalIntent, setEditModalIntent] = useState<'edit' | 'reshare'>('edit');

  useEffect(() => {
    const fetchInvoice = async () => {
      const id = params.id as string;
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'invoices', id));
        if (!snap.exists()) {
          const byWorkOrder = await getDocs(
            query(collection(db, 'invoices'), where('workOrderId', '==', id))
          );
          if (byWorkOrder.docs.length === 1) {
            router.replace(`/admin-portal/invoices/${byWorkOrder.docs[0].id}`);
            return;
          }
          if (byWorkOrder.docs.length > 1) {
            router.replace(`/admin-portal/invoices?workOrderId=${encodeURIComponent(id)}`);
            return;
          }
          router.push('/admin-portal/invoices');
          return;
        }
        const data = { ...snap.data(), id: snap.id } as Invoice;
        setInvoice(data);

        // ── Self-sync from Stripe (bidirectional) ─────────────────────
        // Fires whenever there's a linked Stripe Invoice, regardless of
        // Firestore status. The sync route now reconciles in BOTH
        // directions:
        //   • Stripe paid + Firestore not  → mirror Stripe's paid state
        //     into Firestore (closes webhook gaps).
        //   • Firestore paid + Stripe open → mark the Stripe Invoice
        //     paid_out_of_band so it stops showing "Open" in the
        //     dashboard (the orphan-invoice bug from the dual-PI auto-
        //     charge code path that's now fixed upstream).
        if ((data as any).stripeInvoiceId) {
          (async () => {
            try {
              const res = await fetch('/api/stripe/sync-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceId: data.id }),
              });
              const out = await res.json();
              if (out?.synced || out?.reconciled) {
                const fresh = await getDoc(doc(db, 'invoices', data.id));
                if (fresh.exists()) setInvoice({ ...fresh.data(), id: fresh.id } as Invoice);
              }
            } catch (syncErr) {
              console.warn('Background Stripe status sync failed:', syncErr);
            }
          })();
        }

        // Self-heal legacy checkout.stripe.com links — regen as a hosted
        // invoice URL silently so Pay via Stripe and re-share emails always
        // hand out the new format.
        if (
          data.status !== 'paid'
          && typeof data.stripePaymentLink === 'string'
          && data.stripePaymentLink.includes('checkout.stripe.com')
        ) {
          (async () => {
            try {
              const res = await fetch('/api/stripe/create-payment-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceId: data.id }),
              });
              const out = await res.json();
              if (res.ok && out.paymentLink) {
                setInvoice(prev => prev ? {
                  ...prev,
                  stripePaymentLink: out.paymentLink,
                  stripeInvoiceId: out.stripeInvoiceId || prev.stripeInvoiceId,
                } : prev);
              }
            } catch (healErr) {
              console.warn('Background Stripe link heal failed:', healErr);
            }
          })();
        }
        // Fetch client billing info
        if (data.clientId) {
          const clientSnap = await getDoc(doc(db, 'clients', data.clientId));
          if (clientSnap.exists()) {
            const cd = clientSnap.data();
            // Normalize the saved-method array. Filter out unverified banks —
            // they can't be auto-charged until micro-deposit verification
            // clears, so they shouldn't appear in the picker.
            const rawMethods: any[] = Array.isArray(cd.paymentMethods) ? cd.paymentMethods : [];
            const chargeable: ClientPaymentMethod[] = rawMethods
              .filter((m: any) => m && m.id && m.verificationStatus !== 'pending')
              .map((m: any) => ({
                id: m.id,
                type: m.type,
                last4: m.last4,
                brand: m.brand,
                bankName: m.bankName,
                verificationStatus: m.verificationStatus,
                isDefault: !!m.isDefault,
              }));

            // Backwards compat: legacy clients have no paymentMethods array
            // but do have a defaultPaymentMethodId + savedCard* fields.
            // Synthesize a single entry so the picker / auto-charge UI still
            // works for them.
            if (chargeable.length === 0 && cd.defaultPaymentMethodId && cd.savedCardLast4) {
              chargeable.push({
                id: cd.defaultPaymentMethodId,
                type: 'card',
                last4: cd.savedCardLast4,
                brand: cd.savedCardBrand || 'card',
                isDefault: true,
              });
            }

            // Resolve a default to highlight in the picker. Prefer the doc's
            // explicit defaultPaymentMethodId; if that's missing or stale,
            // fall back to the first chargeable method so the button never
            // ends up with an empty selection.
            const explicitDefaultId =
              cd.defaultPaymentMethodId && chargeable.some((m) => m.id === cd.defaultPaymentMethodId)
                ? cd.defaultPaymentMethodId
                : chargeable[0]?.id;

            const defaultPm = chargeable.find((m) => m.id === explicitDefaultId);
            const defaultMethodLabel = defaultPm ? labelForPaymentMethod(defaultPm) : '';

            setClientBilling({
              savedCardLast4: cd.savedCardLast4,
              savedCardBrand: cd.savedCardBrand,
              savedCardExpMonth: cd.savedCardExpMonth,
              savedCardExpYear: cd.savedCardExpYear,
              defaultPaymentMethodId: explicitDefaultId,
              defaultMethodLabel,
              paymentMethods: chargeable,
              stripeSubscriptionId: cd.stripeSubscriptionId,
              subscriptionStatus: cd.subscriptionStatus,
              subscriptionAmount: cd.subscriptionAmount,
              subscriptionBillingDay: cd.subscriptionBillingDay,
            });
            // Pre-seed the per-invoice picker. Priority order:
            //   1. The PM pinned on the invoice doc at creation time
            //      (autoChargePaymentMethodId from /invoices/new picker).
            //   2. The client's current default.
            //   3. The first chargeable PM as a last resort.
            // The pinned PM only wins when it's still chargeable — if the
            // admin removed that method between creation and now, we fall
            // through so the button isn't pointing at a dead pm_id.
            const pinnedPmId = (data as any).autoChargePaymentMethodId as string | undefined;
            const seedPmId =
              pinnedPmId && chargeable.some((m) => m.id === pinnedPmId)
                ? pinnedPmId
                : explicitDefaultId;
            if (seedPmId) setSelectedChargePmId(seedPmId);

            // Resolve the parent company's Margin Edge flag so the ME UI on
            // this invoice can be gated. We default to false on any miss
            // (no companyId, missing company doc, fetch error) so the ME
            // button never accidentally renders for a company that hasn't
            // explicitly opted in.
            if (cd.companyId) {
              try {
                const companySnap = await getDoc(doc(db, 'companies', cd.companyId));
                if (companySnap.exists() && companySnap.data()?.marginEdgeEnabled === true) {
                  setCompanyMarginEdgeEnabled(true);
                }
              } catch (companyErr) {
                console.warn('[invoice-detail] Could not resolve company.marginEdgeEnabled:', companyErr);
              }
            }
          }
        }
        if (data.workOrderId) {
          const relatedSnap = await getDocs(
            query(collection(db, 'invoices'), where('workOrderId', '==', data.workOrderId))
          );
          const related = relatedSnap.docs
            .map((d) => ({ ...d.data(), id: d.id } as Invoice))
            .filter((inv) => inv.id !== id);
          setRelatedInvoices(related);
        }
      } catch (error) {
        console.error('Error fetching invoice:', error);
        router.push('/admin-portal/invoices');
      } finally {
        setLoading(false);
      }
    };
    fetchInvoice();
  }, [params.id, router]);

  /**
   * Prefer the Stripe-hosted invoice PDF when one exists. Stripe finalizes
   * the invoice (with line items + "Pay online" link + bill-to/from blocks
   * + Stripe-formatted layout) and exposes it at invoice.stripeInvoicePdf.
   * That's the canonical document we want admins and clients to share —
   * not our locally-generated PDF, which doesn't carry the pay link.
   *
   * Stripe's PDF is on a cross-origin host so browsers block programmatic
   * downloads; opening in a new tab lets the user trigger the download
   * from there (or Save / Print). When the Stripe PDF isn't ready yet
   * (draft invoice, Stripe link still pending) we fall back to the
   * locally-generated layout so the button never silently does nothing.
   */
  const handleDownloadPDF = () => {
    if (!invoice) return;
    if (invoice.stripeInvoicePdf) {
      window.open(invoice.stripeInvoicePdf, '_blank', 'noopener,noreferrer');
      return;
    }
    const subtotal = (invoice.lineItems || []).reduce((s, li) => s + (li.amount || 0), 0);
    downloadInvoicePDF({
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      workOrderName: invoice.workOrderTitle,
      vendorName: invoice.subcontractorName,
      serviceDescription: invoice.workOrderDescription,
      lineItems: invoice.lineItems || [],
      subtotal,
      discountAmount: invoice.discountAmount || 0,
      totalAmount: invoice.totalAmount,
      dueDate: invoice.dueDate?.toDate?.()?.toLocaleDateString() || 'N/A',
      notes: invoice.notes,
      terms: invoice.terms,
    });
  };

  const openEditModal = (intent: 'edit' | 'reshare') => {
    if (!invoice) return;
    setEditModalIntent(intent);
    setEditForm({
      status: invoice.status,
      notes: invoice.notes || '',
      terms: invoice.terms || '',
      discountAmount: invoice.discountAmount ? String(invoice.discountAmount) : '',
    });
    setEditLineItems(
      invoice.lineItems?.length
        ? invoice.lineItems.map(li => ({ ...li }))
        : [{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]
    );
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditModalIntent('edit');
  };

  const persistEditsToFirestore = async () => {
    if (!invoice) throw new Error('No invoice');
    const subtotal = editLineItems.reduce((s, li) => s + (li.amount || 0), 0);
    const discountAmount = Math.max(0, Number(editForm.discountAmount || 0));
    if (!Number.isFinite(discountAmount)) {
      toast.error('Discount must be a valid number.');
      throw new Error('validation');
    }
    const newTotal = subtotal - discountAmount;
    if (newTotal < 0) {
      toast.error('Discount cannot be greater than subtotal.');
      throw new Error('validation');
    }

    await updateDoc(doc(db, 'invoices', invoice.id), {
      status: editForm.status,
      notes: editForm.notes,
      terms: editForm.terms,
      lineItems: editLineItems,
      totalAmount: newTotal,
      discountAmount,
      stripePaymentLink: null,
      stripeSessionId: null,
      updatedAt: serverTimestamp(),
    });
    setInvoice(prev => prev ? {
      ...prev,
      status: editForm.status as Invoice['status'],
      notes: editForm.notes,
      terms: editForm.terms,
      lineItems: editLineItems,
      discountAmount,
      totalAmount: newTotal,
      stripePaymentLink: undefined,
      stripeSessionId: undefined,
    } : prev);
  };

  /** Load latest invoice from Firestore, create Stripe Checkout for that total, email client, update timeline. */
  const runReshareAfterPersist = async (invoiceId: string) => {
    const snap = await getDoc(doc(db, 'invoices', invoiceId));
    if (!snap.exists()) {
      throw new Error('Invoice not found');
    }
    const inv = { ...snap.data(), id: snap.id } as Invoice;

    if (inv.status === 'paid') {
      toast.error('Invoice is already paid.');
      throw new Error('paid');
    }
    if (!inv.clientEmail) {
      toast.error('Client email is missing.');
      throw new Error('missing email');
    }
    const totalNum = Number(inv.totalAmount);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      toast.error('Invoice total must be greater than 0 to generate a Stripe link.');
      throw new Error('bad total');
    }

    const stripeRes = await fetch('/api/stripe/create-payment-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: totalNum,
        customerEmail: inv.clientEmail,
        clientName: inv.clientName || 'Client',
        clientId: inv.clientId,
      }),
    });
    const stripeData = await stripeRes.json();
    if (!stripeRes.ok || !stripeData.paymentLink) {
      throw new Error(stripeData.error || 'Failed to create Stripe payment link');
    }

    const adminUid = auth.currentUser?.uid || 'unknown';
    const adminName = auth.currentUser?.email || 'Admin';
    const sentEvent = createInvoiceTimelineEvent({
      type: 'sent',
      userId: adminUid,
      userName: adminName,
      userRole: 'admin',
      details: 'Invoice re-shared with updated total and payment link',
      metadata: { invoiceNumber: inv.invoiceNumber, reason: 'admin_reshare_after_edit' },
    });

    const existingTimeline = inv.timeline || [];
    const existingSysInfo = inv.systemInformation || {};

    await updateDoc(doc(db, 'invoices', inv.id), {
      stripePaymentLink: stripeData.paymentLink,
      stripeInvoiceId: stripeData.stripeInvoiceId || stripeData.sessionId,
      status: 'sent',
      sentAt: serverTimestamp(),
      timeline: [...existingTimeline, sentEvent],
      systemInformation: {
        ...existingSysInfo,
        sentBy: { id: adminUid, name: adminName, timestamp: Timestamp.now() },
      },
      updatedAt: serverTimestamp(),
    } as Record<string, unknown>);

    const emailRes = await fetch('/api/email/send-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toEmail: inv.clientEmail,
        toName: inv.clientName,
        invoiceNumber: inv.invoiceNumber,
        workOrderTitle: inv.workOrderTitle,
        totalAmount: totalNum,
        dueDate: inv.dueDate?.toDate?.()?.toLocaleDateString?.() || 'Net 10',
        lineItems: inv.lineItems || [],
        notes: inv.notes || '',
        stripePaymentLink: stripeData.paymentLink,
        invoiceId: invoice?.id || params.id,
      }),
    });
    const emailData = await emailRes.json();
    if (!emailRes.ok) {
      throw new Error(emailData.details || emailData.error || 'Failed to send invoice email');
    }

    setInvoice((prev) => prev ? ({
      ...prev,
      status: 'sent',
      stripePaymentLink: stripeData.paymentLink,
      stripeInvoiceId: stripeData.stripeInvoiceId || stripeData.sessionId,
      timeline: [...(prev.timeline || []), sentEvent],
      sentAt: new Date(),
    }) : prev);

    toast.success('Invoice re-shared with updated Stripe link and new Checkout total.');
  };

  const handleSaveEdit = async () => {
    if (!invoice) return;
    setSaving(true);
    try {
      await persistEditsToFirestore();
      closeEditModal();
      toast.success('Invoice updated');
    } catch (err: any) {
      if (err?.message !== 'validation') {
        toast.error(err.message || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndReshare = async () => {
    if (!invoice) return;
    setResharing(true);
    try {
      await persistEditsToFirestore();
      await runReshareAfterPersist(invoice.id);
      closeEditModal();
    } catch (err: any) {
      if (err?.message && !['validation', 'paid', 'missing email', 'bad total'].includes(err.message)) {
        toast.error(err.message || 'Failed to save and reshare');
      }
      console.error('Save & reshare error:', err);
    } finally {
      setResharing(false);
    }
  };

  const updateEditLineItem = (index: number, field: string, raw: string) => {
    setEditLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === 'description') {
        item.description = raw;
      } else {
        const num = parseFloat(raw) || 0;
        (item as any)[field] = num;
        if (field === 'quantity') item.amount = num * item.unitPrice;
        if (field === 'unitPrice') item.amount = item.quantity * num;
        if (field === 'amount') item.amount = num;
      }
      updated[index] = item;
      return updated;
    });
  };

  const [sendingToClient, setSendingToClient] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [approvingForME, setApprovingForME] = useState(false);

  const handleApproveForMarginEdge = async () => {
    if (!invoice) return;
    setApprovingForME(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/invoices/${invoice.id}/approve-for-margin-edge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || `Forward failed: HTTP ${res.status}`);
      } else if (data?.skipped) {
        toast.warning(data.message || 'Already forwarded to Margin Edge.');
      } else {
        toast.success(`Approved & forwarded to Margin Edge${data?.sentTo ? ` (${data.sentTo})` : ''}`);
        // Re-read the invoice doc so the status pill reflects the new
        // marginEdgeSentAt + marginEdgeMessageId immediately.
        try {
          const fresh = await getDoc(doc(db, 'invoices', invoice.id));
          if (fresh.exists()) setInvoice({ id: fresh.id, ...fresh.data() } as Invoice);
        } catch { /* non-fatal */ }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Approval request failed');
    } finally {
      setApprovingForME(false);
    }
  };

  const handleSendToClient = async () => {
    if (!invoice) return;
    if (!invoice.clientEmail) {
      toast.error('Invoice has no client email — cannot send.');
      return;
    }
    if (!Number.isFinite(Number(invoice.totalAmount)) || Number(invoice.totalAmount) <= 0) {
      toast.error('Invoice total must be greater than $0 before sending.');
      return;
    }
    setSendingToClient(true);
    try {
      // 1) Mint a fresh hosted Stripe invoice URL. This MUST be awaited
      //    because we embed the URL in the email body and persist it on
      //    the Firestore invoice doc.
      const stripeRes = await fetch('/api/stripe/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      const stripeData = await stripeRes.json();
      if (!stripeRes.ok || !stripeData.paymentLink) {
        throw new Error(stripeData.error || 'Failed to create Stripe payment link');
      }

      // 2) Build a PDF of the invoice to attach to the email.
      const { getInvoicePDFBase64 } = await import('@/lib/pdf-generator');
      const pdfBase64 = getInvoicePDFBase64({
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        lineItems: invoice.lineItems?.length
          ? invoice.lineItems
          : [{ description: invoice.workOrderTitle || 'Service', quantity: 1, unitPrice: invoice.totalAmount, amount: invoice.totalAmount }],
        subtotal: (invoice.lineItems || []).reduce((s, li) => s + (li.amount || 0), 0) || invoice.totalAmount,
        discountAmount: invoice.discountAmount || 0,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate?.toDate?.()?.toLocaleDateString?.() || 'Net 10',
        notes: invoice.notes || '',
        terms: invoice.terms || '',
      });

      // 3) Flip the Firestore invoice to 'sent' + timeline event BEFORE
      //    firing the email. The button's "Sending…" state was hanging
      //    on Mailgun (rate-limit + attachment upload can take 30s+);
      //    per the project's "No Stuck Buttons Ever" rule, email sends
      //    in UI flows must be fire-and-forget.
      const currentUser = auth.currentUser;
      const adminDoc = currentUser ? await getDoc(doc(db, 'adminUsers', currentUser.uid)) : null;
      const adminName = adminDoc?.exists() ? (adminDoc.data() as any).fullName : 'Admin';
      const sentEvent = createInvoiceTimelineEvent({
        type: 'sent',
        userId: currentUser?.uid || 'unknown',
        userName: adminName || 'Admin',
        userRole: 'admin',
        details: `Invoice sent to ${invoice.clientEmail} with PDF + Stripe payment link.`,
        metadata: { invoiceNumber: invoice.invoiceNumber },
      });

      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: 'sent',
        sentAt: serverTimestamp(),
        stripePaymentLink: stripeData.paymentLink,
        stripeInvoiceId: stripeData.stripeInvoiceId || stripeData.sessionId,
        timeline: [...((invoice.timeline as any) || []), sentEvent],
        updatedAt: serverTimestamp(),
      });
      setInvoice(prev => prev ? {
        ...prev,
        status: 'sent',
        stripePaymentLink: stripeData.paymentLink,
        stripeInvoiceId: stripeData.stripeInvoiceId || stripeData.sessionId,
        timeline: [...((prev.timeline as any) || []), sentEvent],
      } : prev);

      // 4) Fire-and-forget the email — failures are logged server-side
      //    via /api/email/send-invoice's own logEmail call, so the admin
      //    can see deliveries on the Email Logs page without the button
      //    waiting on Mailgun.
      fetch('/api/email/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: invoice.clientEmail,
          toName: invoice.clientName,
          invoiceNumber: invoice.invoiceNumber,
          workOrderTitle: invoice.workOrderTitle,
          totalAmount: invoice.totalAmount,
          dueDate: invoice.dueDate?.toDate?.()?.toLocaleDateString?.() || 'Net 10',
          lineItems: invoice.lineItems || [],
          notes: invoice.notes || '',
          stripePaymentLink: stripeData.paymentLink,
          invoiceId: invoice.id,
          pdfBase64,
        }),
      }).catch((err) => console.error('Send invoice email (background) failed:', err));

      toast.success('Invoice marked as sent — email is delivering in the background.');
    } catch (err: any) {
      console.error('Send to Client error:', err);
      toast.error(err?.message || 'Failed to send invoice');
    } finally {
      setSendingToClient(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!invoice) return;
    if (invoice.status === 'paid') return;
    if (!confirm(`Mark invoice ${invoice.invoiceNumber} as paid? This is a manual override and won't run a real Stripe charge.`)) return;
    setMarkingPaid(true);
    try {
      const currentUser = auth.currentUser;
      const adminDoc = currentUser ? await getDoc(doc(db, 'adminUsers', currentUser.uid)) : null;
      const adminName = adminDoc?.exists() ? (adminDoc.data() as any).fullName : 'Admin';
      const paidEvent = createInvoiceTimelineEvent({
        type: 'paid',
        userId: currentUser?.uid || 'unknown',
        userName: adminName || 'Admin',
        userRole: 'admin',
        details: `Invoice marked as paid by ${adminName || 'Admin'} (manual).`,
        metadata: { invoiceNumber: invoice.invoiceNumber, manual: true },
      });
      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: 'paid',
        paidAt: serverTimestamp(),
        manuallyMarkedPaid: true,
        timeline: [...((invoice.timeline as any) || []), paidEvent],
        updatedAt: serverTimestamp(),
      });
      setInvoice(prev => prev ? {
        ...prev,
        status: 'paid',
        timeline: [...((prev.timeline as any) || []), paidEvent],
      } : prev);
      toast.success('Invoice marked as paid.');
    } catch (err: any) {
      console.error('Mark as Paid error:', err);
      toast.error(err?.message || 'Failed to mark as paid');
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleAutoCharge = async () => {
    if (!invoice || !clientBilling) return;
    // Resolve the PM to charge — admin's per-invoice override wins, but we
    // fall back to the client's default so a "single saved PM" client can
    // still auto-charge without the admin touching the picker.
    const pmId = selectedChargePmId || clientBilling.defaultPaymentMethodId;
    if (!pmId) {
      toast.error('No saved payment method available to charge.');
      return;
    }
    const pm = clientBilling.paymentMethods?.find((m) => m.id === pmId);
    const pmLabel = pm ? labelForPaymentMethod(pm) : 'saved payment method';

    // If retrying a failed attempt, confirm so the admin doesn't
    // accidentally re-charge a card that's already been declined for
    // a real reason (insufficient funds, fraud hold, etc.). The
    // server uses a fresh idempotency key per attemptId so the cached
    // decline is bypassed and Stripe runs a real new attempt.
    const isRetry = invoice.autoChargeStatus === 'failed';
    if (isRetry) {
      const ok = confirm(
        `Retry auto-charge of ${formatMoney(invoice.totalAmount)} to ${pmLabel}?\n\nThe previous attempt failed with: "${invoice.autoChargeError || 'Card declined'}".\n\nThis will run a fresh charge attempt against Stripe.`,
      );
      if (!ok) return;
    }

    setCharging(true);
    try {
      // Generate one UUID per click. Stripe caches every response under
      // the idempotency key for 24h (incl. card_declined), so a stable
      // key would replay yesterday's decline forever. A fresh UUID per
      // admin click forces Stripe to run a new charge attempt; if THIS
      // exact request is retried (network blip, function timeout) the
      // SAME UUID is sent, so Stripe correctly dedupes — no double
      // charge.
      const attemptId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const res = await fetch('/api/stripe/charge-saved-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          clientId: invoice.clientId,
          paymentMethodId: pmId,
          attemptId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Charge failed');
      if (data.status === 'succeeded') {
        toast.success(`Charged ${formatMoney(invoice.totalAmount)} to ${pmLabel}.`);
        setInvoice(prev => prev ? { ...prev, status: 'paid', autoChargeStatus: 'succeeded' } : prev);
      } else if (data.status === 'requires_action') {
        toast.warning('Charge needs customer authentication (3DS). Send the hosted invoice link to the client.');
        setInvoice(prev => prev ? { ...prev, autoChargeAttempted: true, autoChargeStatus: 'requires_action' } : prev);
      } else {
        toast.warning(`Charge status: ${data.status}. ${data.message || ''}`.trim());
        setInvoice(prev => prev ? { ...prev, autoChargeAttempted: true, autoChargeStatus: data.status } : prev);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to charge');
      // Re-fetch the invoice so the failed status pill renders even on
      // exception paths (the server has already persisted the failure).
      try {
        const fresh = await getDoc(doc(db, 'invoices', invoice.id));
        if (fresh.exists()) setInvoice({ id: fresh.id, ...fresh.data() } as Invoice);
      } catch { /* non-fatal */ }
    } finally {
      setCharging(false);
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
    if ((inv as any).sentAt) {
      events.push({
        id: 'sent',
        timestamp: (inv as any).sentAt,
        type: 'sent',
        userId: inv.systemInformation?.sentBy?.id || 'unknown',
        userName: inv.systemInformation?.sentBy?.name || 'Admin',
        userRole: 'admin',
        details: 'Invoice sent to client',
        metadata: { invoiceNumber: inv.invoiceNumber },
      });
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

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (!invoice) {
    return null;
  }

  const hasCompletionData = !!(invoice.completionDetails || invoice.completionNotes || (invoice.completionImages && invoice.completionImages.length > 0));

  const tabs: { id: InvoiceTab; label: string; icon: React.ElementType }[] = [
    { id: 'charges', label: 'Line Items', icon: Receipt },
    ...(hasCompletionData ? [{ id: 'completion' as InvoiceTab, label: 'Completion Details', icon: CheckCircle }] : []),
    { id: 'history', label: 'History', icon: History },
    { id: 'attachments', label: 'Attachments', icon: Paperclip },
  ];

  const discount = invoice.discountAmount ?? 0;
  const totalDisplay = invoice.totalAmount;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin-portal/invoices">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Invoices
              </Button>
            </Link>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${invoice.status}`}>
              {invoice.status}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleDownloadPDF} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            <Button onClick={() => openEditModal('edit')} variant="outline" size="sm">
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            {invoice.status === 'draft' && (
              <Button size="sm" onClick={handleSendToClient} disabled={sendingToClient}>
                <Send className="h-4 w-4 mr-2" />
                {sendingToClient ? 'Sending…' : 'Send to Client'}
              </Button>
            )}

            {/*
              Approve & Forward to Margin Edge — strictly gated on the
              client's parent company having marginEdgeEnabled=true. Without
              the flag the action is invisible (was previously surfaced for
              every invoice, which let admins try to forward invoices for
              non-ME customers). Also hides once marginEdgeSentAt is set so
              admins aren't tempted to "re-approve" an already-pushed item.
              The server route is idempotent and re-checks the flag, so this
              gate is just UX hygiene — the source of truth is server-side.
            */}
            {companyMarginEdgeEnabled && !invoice.marginEdgeSentAt && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleApproveForMarginEdge}
                disabled={approvingForME}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {approvingForME ? 'Forwarding…' : 'Approve & Forward to Margin Edge'}
              </Button>
            )}
            {invoice.status === 'sent' && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleMarkAsPaid}
                disabled={markingPaid}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {markingPaid ? 'Marking…' : 'Mark as Paid'}
              </Button>
            )}
            {/*
              Auto Charge — renders for unpaid invoices when the client
              has at least one chargeable saved PM. Visibility rules:
                • Hidden if invoice is already paid (nothing to charge).
                • Hidden if a charge is currently in flight on Stripe's
                  side (autoChargeStatus === 'pending' / 'requires_action')
                  to prevent overlapping attempts.
                • RENDERS as "Re-Auto Charge" when the previous attempt
                  failed (autoChargeStatus === 'failed') so the admin
                  can retry against a freshly funded card without
                  needing a code change. The retry uses a fresh
                  idempotency UUID per click — Stripe runs a real new
                  attempt instead of replaying the cached decline.
            */}
            {invoice.status === 'sent'
              && (clientBilling?.paymentMethods?.length ?? 0) > 0
              && invoice.autoChargeStatus !== 'pending'
              && invoice.autoChargeStatus !== 'requires_action' && (
              <div className="flex items-center gap-1.5">
                {(clientBilling?.paymentMethods?.length ?? 0) > 1 && (
                  <select
                    value={selectedChargePmId}
                    onChange={(e) => setSelectedChargePmId(e.target.value)}
                    disabled={charging}
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    aria-label="Select payment method to auto-charge"
                  >
                    {clientBilling!.paymentMethods!.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {labelForPaymentMethod(pm)}{pm.id === clientBilling?.defaultPaymentMethodId ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  size="sm"
                  className={
                    invoice.autoChargeStatus === 'failed'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white gap-1.5'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5'
                  }
                  onClick={handleAutoCharge}
                  disabled={charging || !(selectedChargePmId || clientBilling?.defaultPaymentMethodId)}
                  title={(() => {
                    const pmId = selectedChargePmId || clientBilling?.defaultPaymentMethodId;
                    const pm = clientBilling?.paymentMethods?.find((m) => m.id === pmId);
                    const verb = invoice.autoChargeStatus === 'failed' ? 'Retry auto-charge against' : 'Auto-charge';
                    return `${verb} ${pm ? labelForPaymentMethod(pm) : 'saved payment method'}`;
                  })()}
                >
                  <Zap className="h-4 w-4" />
                  {charging
                    ? 'Charging…'
                    : invoice.autoChargeStatus === 'failed'
                      ? `Re-Auto Charge ${formatMoney(invoice.totalAmount)}`
                      : `Auto Charge ${formatMoney(invoice.totalAmount)}`}
                </Button>
              </div>
            )}
            {invoice.status !== 'paid' && (
              <Button size="sm" variant="outline" onClick={handleOpenPayLink} disabled={openingPayLink}>
                <CreditCard className="h-4 w-4 mr-2" />
                {openingPayLink ? 'Opening…' : 'Pay via Stripe'}
              </Button>
            )}
            {invoice.status === 'paid' && invoice.stripeReceiptUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={invoice.stripeReceiptUrl} target="_blank" rel="noopener noreferrer">
                  <Receipt className="h-4 w-4 mr-2" />
                  View Receipt
                </a>
              </Button>
            )}
            {invoice.status === 'paid' && invoice.stripeInvoicePdf && (
              <Button size="sm" variant="outline" asChild>
                <a href={invoice.stripeInvoicePdf} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-2" />
                  Stripe PDF
                </a>
              </Button>
            )}
          </div>
        </div>

        {/*
          Margin Edge auto-forward audit. Renders only when the invoice
          has actually attempted ME forwarding (success or failure) — for
          companies without ME enabled this stays hidden, no clutter.
        */}
        {(invoice.marginEdgeSentAt || invoice.marginEdgeError) && (
          <div className={`rounded-xl border px-3 py-2 text-xs flex items-center gap-2 flex-wrap ${
            invoice.marginEdgeSentAt
              ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-red-200 bg-red-50/60 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
          }`}>
            <span className="font-semibold">Margin Edge:</span>
            {invoice.marginEdgeSentAt ? (
              <>
                <span>
                  Forwarded to{' '}
                  <code className="font-mono text-[11px]">{invoice.marginEdgeSentTo || 'configured inbox'}</code>
                </span>
                {invoice.marginEdgeSentAt?.toDate && (
                  <span className="opacity-75">
                    · {invoice.marginEdgeSentAt.toDate().toLocaleString()}
                  </span>
                )}
                {invoice.marginEdgeMessageId && (
                  <span className="opacity-60">· msg <code className="font-mono">{invoice.marginEdgeMessageId}</code></span>
                )}
              </>
            ) : (
              <span>Send failed: {invoice.marginEdgeError}</span>
            )}
          </div>
        )}

        {/*
          Auto-charge audit pill. Renders only when an auto-charge was
          attempted against this invoice (recurring cron path, or admin
          explicitly chose auto-charge from the send dialog). Color
          tracks the outcome: green=succeeded, amber=requires_action,
          red=failed, neutral=pending.
        */}
        {invoice.autoChargeAttempted && (
          <div className={`rounded-xl border px-3 py-2 text-xs flex items-center gap-2 flex-wrap ${
            invoice.autoChargeStatus === 'succeeded'
              ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
              : invoice.autoChargeStatus === 'failed'
                ? 'border-red-200 bg-red-50/60 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
                : invoice.autoChargeStatus === 'requires_action'
                  ? 'border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
                  : 'border-border bg-muted/40 text-foreground'
          }`}>
            <span className="font-semibold">Auto-charge:</span>
            <span>
              {invoice.autoChargeStatus === 'succeeded'
                ? 'Saved card charged successfully'
                : invoice.autoChargeStatus === 'failed'
                  ? `Card declined${invoice.autoChargeError ? ` — ${invoice.autoChargeError}` : ''}`
                  : invoice.autoChargeStatus === 'requires_action'
                    ? 'Requires customer authentication (3DS)'
                    : 'Pending — waiting for Stripe to confirm'}
            </span>
            {invoice.autoChargeStatus === 'failed' && invoice.stripePaymentLink && (
              <a
                href={invoice.stripePaymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium underline"
              >
                Open hosted invoice ↗
              </a>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-2xl mb-2">{invoice.invoiceNumber}</CardTitle>
              <p className="text-sm text-muted-foreground">{invoice.workOrderTitle}</p>
              {invoice.workOrderId ? (
                <Link
                  href={`/admin-portal/work-orders/${invoice.workOrderId}`}
                  className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                >
                  {invoice.workOrderNumber ? `Work order #${invoice.workOrderNumber}` : 'View work order'}
                </Link>
              ) : invoice.workOrderNumber ? (
                <p className="text-sm text-muted-foreground mt-1">Tracking: {invoice.workOrderNumber}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">Client: {invoice.clientName}</p>
              {invoice.subcontractorName && (
                <p className="text-sm text-muted-foreground">Provider: {invoice.subcontractorName}</p>
              )}
              {invoice.completedDate && (
                <p className="text-sm text-muted-foreground">
                  Completed: {toDate(invoice.completedDate)?.toLocaleDateString() ?? 'N/A'}
                </p>
              )}
              {/*
                Auto-charge target pill. Shows the PM that THIS invoice will
                bill against — the per-invoice pinned method if one was
                chosen at creation, otherwise the client's current default.
                Replaces the old "Saved payment: <client default>" pill
                which misled admins into thinking every invoice always
                charged the default card. The label is derived from the
                live paymentMethods array so a pinned-but-removed PM falls
                back to the live default instead of showing a stale label.
              */}
              {clientBilling && (() => {
                const targetPm = clientBilling.paymentMethods?.find(
                  (m) => m.id === selectedChargePmId
                );
                const targetLabel = targetPm
                  ? labelForPaymentMethod(targetPm)
                  : (invoice.autoChargeMethodLabel || clientBilling.defaultMethodLabel || '');
                const showPill = !!targetLabel || (clientBilling.stripeSubscriptionId && clientBilling.subscriptionStatus === 'active');
                if (!showPill) return null;
                return (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {targetLabel && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        <CreditCard className="h-3 w-3" />
                        Auto-charge target: {targetLabel}
                      </span>
                    )}
                    {clientBilling.stripeSubscriptionId && clientBilling.subscriptionStatus === 'active' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <span>⚡</span>
                        Client has Fixed Recurring Plan: {formatMoney(clientBilling.subscriptionAmount)}/month
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1 border-b mb-4">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors ${
                    activeTab === t.id
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'charges' && (
              <div className="space-y-4">
                <div className="overflow-x-auto border rounded-md">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Description</th>
                        <th className="px-4 py-2 text-right font-medium">Qty</th>
                        <th className="px-4 py-2 text-right font-medium">Unit Price</th>
                        <th className="px-4 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(invoice.lineItems || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">No line items</td>
                        </tr>
                      ) : (
                        (invoice.lineItems || []).map((row, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2">{row.description || '—'}</td>
                            <td className="px-4 py-2 text-right">{row.quantity ?? '—'}</td>
                            <td className="px-4 py-2 text-right">{formatMoney(row.unitPrice)}</td>
                            <td className="px-4 py-2 text-right font-medium">{formatMoney(row.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="border-t pt-3 space-y-1 text-sm">
                  {discount > 0 && <p>Discount: -{formatMoney(discount)}</p>}
                  <p className="font-bold text-lg">Total: {formatMoney(totalDisplay)}</p>
                </div>
              </div>
            )}

            {activeTab === 'completion' && hasCompletionData && (
              <div className="space-y-4">
                {(invoice.completionDetails || invoice.completionNotes) && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Completion Details
                    </h3>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      {invoice.completionDetails && (
                        <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.completionDetails}</p>
                      )}
                      {invoice.completionNotes && invoice.completionNotes !== invoice.completionDetails && (
                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{invoice.completionNotes}</p>
                      )}
                    </div>
                  </div>
                )}

                {invoice.completionImages && invoice.completionImages.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-blue-600" />
                      Completion Images ({invoice.completionImages.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
              </div>
            )}

            {activeTab === 'history' && (
              <InvoiceSystemInfo
                timeline={buildInvoiceTimeline(invoice)}
                systemInformation={invoice.systemInformation}
                creationSourceLabel={getInvoiceCreationSourceLabel(invoice)}
              />
            )}

            {activeTab === 'attachments' && (
              <div className="space-y-2">
                {invoice.attachments?.length ? (
                  invoice.attachments.map((a, i) => (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Paperclip className="h-4 w-4" />
                      {a.name}
                    </a>
                  ))
                ) : (
                  <p className="text-muted-foreground">No attachments</p>
                )}
              </div>
            )}

          </CardContent>
        </Card>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b sticky top-0 bg-card z-10 flex justify-between items-center gap-3">
              <div>
                <h2 className="text-xl font-bold">
                  {editModalIntent === 'reshare' ? 'Update invoice & reshare' : 'Edit Invoice'}
                </h2>
                {editModalIntent === 'reshare' && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Adjust line items and discount, then save and email the client. Stripe Checkout will use the new total.
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => closeEditModal()} disabled={saving || resharing}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-6">
              {editModalIntent === 'reshare' && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3 text-sm text-blue-900 dark:text-blue-100">
                  The payment link always matches the invoice total saved in the database. After you save, we create a new Stripe Checkout session for that amount and email it to the client.
                </div>
              )}

              {/* Status */}
              <div>
                <Label>Status</Label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((prev) => ({ ...prev, status: v }))}
                  options={['draft', 'sent', 'paid', 'overdue'].map((s) => ({
                    value: s,
                    label: s.charAt(0).toUpperCase() + s.slice(1),
                  }))}
                  placeholder="Status"
                  aria-label="Invoice status"
                />
              </div>

              {/* Line Items */}
              <div>
                <Label className="mb-2 block">Line Items</Label>
                <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground uppercase px-1 mb-1">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1" />
                </div>
                {editLineItems.map((li, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
                    <div className="col-span-12 md:col-span-5">
                      <Input value={li.description} onChange={e => updateEditLineItem(i, 'description', e.target.value)} placeholder="Description" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input type="number" min="0" step="0.01" value={li.quantity || ''} placeholder="Qty" onChange={e => updateEditLineItem(i, 'quantity', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input type="number" min="0" step="0.01" value={li.unitPrice || ''} placeholder="Unit $" onChange={e => updateEditLineItem(i, 'unitPrice', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <Input type="number" min="0" step="0.01" value={li.amount || ''} placeholder="Amount" onChange={e => updateEditLineItem(i, 'amount', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {editLineItems.length > 1 && (
                        <Button type="button" size="sm" variant="ghost" className="text-red-500 hover:text-red-700 p-1 h-auto"
                          onClick={() => setEditLineItems(prev => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setEditLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, amount: 0 }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add Line Item
                </Button>
                <div className="flex flex-wrap justify-end gap-4 mt-3 text-sm">
                  <span className="text-muted-foreground">
                    Subtotal:{' '}
                    <span className="font-semibold text-foreground">${editLineItems.reduce((s, li) => s + (li.amount || 0), 0).toFixed(2)}</span>
                  </span>
                </div>
              </div>

              {/* Discount & total (after line items) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Discount</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.discountAmount}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, discountAmount: e.target.value }))}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="e.g. 20"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Subtracted from the line items subtotal.</p>
                </div>
                <div className="rounded-lg border border-border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground">Invoice total (after discount)</div>
                  <div className="text-lg font-bold">
                    ${Math.max(0, (editLineItems.reduce((s, li) => s + (li.amount || 0), 0) - (Number(editForm.discountAmount || 0) || 0))).toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This is the amount sent to Stripe when you reshare.
                  </p>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes</Label>
                <textarea
                  className="mt-1 w-full border border-gray-300 rounded-md p-2 min-h-[80px] text-sm"
                  value={editForm.notes}
                  onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              {/* Terms */}
              <div>
                <Label>Terms</Label>
                <textarea
                  className="mt-1 w-full border border-gray-300 rounded-md p-2 min-h-[80px] text-sm"
                  value={editForm.terms}
                  onChange={e => setEditForm(prev => ({ ...prev, terms: e.target.value }))}
                />
              </div>
            </div>
            <div className="p-6 border-t flex flex-col sm:flex-row gap-3">
              {editModalIntent === 'reshare' ? (
             <>
                  <Button className="flex-1" onClick={handleSaveAndReshare} disabled={saving || resharing}>
                    {resharing ? 'Saving & re-sharing…' : 'Save & reshare with client'}
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleSaveEdit} disabled={saving || resharing}>
                    {saving ? 'Saving…' : 'Save changes only'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    type="button"
                    disabled={resharing || saving}
                    onClick={async () => {
                      if (!invoice) return;
                      setResharing(true);
                      try {
                        await runReshareAfterPersist(invoice.id);
                        closeEditModal();
                      } catch (err: any) {
                        console.error(err);
                      } finally {
                        setResharing(false);
                      }
                    }}
                  >
                    {resharing ? 'Working…' : 'Reshare saved invoice only'}
                  </Button>
                </>
              ) : (
                <>
                  <Button className="flex-1" onClick={handleSaveEdit} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={() => closeEditModal()} disabled={saving || resharing}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}
    </AdminLayout>
  );
}
