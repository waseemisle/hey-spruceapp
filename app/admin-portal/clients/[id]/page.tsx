'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  ArrowLeft, Download, ExternalLink, CreditCard, CheckCircle, AlertCircle,
  Plus, XCircle, MapPin, Star, Trash2, Edit2, Loader2, Mail, X, ShieldCheck,
  Zap, DollarSign, History, Receipt, FileText, Layers, Building2,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentMethod {
  id: string;
  type?: 'card' | 'us_bank_account';
  last4: string;
  brand: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  createdAt?: any;
  // Bank account fields
  bankName?: string;
  routingNumber?: string;
  accountHolderType?: string;
  accountType?: string;
  verificationStatus?: 'pending' | 'verified';
}

interface Client {
  uid: string;
  email: string;
  fullName: string;
  companyName?: string;
  companyId?: string;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  // Stripe billing
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
  savedCardLast4?: string;
  savedCardBrand?: string;
  savedCardExpMonth?: number;
  savedCardExpYear?: number;
  autoPayEnabled?: boolean;
  paymentMethods?: PaymentMethod[];
  stripeSubscriptionId?: string;
  subscriptionAmount?: number;
  subscriptionBillingDay?: number;
  subscriptionStatus?: string;
  subscriptionPaymentMethodId?: string;
  paymentTermsDays?: number;
  autoChargeThreshold?: number;
  assignedLocations?: string[];
}

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  locationName?: string;
  title: string;
  status: string;
  assignedTo?: string;
  assignedToName?: string;
  scheduledServiceDate?: any;
  estimateBudget?: number;
  createdAt: any;
}

interface Invoice {
  id: string;
  workOrderId?: string;
  clientId?: string;
  invoiceNumber?: string;
  status: string;
  totalAmount: number;
  dueDate?: any;
  createdAt: any;
  paidAt?: any;
  autoChargeAttempted?: boolean;
  autoChargeStatus?: string;
  stripePaymentLink?: string;
}

interface Location {
  id: string;
  locationName: string;
  companyName?: string;
  clientId?: string;
  companyId?: string;
  address?: { street?: string; city?: string; state?: string; zip?: string };
}

interface Company {
  id: string;
  name: string;
}

interface ClientCharge {
  id: string;
  clientId: string;
  clientName: string;
  paymentMethodId: string;
  cardLast4: string;
  cardBrand: string;
  amount: number;
  status: 'succeeded' | 'failed' | 'requires_action';
  stripePaymentIntentId: string;
  description?: string;
  chargedAt: any;
  error?: string;
  source: 'manual_admin' | 'subscription';
}

interface ConsolidatedInvoice {
  id: string;
  clientId: string;
  clientName: string;
  invoiceIds: string[];
  invoiceCount: number;
  totalAmount: number;
  periodStart: any;
  periodEnd: any;
  status: 'draft' | 'sent' | 'paid';
  autoCharged: boolean;
  autoChargeStatus?: 'pending' | 'succeeded' | 'failed';
  stripePaymentIntentId?: string;
  notes?: string;
  createdAt: any;
  paidAt?: any;
}

type TabKey = 'all' | 'not-invoiced' | 'invoiced' | 'paid' | 'overdue';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(val: any): string {
  const d = toDate(val);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(val: any): string {
  const d = toDate(val);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}


function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:   { label: 'Not Invoiced', cls: 'bg-muted text-muted-foreground' },
    sent:    { label: 'Invoiced',     cls: 'bg-blue-100 text-blue-700' },
    paid:    { label: 'Paid',         cls: 'bg-green-100 text-green-700' },
    overdue: { label: 'Overdue',      cls: 'bg-red-100 text-red-700' },
    none:    { label: 'Not Invoiced', cls: 'bg-muted text-muted-foreground' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  // Billing state
  const [addingCard, setAddingCard] = useState(false);
  const [removingCard, setRemovingCard] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);

  // Inline card form
  const [showCardModal, setShowCardModal] = useState(false);
  const [submittingCard, setSubmittingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const cardMountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<any>(null);
  const cardElementRef = useRef<any>(null);

  // Bank account form
  const [showBankModal, setShowBankModal] = useState(false);
  const [submittingBank, setSubmittingBank] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankRouting, setBankRouting] = useState('');
  const [bankAccountNum, setBankAccountNum] = useState('');
  const [bankHolderType, setBankHolderType] = useState<'individual' | 'company'>('individual');
  const [bankAccountType, setBankAccountType] = useState<'checking' | 'savings'>('checking');
  const [bankHolderName, setBankHolderName] = useState('');

  // Transaction history
  const [charges, setCharges] = useState<ClientCharge[]>([]);

  // Consolidated invoices
  const [consolidatedInvoices, setConsolidatedInvoices] = useState<ConsolidatedInvoice[]>([]);
  const [showConsolidatedModal, setShowConsolidatedModal] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [generatingConsolidated, setGeneratingConsolidated] = useState(false);
  const [consolidatedChargeCardId, setConsolidatedChargeCardId] = useState('');
  const [markingConsolidatedPaid, setMarkingConsolidatedPaid] = useState<string | null>(null);

  // Edit billing terms modal
  const [showBillingTermsModal, setShowBillingTermsModal] = useState(false);
  const [editPaymentTerms, setEditPaymentTerms] = useState('');
  const [editAutoChargeThreshold, setEditAutoChargeThreshold] = useState('');
  const [savingBillingTerms, setSavingBillingTerms] = useState(false);

  // Edit client info modal
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCompanyId, setEditCompanyId] = useState('');
  const [editStatus, setEditStatus] = useState<'pending' | 'approved' | 'rejected'>('approved');
  const [editAssignedLocations, setEditAssignedLocations] = useState<string[]>([]);
  const [savingClientInfo, setSavingClientInfo] = useState(false);

  // Delete work order
  const [deletingWorkOrderId, setDeletingWorkOrderId] = useState<string | null>(null);

  // Charge Now modal
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [chargeCardId, setChargeCardId] = useState('');
  const [chargeInvoiceId, setChargeInvoiceId] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargingNow, setChargingNow] = useState(false);
  const [chargeResult, setChargeResult] = useState<{ success: boolean; message: string } | null>(null);

  // Subscription modal state
  const [showSubModal, setShowSubModal] = useState(false);
  const [subAmount, setSubAmount] = useState('');
  const [subBillingDay, setSubBillingDay] = useState('');
  const [subCardId, setSubCardId] = useState('');
  const [creatingSub, setCreatingSub] = useState(false);
  const [cancelingSub, setCancelingSub] = useState(false);
  const [resendingInvitation, setResendingInvitation] = useState(false);

  // Legacy: handle redirect from Stripe Checkout (no longer used but kept for backward compat)
  useEffect(() => {
    const cardAdded = searchParams?.get('card_added');
    if (cardAdded === 'success') {
      toast.success('Card added successfully!');
      router.replace(`/admin-portal/clients/${id}`);
    } else if (cardAdded === 'cancelled') {
      toast.info('Card setup cancelled.');
      router.replace(`/admin-portal/clients/${id}`);
    }
  }, [searchParams, id, router]);

  // Real-time client doc
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'clients', id), (snap) => {
      if (snap.exists()) {
        setClient({ uid: snap.id, ...snap.data() } as Client);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  // Fetch locations + companies
  useEffect(() => {
    if (!id) return;
    const fetchLocations = async () => {
      const snap = await getDocs(collection(db, 'locations'));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Location));
      setAllLocations(all);
      setLocations(all.filter((l) => l.clientId === id || (client?.companyId && l.companyId === client.companyId)));
    };
    const fetchCompanies = async () => {
      const snap = await getDocs(collection(db, 'companies'));
      setCompanies(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Company)));
    };
    fetchLocations();
    fetchCompanies();
  }, [id, client?.companyId]);

  // Real-time work orders
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(collection(db, 'workOrders'), (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
      setWorkOrders(all.filter((wo) => wo.clientId === id));
    });
    return () => unsub();
  }, [id]);

  // Real-time invoices
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'invoices'), where('clientId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice)));
    });
    return () => unsub();
  }, [id]);

  // Real-time transaction history
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'clientCharges'), where('clientId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClientCharge));
      all.sort((a, b) => {
        const da = toDate(a.chargedAt);
        const db_ = toDate(b.chargedAt);
        if (!da || !db_) return 0;
        return db_.getTime() - da.getTime();
      });
      setCharges(all);
    });
    return () => unsub();
  }, [id]);

  // Real-time consolidated invoices
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'consolidatedInvoices'), where('clientId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConsolidatedInvoice));
      all.sort((a, b) => {
        const da = toDate(a.createdAt);
        const db_ = toDate(b.createdAt);
        if (!da || !db_) return 0;
        return db_.getTime() - da.getTime();
      });
      setConsolidatedInvoices(all);
    });
    return () => unsub();
  }, [id]);

  // ─── Enrich work orders ────────────────────────────────────────────────────

  const enriched = useMemo(() => {
    return workOrders.map((wo) => {
      const invoice = invoices.find((inv) => inv.workOrderId === wo.id);
      const invStatus = invoice?.status ?? 'none';

      let tabCategory: TabKey = 'not-invoiced';
      if (invStatus === 'paid') tabCategory = 'paid';
      else if (invStatus === 'overdue') tabCategory = 'overdue';
      else if (invStatus === 'sent') tabCategory = 'invoiced';
      else tabCategory = 'not-invoiced';

      return {
        ...wo,
        invoice,
        invStatus,
        tabCategory,
        invoiceAmount: invoice?.totalAmount ?? wo.estimateBudget ?? 0,
        dueDate: invoice?.dueDate ?? null,
      };
    });
  }, [workOrders, invoices]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return enriched;
    return enriched.filter((wo) => wo.tabCategory === activeTab);
  }, [enriched, activeTab]);

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalJobs = enriched.length;
    const notInvoicedCount = enriched.filter((w) => w.tabCategory === 'not-invoiced').length;
    const outstandingAmount = enriched
      .filter((w) => w.invStatus === 'sent' || w.invStatus === 'overdue')
      .reduce((s, w) => s + w.invoiceAmount, 0);
    const collectedAmount = enriched
      .filter((w) => w.invStatus === 'paid')
      .reduce((s, w) => s + w.invoiceAmount, 0);
    const overdueAmount = enriched
      .filter((w) => w.invStatus === 'overdue')
      .reduce((s, w) => s + w.invoiceAmount, 0);
    const overdueCount = enriched.filter((w) => w.tabCategory === 'overdue').length;
    return { totalJobs, notInvoicedCount, outstandingAmount, collectedAmount, overdueAmount, overdueCount };
  }, [enriched]);

  // ─── Export CSV ────────────────────────────────────────────────────────────

  const handleResendInvitation = async () => {
    if (!client) return;
    setResendingInvitation(true);
    try {
      const res = await fetch('/api/auth/resend-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: client.email, fullName: client.fullName, role: 'client', uid: client.uid }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
      toast.success('Invitation email resent successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend invitation');
    } finally {
      setResendingInvitation(false);
    }
  };

  const handleExport = () => {
    const rows = filtered.map((wo) => ({
      'WO #': wo.workOrderNumber || wo.id,
      Date: fmtDate(wo.scheduledServiceDate || wo.createdAt),
      Location: wo.locationName || '',
      Title: wo.title,
      'Invoice Amount': wo.invoiceAmount ? wo.invoiceAmount.toFixed(2) : '0.00',
      'Invoice Status': wo.invStatus,
      'Due Date': fmtDate(wo.dueDate),
      'WO Status': wo.status,
    }));
    if (!rows.length) { toast.error('No data to export'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        headers.map((h) => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `client-${id}-jobs.csv`;
    a.click();
    toast.success('CSV exported');
  };

  // ─── Billing Actions ───────────────────────────────────────────────────────

  // Mount / unmount Stripe Card Element when admin card modal opens/closes
  useEffect(() => {
    if (!showCardModal) {
      if (cardElementRef.current) {
        cardElementRef.current.destroy();
        cardElementRef.current = null;
      }
      setCardError(null);
      return;
    }

    const initStripe = async () => {
      try {
        if (!stripeRef.current) {
          const { loadStripe } = await import('@stripe/stripe-js');
          stripeRef.current = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
        }
        if (stripeRef.current && cardMountRef.current && !cardElementRef.current) {
          const elements = stripeRef.current.elements();
          const cardEl = elements.create('card', {
            style: {
              base: {
                fontSize: '15px',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                color: '#111827',
                '::placeholder': { color: '#9ca3af' },
                iconColor: '#6b7280',
              },
              invalid: { color: '#dc2626', iconColor: '#dc2626' },
            },
            hidePostalCode: false,
          });
          cardEl.mount(cardMountRef.current);
          cardEl.on('change', (event: any) => {
            setCardError(event.error ? event.error.message : null);
          });
          cardElementRef.current = cardEl;
        }
      } catch (err: any) {
        toast.error('Failed to load card form. Please refresh and try again.');
      }
    };

    const timer = setTimeout(initStripe, 80);
    return () => clearTimeout(timer);
  }, [showCardModal]);

  const handleAdminCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !stripeRef.current || !cardElementRef.current) return;

    setSubmittingCard(true);
    setCardError(null);
    try {
      const intentRes = await fetch('/api/stripe/create-setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.uid }),
      });
      const { clientSecret, error: intentError } = await intentRes.json();
      if (!intentRes.ok) throw new Error(intentError || 'Failed to initialize card setup');

      const { setupIntent, error: stripeError } = await stripeRef.current.confirmCardSetup(
        clientSecret,
        { payment_method: { card: cardElementRef.current } }
      );
      if (stripeError) throw new Error(stripeError.message);

      const saveRes = await fetch('/api/stripe/save-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.uid,
          paymentMethodId: setupIntent.payment_method,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Failed to save card');

      toast.success('Card added successfully!');
      setShowCardModal(false);
    } catch (error: any) {
      setCardError(error.message || 'Failed to add card. Please try again.');
    } finally {
      setSubmittingCard(false);
    }
  };

  /** Admin-initiated: open inline card form */
  const handleAddCard = () => {
    setShowCardModal(true);
    setAddingCard(false);
  };

  /** Admin-initiated: open bank account form */
  const handleOpenBankModal = () => {
    setBankRouting('');
    setBankAccountNum('');
    setBankHolderType('individual');
    setBankAccountType('checking');
    setBankHolderName(client?.fullName || '');
    setBankError(null);
    setShowBankModal(true);
  };

  const handleAddBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setBankError(null);

    if (!/^\d{9}$/.test(bankRouting.trim())) {
      setBankError('Routing number must be exactly 9 digits.');
      return;
    }
    if (bankAccountNum.trim().length < 4) {
      setBankError('Please enter a valid account number.');
      return;
    }

    setSubmittingBank(true);
    try {
      const res = await fetch('/api/stripe/add-bank-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.uid,
          routingNumber: bankRouting.trim(),
          accountNumber: bankAccountNum.trim(),
          accountHolderType: bankHolderType,
          accountType: bankAccountType,
          holderName: bankHolderName.trim() || client.fullName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add bank account');
      toast.success(`Bank account added${data.bankName ? ` — ${data.bankName}` : ''}`);
      setShowBankModal(false);
    } catch (error: any) {
      setBankError(error.message || 'Failed to add bank account. Please try again.');
    } finally {
      setSubmittingBank(false);
    }
  };

  const handleSetDefault = async (pmId: string) => {
    if (!client) return;
    setSettingDefault(pmId);
    try {
      const res = await fetch('/api/stripe/set-default-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.uid, paymentMethodId: pmId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set default');
      toast.success('Default card updated.');
    } catch (error: any) {
      toast.error(error.message || 'Failed to set default card');
    } finally {
      setSettingDefault(null);
    }
  };

  const handleRemoveCard = async (pmId: string, last4: string) => {
    if (!client) return;
    if (!confirm(`Remove card ending in ${last4}? This cannot be undone.`)) return;
    setRemovingCard(pmId);
    try {
      const res = await fetch('/api/stripe/remove-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.uid, paymentMethodId: pmId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove card');
      toast.success(`Card ending in ${last4} removed.`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove card');
    } finally {
      setRemovingCard(null);
    }
  };

  const handleCreateSubscription = async () => {
    if (!client) return;
    const amt = parseFloat(subAmount);
    const day = parseInt(subBillingDay, 10);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (isNaN(day) || day < 1 || day > 28) { toast.error('Billing day must be 1–28'); return; }
    if (!client.defaultPaymentMethodId) {
      toast.error('Client must have a saved card before creating a subscription.');
      return;
    }
    setCreatingSub(true);
    try {
      // Use update-subscription when editing an existing active plan; create-subscription for new plans
      const isEditing = !!(client.stripeSubscriptionId && client.subscriptionStatus === 'active');
      const endpoint = isEditing ? '/api/stripe/update-subscription' : '/api/stripe/create-subscription';
      const body: any = { clientId: client.uid, amount: amt, billingDay: day };
      if (subCardId) body.paymentMethodId = subCardId;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save subscription');
      const action = isEditing ? 'updated' : 'created';
      toast.success(`Fixed plan ${action}! Next charge on ${new Date(data.nextBillingDate).toLocaleDateString()}.`);
      setShowSubModal(false);
      setSubAmount('');
      setSubBillingDay('');
      setSubCardId('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save subscription');
    } finally {
      setCreatingSub(false);
    }
  };

  const handleChargeNow = async () => {
    if (!client || !chargeCardId || !chargeAmount) return;
    const amt = parseFloat(chargeAmount);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setChargingNow(true);
    try {
      const res = await fetch('/api/stripe/charge-client-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.uid,
          paymentMethodId: chargeCardId,
          amount: amt,
          description: chargeDesc.trim() || undefined,
          invoiceId: chargeInvoiceId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChargeResult({ success: false, message: data.error || 'Charge failed' });
        return;
      }
      if (data.success) {
        // Mark linked invoice as paid
        if (chargeInvoiceId) {
          try {
            await updateDoc(doc(db, 'invoices', chargeInvoiceId), {
              status: 'paid',
              paidAt: serverTimestamp(),
              autoChargeStatus: 'succeeded',
              stripePaymentIntentId: data.paymentIntentId,
            });
          } catch (e) {
            console.error('Failed to update invoice status:', e);
          }
        }
        const invLabel = chargeInvoiceId ? ` (Invoice marked as paid)` : '';
        setChargeResult({
          success: true,
          message: `${fmtMoney(amt)} charged successfully.${invLabel} ID: ${data.paymentIntentId}`,
        });
      } else {
        setChargeResult({ success: false, message: data.message || 'Charge requires additional authentication' });
      }
    } catch (error: any) {
      setChargeResult({ success: false, message: error.message || 'Charge failed' });
    } finally {
      setChargingNow(false);
    }
  };

  const handleTestReceiptEmail = async () => {
    if (!client) return;
    if (!client.email) { toast.error('Client has no email address'); return; }
    setTestingEmail(true);
    try {
      const res = await fetch('/api/stripe/test-receipt-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send test email');
      toast.success(`Test receipt sent to ${data.sentTo} — ${data.amount ? '$' + data.amount.toFixed(2) : ''} · ${data.cardUsed}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to send test email');
    } finally {
      setTestingEmail(false);
    }
  };

  // ─── Consolidated Invoice Actions ─────────────────────────────────────────

  // IDs already used in existing consolidated invoices
  const alreadyConsolidatedIds = new Set(consolidatedInvoices.flatMap((ci) => ci.invoiceIds));

  // Invoices eligible for consolidation: sent or overdue, not already consolidated
  const eligibleInvoices = invoices.filter(
    (inv) => (inv.status === 'sent' || inv.status === 'overdue') && !alreadyConsolidatedIds.has(inv.id)
  );

  const consolidatedTotal = selectedInvoiceIds.reduce((sum, iid) => {
    const inv = invoices.find((i) => i.id === iid);
    return sum + (inv?.totalAmount ?? 0);
  }, 0);

  const handleOpenConsolidatedModal = () => {
    setSelectedInvoiceIds(eligibleInvoices.map((i) => i.id));
    setConsolidatedChargeCardId(client?.defaultPaymentMethodId || '');
    setShowConsolidatedModal(true);
  };

  const handleGenerateConsolidated = async () => {
    if (!client || selectedInvoiceIds.length === 0) return;
    setGeneratingConsolidated(true);
    try {
      const now = new Date();
      const periodStart = new Date(now.getTime() - (client.paymentTermsDays || 30) * 24 * 60 * 60 * 1000);

      let chargeStatus: string | undefined;
      let paymentIntentId: string | undefined;

      // If a card is selected, charge first
      if (consolidatedChargeCardId) {
        const chargeRes = await fetch('/api/stripe/charge-client-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: client.uid,
            paymentMethodId: consolidatedChargeCardId,
            amount: consolidatedTotal,
            description: `Consolidated invoice — ${selectedInvoiceIds.length} invoice${selectedInvoiceIds.length !== 1 ? 's' : ''}`,
          }),
        });
        const chargeData = await chargeRes.json();
        if (!chargeRes.ok || !chargeData.success) {
          throw new Error(chargeData.error || chargeData.message || 'Charge failed');
        }
        chargeStatus = 'succeeded';
        paymentIntentId = chargeData.paymentIntentId;
      }

      const isPaid = !!consolidatedChargeCardId && chargeStatus === 'succeeded';

      // Create consolidated invoice document
      const docRef = await addDoc(collection(db, 'consolidatedInvoices'), {
        clientId: client.uid,
        clientName: client.companyName || client.fullName,
        invoiceIds: selectedInvoiceIds,
        invoiceCount: selectedInvoiceIds.length,
        totalAmount: consolidatedTotal,
        periodStart,
        periodEnd: now,
        status: isPaid ? 'paid' : 'draft',
        autoCharged: isPaid,
        autoChargeStatus: chargeStatus || null,
        stripePaymentIntentId: paymentIntentId || null,
        paidAt: isPaid ? serverTimestamp() : null,
        createdAt: serverTimestamp(),
      });

      // If charged, mark all individual invoices as paid
      if (isPaid) {
        const batch = writeBatch(db);
        for (const invId of selectedInvoiceIds) {
          batch.update(doc(db, 'invoices', invId), { status: 'paid', paidAt: serverTimestamp() });
        }
        await batch.commit();
      }

      toast.success(
        isPaid
          ? `${fmtMoney(consolidatedTotal)} charged and ${selectedInvoiceIds.length} invoice${selectedInvoiceIds.length !== 1 ? 's' : ''} marked as paid`
          : `Consolidated invoice for ${fmtMoney(consolidatedTotal)} created as draft`
      );
      setShowConsolidatedModal(false);
      setSelectedInvoiceIds([]);
      setConsolidatedChargeCardId('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate consolidated invoice');
    } finally {
      setGeneratingConsolidated(false);
    }
  };

  const handleChargeAndMarkPaid = async (ci: ConsolidatedInvoice) => {
    if (!client || !consolidatedChargeCardId) {
      toast.error('Select a card to charge');
      return;
    }
    setMarkingConsolidatedPaid(ci.id);
    try {
      // Charge via Stripe
      const chargeRes = await fetch('/api/stripe/charge-client-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.uid,
          paymentMethodId: consolidatedChargeCardId,
          amount: ci.totalAmount,
          description: `Consolidated invoice — ${ci.invoiceCount} invoice${ci.invoiceCount !== 1 ? 's' : ''}`,
        }),
      });
      const chargeData = await chargeRes.json();
      if (!chargeRes.ok || !chargeData.success) {
        throw new Error(chargeData.error || chargeData.message || 'Charge failed');
      }

      // Batch: mark consolidated invoice as paid + mark each individual invoice as paid
      const batch = writeBatch(db);
      batch.update(doc(db, 'consolidatedInvoices', ci.id), {
        status: 'paid',
        autoCharged: true,
        autoChargeStatus: 'succeeded',
        stripePaymentIntentId: chargeData.paymentIntentId,
        paidAt: serverTimestamp(),
      });
      for (const invId of ci.invoiceIds) {
        batch.update(doc(db, 'invoices', invId), { status: 'paid', paidAt: serverTimestamp() });
      }
      await batch.commit();

      toast.success(`${fmtMoney(ci.totalAmount)} charged and ${ci.invoiceCount} invoice${ci.invoiceCount !== 1 ? 's' : ''} marked as paid`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to charge consolidated invoice');
    } finally {
      setMarkingConsolidatedPaid(null);
    }
  };

  const handleMarkConsolidatedPaidManual = async (ci: ConsolidatedInvoice) => {
    if (!confirm(`Mark this consolidated invoice (${fmtMoney(ci.totalAmount)}) and all ${ci.invoiceCount} invoices as paid?`)) return;
    setMarkingConsolidatedPaid(ci.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'consolidatedInvoices', ci.id), { status: 'paid', paidAt: serverTimestamp() });
      for (const invId of ci.invoiceIds) {
        batch.update(doc(db, 'invoices', invId), { status: 'paid', paidAt: serverTimestamp() });
      }
      await batch.commit();
      toast.success(`Consolidated invoice marked as paid`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark as paid');
    } finally {
      setMarkingConsolidatedPaid(null);
    }
  };

  const handleOpenBillingTermsModal = () => {
    setEditPaymentTerms(client?.paymentTermsDays ? String(client.paymentTermsDays) : '');
    setEditAutoChargeThreshold(client?.autoChargeThreshold ? String(client.autoChargeThreshold) : '');
    setShowBillingTermsModal(true);
  };

  const handleSaveBillingTerms = async () => {
    if (!client) return;
    setSavingBillingTerms(true);
    try {
      await updateDoc(doc(db, 'clients', client.uid), {
        paymentTermsDays: editPaymentTerms ? parseInt(editPaymentTerms) : null,
        autoChargeThreshold: editAutoChargeThreshold ? parseFloat(editAutoChargeThreshold) : null,
      });
      toast.success('Billing terms updated');
      setShowBillingTermsModal(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save billing terms');
    } finally {
      setSavingBillingTerms(false);
    }
  };

  const handleOpenEditClientModal = () => {
    if (!client) return;
    setEditFullName(client.fullName || '');
    setEditPhone(client.phone || '');
    setEditCompanyId(client.companyId || '');
    setEditStatus(client.status || 'approved');
    setEditAssignedLocations(client.assignedLocations || []);
    setShowEditClientModal(true);
  };

  const handleSaveClientInfo = async () => {
    if (!client || !editFullName || !editPhone) { toast.error('Name and phone are required'); return; }
    setSavingClientInfo(true);
    try {
      const selectedCompany = companies.find((c) => c.id === editCompanyId);
      await updateDoc(doc(db, 'clients', client.uid), {
        fullName: editFullName,
        phone: editPhone,
        companyId: editCompanyId || null,
        companyName: selectedCompany?.name || null,
        status: editStatus,
        assignedLocations: editAssignedLocations,
      });
      toast.success('Client updated');
      setShowEditClientModal(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save client info');
    } finally {
      setSavingClientInfo(false);
    }
  };

  const handleDeleteWorkOrder = async (woId: string) => {
    if (!confirm('Delete this work order and all related quotes & invoices?')) return;
    setDeletingWorkOrderId(woId);
    try {
      const batch = writeBatch(db);
      const [quotesSnap, invoicesSnap, biddingSnap] = await Promise.all([
        getDocs(query(collection(db, 'quotes'), where('workOrderId', '==', woId))),
        getDocs(query(collection(db, 'invoices'), where('workOrderId', '==', woId))),
        getDocs(query(collection(db, 'biddingWorkOrders'), where('workOrderId', '==', woId))),
      ]);
      quotesSnap.docs.forEach((d) => batch.delete(d.ref));
      invoicesSnap.docs.forEach((d) => batch.delete(d.ref));
      biddingSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, 'workOrders', woId));
      await batch.commit();
      toast.success('Work order deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete work order');
    } finally {
      setDeletingWorkOrderId(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!client) return;
    if (!confirm('Cancel this fixed recurring plan? The client will no longer be auto-charged.')) return;
    setCancelingSub(true);
    try {
      const res = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel subscription');
      toast.success('Fixed recurring plan cancelled.');
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel plan');
    } finally {
      setCancelingSub(false);
    }
  };

  // ─── Loading / Not Found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (!client) {
    return (
      <AdminLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">Client not found.</p>
          <Button onClick={() => router.push('/admin-portal/clients')}>Go Back</Button>
        </div>
      </AdminLayout>
    );
  }

  const initials = getInitials(client.companyName || client.fullName);
  const paymentMethods = client.paymentMethods || [];
  // Backwards compat: if paymentMethods array is empty but defaultPaymentMethodId exists, synthesize one
  const displayMethods: PaymentMethod[] = paymentMethods.length > 0
    ? paymentMethods
    : client.defaultPaymentMethodId && client.savedCardLast4
    ? [{
        id: client.defaultPaymentMethodId,
        last4: client.savedCardLast4,
        brand: client.savedCardBrand || 'card',
        expMonth: client.savedCardExpMonth || 0,
        expYear: client.savedCardExpYear || 0,
        isDefault: true,
      }]
    : [];

  const tabs: { key: TabKey; label: string; count: number; danger?: boolean }[] = [
    { key: 'all',          label: 'All',         count: enriched.length },
    { key: 'not-invoiced', label: 'Not Invoiced', count: enriched.filter((w) => w.tabCategory === 'not-invoiced').length },
    { key: 'invoiced',     label: 'Invoiced',     count: enriched.filter((w) => w.tabCategory === 'invoiced').length },
    { key: 'paid',         label: 'Paid',         count: enriched.filter((w) => w.tabCategory === 'paid').length },
    { key: 'overdue',      label: 'Overdue',      count: stats.overdueCount, danger: true },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout
      headerExtra={
        <Button
          variant="ghost"
          className="gap-2 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => router.push('/admin-portal/clients')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Button>
      }
    >
      <div className="space-y-6 max-w-7xl mx-auto pb-10">

        {/* Entity Header */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-6 flex items-center gap-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">
              {client.companyName || client.fullName}
            </h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-sm text-muted-foreground">
              <span>👤 {client.fullName}</span>
              {client.phone && <span>📞 {client.phone}</span>}
              <span>✉️ {client.email}</span>
            </div>
            {client.stripeSubscriptionId && client.subscriptionStatus === 'active' && client.subscriptionAmount && (
              <div className="mt-2 inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                <DollarSign className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                <span className="text-xs font-semibold text-blue-800">
                  Fixed Auto-Charge Plan Amount: <span className="text-blue-700">{fmtMoney(client.subscriptionAmount)}</span>/mo
                </span>
              </div>
            )}
          </div>
          <div className="ml-auto flex-shrink-0 flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={handleOpenEditClientModal}
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit Client
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={handleResendInvitation}
              disabled={resendingInvitation}
            >
              {resendingInvitation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Resend Invitation Email
            </Button>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                client.status === 'approved'
                  ? 'bg-green-100 text-green-700'
                  : client.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {client.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total Jobs',      value: stats.totalJobs,                  sub: 'All time',                  top: 'bg-blue-500' },
            { label: 'Outstanding',     value: fmtMoney(stats.outstandingAmount), sub: 'Invoiced + Overdue',        top: 'bg-yellow-500' },
            { label: 'Total Collected', value: fmtMoney(stats.collectedAmount),   sub: 'All time',                  top: 'bg-green-500' },
            { label: 'Overdue',         value: fmtMoney(stats.overdueAmount),     sub: `${stats.overdueCount} invoice${stats.overdueCount !== 1 ? 's' : ''} past due`, top: 'bg-red-500' },
            { label: 'Not Invoiced',    value: stats.notInvoicedCount + ' jobs',  sub: 'No invoice sent',           top: 'bg-purple-500' },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-xl border border-border shadow-sm p-5 relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-1 ${s.top}`} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            BILLING & PAYMENT INFO CARD
        ══════════════════════════════════════════════════════════════════════ */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" />
              Billing &amp; Payment Info
            </h3>
            <div className="flex items-center gap-2">
              {/* Send Test Receipt — visible when subscription is active or card saved */}
              {(client.stripeSubscriptionId || displayMethods.length > 0) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestReceiptEmail}
                  disabled={testingEmail}
                  className="gap-1.5 text-xs h-8 text-emerald-700 border-emerald-200 hover:border-emerald-400"
                  title="Send a test auto-charge receipt email with PDF to this client"
                >
                  {testingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  {testingEmail ? 'Sending…' : 'Send Test Receipt'}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenBankModal}
                className="gap-1.5 text-xs h-8"
              >
                <Building2 className="h-3.5 w-3.5" />
                Add Bank Account
              </Button>
              <Button
                size="sm"
                onClick={handleAddCard}
                disabled={addingCard}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-xs h-8"
              >
                {addingCard ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {addingCard ? 'Redirecting…' : 'Add Card'}
              </Button>
            </div>
          </div>

          <div className="p-5 space-y-5">

            {/* ── Saved Payment Methods ────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Saved Payment Methods
                  {displayMethods.length > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                      {displayMethods.length}
                    </span>
                  )}
                </p>
              </div>

              {displayMethods.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 flex flex-col items-center gap-2 text-center">
                  <CreditCard className="h-8 w-8 text-gray-300" />
                  <p className="text-sm text-muted-foreground">No payment methods saved for this client.</p>
                  <p className="text-xs text-muted-foreground">Add a card or bank account to enable auto-charging.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayMethods.map((pm) => {
                    const isBankAccount = pm.type === 'us_bank_account';
                    return (
                    <div
                      key={pm.id}
                      className={`rounded-lg border p-4 flex items-center gap-4 ${
                        pm.isDefault
                          ? 'border-blue-200 bg-blue-50/40'
                          : 'border-border bg-card'
                      }`}
                    >
                      {/* Payment method graphic */}
                      {isBankAccount ? (
                        <div className="h-10 w-16 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-md flex items-center justify-center flex-shrink-0 shadow-sm">
                          <Building2 className="h-5 w-5 text-white" />
                        </div>
                      ) : (
                        <div className="h-10 w-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-md flex items-center justify-center flex-shrink-0 shadow-sm">
                          <CreditCard className="h-5 w-5 text-white" />
                        </div>
                      )}

                      {/* Payment method info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground text-sm">
                            {isBankAccount
                              ? (pm.bankName || 'Bank Account')
                              : (pm.brand ? pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1) : 'Card')
                            }{' '}
                            •••• {pm.last4}
                          </p>
                          {pm.isDefault && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                              <Star className="h-3 w-3 fill-blue-600 text-blue-600" />
                              Default
                            </span>
                          )}
                          {isBankAccount && pm.verificationStatus === 'pending' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                              Pending Verification
                            </span>
                          )}
                          {client.stripeSubscriptionId &&
                            client.subscriptionStatus === 'active' &&
                            client.subscriptionPaymentMethodId === pm.id && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <CheckCircle className="h-3 w-3" />
                              Subscription Card
                            </span>
                          )}
                        </div>
                        {isBankAccount ? (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {pm.accountType ? pm.accountType.charAt(0).toUpperCase() + pm.accountType.slice(1) : 'Checking'}
                            {pm.routingNumber && <> · Routing ••••{pm.routingNumber.slice(-4)}</>}
                            <span className="mx-2 text-gray-300">|</span>
                            <span className="font-mono text-muted-foreground text-[11px]">{pm.id}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Expires {pm.expMonth ? String(pm.expMonth).padStart(2, '0') : '--'} / {pm.expYear || '--'}
                            <span className="mx-2 text-gray-300">|</span>
                            <span className="font-mono text-muted-foreground text-[11px]">{pm.id}</span>
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setChargeCardId(pm.id);
                            setChargeInvoiceId('');
                            setChargeAmount(String(client.subscriptionAmount || ''));
                            setChargeDesc('');
                            setChargeResult(null);
                            setShowChargeModal(true);
                          }}
                          className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50"
                          title="Charge this card now"
                        >
                          <Zap className="h-3 w-3" />
                          Charge
                        </Button>
                        {!pm.isDefault && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetDefault(pm.id)}
                            disabled={settingDefault === pm.id}
                            className="h-7 text-xs gap-1 text-blue-700 border-blue-200 hover:border-blue-400"
                            title="Set as default card"
                          >
                            {settingDefault === pm.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Star className="h-3 w-3" />}
                            Default
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveCard(pm.id, pm.last4)}
                          disabled={removingCard === pm.id}
                          className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:border-red-300 hover:bg-red-50"
                          title="Remove this card"
                        >
                          {removingCard === pm.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Trash2 className="h-3 w-3" />}
                          Remove
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Stripe Account ── */}
            {client.stripeCustomerId && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted px-4 py-2 border-b border-border">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stripe Account</p>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  <BillingRow label="Stripe Customer ID" value={client.stripeCustomerId} mono truncate />
                  <BillingRow label="Account Status" value="Active" highlight="green" />
                  <BillingRow
                    label="Auto-Pay"
                    value={client.autoPayEnabled ? 'Enabled' : 'Disabled'}
                    highlight={client.autoPayEnabled ? 'green' : undefined}
                  />
                  <BillingRow label="Saved Cards" value={String(displayMethods.length)} />
                </div>
              </div>
            )}

            {/* ── Fixed Monthly Auto-Charge (optional) ── */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-4 py-2 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Fixed Monthly Auto-Charge (Optional)
                </p>
              </div>
              <div className="p-4">
                {client.stripeSubscriptionId && client.subscriptionStatus === 'active' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                      <BillingRow label="Fixed Auto-Charge Plan Amount" value={fmtMoney(client.subscriptionAmount || 0)} highlight="blue" />
                      <BillingRow label="Billing Day" value={`${ordinal(client.subscriptionBillingDay || 1)} of each month`} />
                      <BillingRow label="Status" value="Active" highlight="green" />
                      <BillingRow label="Subscription ID" value={client.stripeSubscriptionId} mono truncate />
                      {client.subscriptionPaymentMethodId && (() => {
                        const subCard = displayMethods.find((m) => m.id === client.subscriptionPaymentMethodId);
                        return subCard ? (
                          <BillingRow
                            label="Charged Card"
                            value={`${subCard.brand.charAt(0).toUpperCase() + subCard.brand.slice(1)} •••• ${subCard.last4}`}
                          />
                        ) : null;
                      })()}
                    </div>
                    <div className="pt-2 border-t border-border flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSubAmount(String(client.subscriptionAmount || ''));
                          setSubBillingDay(String(client.subscriptionBillingDay || ''));
                          setSubCardId(client.subscriptionPaymentMethodId || '');
                          setShowSubModal(true);
                        }}
                        className="gap-1.5 text-blue-600 border-blue-200 hover:border-blue-300 text-xs"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit Plan
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelSubscription}
                        disabled={cancelingSub}
                        className="gap-1.5 text-red-600 border-red-200 hover:border-red-300 text-xs"
                      >
                        {cancelingSub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                        {cancelingSub ? 'Cancelling…' : 'Cancel Plan'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {client.stripeSubscriptionId && client.subscriptionStatus !== 'active' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mb-2">
                        <BillingRow
                          label="Status"
                          value={client.subscriptionStatus
                            ? client.subscriptionStatus.charAt(0).toUpperCase() + client.subscriptionStatus.slice(1)
                            : 'Inactive'}
                        />
                        <BillingRow label="Subscription ID" value={client.stripeSubscriptionId} mono truncate />
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span>No active fixed auto-charge plan.</span>
                    </div>
                    {displayMethods.length > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSubAmount('');
                          setSubBillingDay('');
                          setSubCardId(client.defaultPaymentMethodId || '');
                          setShowSubModal(true);
                        }}
                        className="gap-1.5 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create Fixed Plan
                      </Button>
                    ) : (
                      <p className="text-xs text-amber-600">Add a card first to create a fixed plan.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Consolidated Billing Terms ── */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-4 py-2 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Consolidated Billing Terms (Primary)
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={handleOpenBillingTermsModal}>
                    <Edit2 className="h-3 w-3" />
                    Edit
                  </Button>
                </div>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                <BillingRow
                  label="Payment Terms"
                  value={client.paymentTermsDays ? `Net ${client.paymentTermsDays} (every ${client.paymentTermsDays} days)` : 'Not set'}
                  highlight={client.paymentTermsDays ? 'blue' : undefined}
                />
                <BillingRow
                  label="Auto-Charge Threshold"
                  value={client.autoChargeThreshold ? fmtMoney(client.autoChargeThreshold) : 'Not set'}
                  highlight={client.autoChargeThreshold ? 'green' : undefined}
                />
                <BillingRow
                  label="Eligible Invoices"
                  value={`${eligibleInvoices.length} invoice${eligibleInvoices.length !== 1 ? 's' : ''} pending consolidation`}
                />
                <BillingRow
                  label="Consolidated Invoices"
                  value={`${consolidatedInvoices.length} generated`}
                />
              </div>
              {eligibleInvoices.length > 0 && (
                <div className="px-4 pb-4">
                  <Button
                    size="sm"
                    onClick={handleOpenConsolidatedModal}
                    className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-700"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Generate Consolidated Invoice ({eligibleInvoices.length})
                  </Button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            SUBSCRIPTION MODAL
        ══════════════════════════════════════════════════════════════════════ */}
        {showSubModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {client.stripeSubscriptionId && client.subscriptionStatus === 'active'
                    ? 'Edit Fixed Auto-Charge Plan'
                    : 'Create Fixed Auto-Charge Plan'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Charges a fixed amount on the same day every month via Stripe Subscription.
                </p>
              </div>

              <div className="space-y-3">
                {/* Card selector */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Charge Card</label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={subCardId}
                    onValueChange={setSubCardId}
                    options={displayMethods.map((pm) => ({
                      value: pm.id,
                      label: `${pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1)} •••• ${pm.last4}${pm.isDefault ? ' (Default)' : ''} — Exp ${String(pm.expMonth).padStart(2, '0')}/${pm.expYear}`,
                    }))}
                    placeholder="Select card"
                    aria-label="Charge card"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Fixed Auto-Charge Plan Amount (USD)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="e.g. 300"
                    value={subAmount}
                    onChange={(e) => setSubAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Billing day */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Billing Day of Month (1–28)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    placeholder="e.g. 2 = charged on the 2nd"
                    value={subBillingDay}
                    onChange={(e) => setSubBillingDay(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Summary */}
                {subAmount && subBillingDay && subCardId && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                    <strong>${parseFloat(subAmount || '0').toFixed(2)}</strong> charged on the{' '}
                    <strong>{ordinal(parseInt(subBillingDay || '1', 10))}</strong> of every month to{' '}
                    <strong>
                      {(() => {
                        const card = displayMethods.find((m) => m.id === subCardId);
                        return card
                          ? `${card.brand.charAt(0).toUpperCase() + card.brand.slice(1)} •••• ${card.last4}`
                          : 'selected card';
                      })()}
                    </strong>
                    .
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowSubModal(false); setSubAmount(''); setSubBillingDay(''); setSubCardId(''); }}
                  className="flex-1"
                  disabled={creatingSub}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateSubscription}
                  disabled={creatingSub}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {creatingSub ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</>
                  ) : (
                    client.stripeSubscriptionId && client.subscriptionStatus === 'active'
                      ? 'Update Plan'
                      : 'Create Plan'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            CONSOLIDATED INVOICES
        ══════════════════════════════════════════════════════════════════════ */}
        {consolidatedInvoices.length > 0 && (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-600" />
                Consolidated Invoices
                <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold px-1.5">
                  {consolidatedInvoices.length}
                </span>
              </h3>
              {eligibleInvoices.length > 0 && (
                <Button size="sm" variant="outline" onClick={handleOpenConsolidatedModal} className="gap-1.5 text-xs text-purple-700 border-purple-200 hover:border-purple-400">
                  <Plus className="h-3.5 w-3.5" />
                  Generate New
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    {['Period', 'Invoices', 'Total Amount', 'Status', 'Created', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {consolidatedInvoices.map((ci) => (
                    <tr key={ci.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(ci.periodStart)} – {fmtDate(ci.periodEnd)}
                      </td>
                      <td className="px-4 py-3.5 text-foreground">
                        <span className="inline-flex items-center gap-1 text-xs font-medium">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          {ci.invoiceCount} invoice{ci.invoiceCount !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-foreground whitespace-nowrap">
                        {fmtMoney(ci.totalAmount)}
                      </td>
                      <td className="px-4 py-3.5">
                        {ci.status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            <CheckCircle className="h-3 w-3" />Paid
                          </span>
                        ) : ci.status === 'sent' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            <Mail className="h-3 w-3" />Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            <FileText className="h-3 w-3" />Draft
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(ci.createdAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        {ci.status !== 'paid' && (
                          <div className="flex items-center gap-2">
                            {displayMethods.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={markingConsolidatedPaid === ci.id}
                                onClick={() => {
                                  setConsolidatedChargeCardId(client.defaultPaymentMethodId || displayMethods[0]?.id || '');
                                  handleChargeAndMarkPaid(ci);
                                }}
                                className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50"
                              >
                                {markingConsolidatedPaid === ci.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                Charge &amp; Mark Paid
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={markingConsolidatedPaid === ci.id}
                              onClick={() => handleMarkConsolidatedPaidManual(ci)}
                              className="h-7 text-xs gap-1 text-blue-700 border-blue-200 hover:border-blue-400"
                            >
                              {markingConsolidatedPaid === ci.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                              Mark Paid
                            </Button>
                          </div>
                        )}
                        {ci.status === 'paid' && ci.paidAt && (
                          <span className="text-xs text-muted-foreground">Paid {fmtDate(ci.paidAt)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            GENERATE CONSOLIDATED INVOICE MODAL
        ══════════════════════════════════════════════════════════════════════ */}
        {showConsolidatedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Generate Consolidated Invoice</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {client.paymentTermsDays ? `Net ${client.paymentTermsDays} billing cycle` : 'Select invoices to consolidate'}
                  </p>
                </div>
                <button
                  onClick={() => { setShowConsolidatedModal(false); setSelectedInvoiceIds([]); }}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Invoice selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Eligible Invoices ({eligibleInvoices.length})
                  </label>
                  <div className="flex gap-2">
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setSelectedInvoiceIds(eligibleInvoices.map((i) => i.id))}
                    >
                      Select all
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => setSelectedInvoiceIds([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="border border-border rounded-lg divide-y divide-border max-h-60 overflow-y-auto">
                  {eligibleInvoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic p-4 text-center">No eligible invoices</p>
                  ) : (
                    eligibleInvoices.map((inv) => (
                      <label key={inv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedInvoiceIds.includes(inv.id)}
                          onChange={(e) => {
                            setSelectedInvoiceIds((prev) =>
                              e.target.checked ? [...prev, inv.id] : prev.filter((x) => x !== inv.id)
                            );
                          }}
                          className="h-4 w-4 text-purple-600 rounded border-input"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{inv.invoiceNumber || inv.id.slice(0, 8).toUpperCase()}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(inv.createdAt)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-foreground">{fmtMoney(inv.totalAmount)}</p>
                          <span className={`text-xs ${inv.status === 'overdue' ? 'text-red-600' : 'text-blue-600'}`}>
                            {inv.status === 'overdue' ? 'Overdue' : 'Sent'}
                          </span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Card selector for auto-charge */}
              {displayMethods.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1 uppercase tracking-wide">
                    Auto-Charge Card (optional)
                  </label>
                  <SearchableSelect
                    className="w-full"
                    value={consolidatedChargeCardId}
                    onValueChange={setConsolidatedChargeCardId}
                    options={[
                      { value: '', label: 'No auto-charge — generate draft only' },
                      ...displayMethods.map((pm) => ({
                        value: pm.id,
                        label: `${pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1)} •••• ${pm.last4}${pm.isDefault ? ' (Default)' : ''} — Exp ${String(pm.expMonth).padStart(2, '0')}/${pm.expYear}`,
                      })),
                    ]}
                    placeholder="Select card"
                    aria-label="Card for auto-charge"
                  />
                  {client.autoChargeThreshold && consolidatedTotal >= client.autoChargeThreshold && (
                    <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Total {fmtMoney(consolidatedTotal)} meets the {fmtMoney(client.autoChargeThreshold)} auto-charge threshold
                    </p>
                  )}
                  {client.autoChargeThreshold && consolidatedTotal < client.autoChargeThreshold && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Total {fmtMoney(consolidatedTotal)} is below the {fmtMoney(client.autoChargeThreshold)} auto-charge threshold
                    </p>
                  )}
                </div>
              )}

              {/* Summary */}
              {selectedInvoiceIds.length > 0 && (
                <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-800">
                  <div className="flex justify-between">
                    <span>{selectedInvoiceIds.length} invoice{selectedInvoiceIds.length !== 1 ? 's' : ''} selected</span>
                    <strong>{fmtMoney(consolidatedTotal)}</strong>
                  </div>
                  {consolidatedChargeCardId && (
                    <p className="text-xs mt-1 text-purple-700">
                      Will charge {fmtMoney(consolidatedTotal)} and mark all as paid
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowConsolidatedModal(false); setSelectedInvoiceIds([]); }}
                  className="flex-1"
                  disabled={generatingConsolidated}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateConsolidated}
                  disabled={generatingConsolidated || selectedInvoiceIds.length === 0}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  {generatingConsolidated ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1" />Generating…</>
                  ) : consolidatedChargeCardId ? (
                    <><Zap className="h-4 w-4 mr-1" />Charge &amp; Generate</>
                  ) : (
                    <><FileText className="h-4 w-4 mr-1" />Generate Invoice</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TRANSACTION HISTORY
        ══════════════════════════════════════════════════════════════════════ */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
              <History className="h-4 w-4 text-blue-600" />
              Transaction History
              {charges.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold px-1.5">
                  {charges.length}
                </span>
              )}
            </h3>
            {charges.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Total charged: {fmtMoney(charges.filter(c => c.status === 'succeeded').reduce((s, c) => s + c.amount, 0))}
              </span>
            )}
          </div>
          <div className="p-5">
            {charges.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Receipt className="h-4 w-4 text-gray-300 flex-shrink-0" />
                <span>No charges yet for this client.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Date & Time', 'Amount', 'Card', 'Description', 'Status', 'Stripe ID'].map((h) => (
                        <th key={h} className="pb-2 pr-4 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {charges.map((charge) => (
                      <tr key={charge.id} className="hover:bg-muted/50">
                        <td className="py-3 pr-4 text-muted-foreground text-xs whitespace-nowrap">
                          {fmtDateTime(charge.chargedAt)}
                        </td>
                        <td className="py-3 pr-4 font-semibold text-foreground whitespace-nowrap">
                          {fmtMoney(charge.amount)}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap text-xs">
                          {charge.cardBrand
                            ? charge.cardBrand.charAt(0).toUpperCase() + charge.cardBrand.slice(1)
                            : 'Card'}{' '}
                          •••• {charge.cardLast4}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground text-xs max-w-[180px] truncate">
                          {charge.description || '—'}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          {charge.status === 'succeeded' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              <CheckCircle className="h-3 w-3" />Paid
                            </span>
                          ) : charge.status === 'failed' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700" title={charge.error}>
                              <AlertCircle className="h-3 w-3" />Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                              <Loader2 className="h-3 w-3 animate-spin" />Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
                          {charge.stripePaymentIntentId || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Assigned Locations */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              Assigned Locations
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold px-1.5">
                {locations.length}
              </span>
            </h3>
          </div>
          <div className="p-5">
            {locations.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-1">
                <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>No locations assigned to this client.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {locations.map((loc) => {
                  const addr = loc.address;
                  const addrStr = addr
                    ? [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ')
                    : null;
                  return (
                    <div key={loc.id} className="rounded-lg border border-border p-4 flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                        <MapPin className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{loc.locationName}</p>
                        {loc.companyName && (
                          <p className="text-xs text-muted-foreground truncate">{loc.companyName}</p>
                        )}
                        {addrStr && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{addrStr}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Work Orders Card */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-0 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground text-base">Work Orders</h3>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>

            <div className="flex flex-wrap gap-1 bg-muted rounded-lg p-1 w-fit mb-[-1px]">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                    activeTab === tab.key
                      ? 'bg-card text-blue-600 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-xs font-bold px-1 ${
                      activeTab === tab.key
                        ? tab.danger ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                        : tab.danger ? 'bg-red-50 text-red-500' : 'bg-gray-200 text-muted-foreground'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {['WO #', 'Date', 'Location', 'Title', 'Amount', 'Invoice Status', 'Due Date', 'Actions'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-b border-border"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      No work orders found for this tab.
                    </td>
                  </tr>
                ) : (
                  filtered.map((wo) => (
                    <tr key={wo.id} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-blue-600 whitespace-nowrap">
                        {wo.workOrderNumber || wo.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                        {fmtDate(wo.scheduledServiceDate || wo.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 text-foreground max-w-[160px] truncate">
                        {wo.locationName || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-foreground max-w-[200px] truncate">
                        {wo.title}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-foreground whitespace-nowrap">
                        {wo.invoiceAmount > 0 ? fmtMoney(wo.invoiceAmount) : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <InvoiceStatusBadge status={wo.invStatus} />
                      </td>
                      <td
                        className={`px-4 py-3.5 whitespace-nowrap font-medium ${
                          wo.invStatus === 'overdue' ? 'text-red-600' : 'text-muted-foreground'
                        }`}
                      >
                        {fmtDate(wo.dueDate)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => router.push(`/admin-portal/work-orders/${wo.id}`)}
                          >
                            <ExternalLink className="h-3 w-3" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:border-red-300 hover:bg-red-50"
                            disabled={deletingWorkOrderId === wo.id}
                            onClick={() => handleDeleteWorkOrder(wo.id)}
                          >
                            {deletingWorkOrderId === wo.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ── Charge Now Modal ─────────────────────────────────────────────── */}
      {showChargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !chargingNow && !chargeResult && setShowChargeModal(false)}
          />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Charge Card</h3>
                  <p className="text-xs text-muted-foreground">
                    {client?.companyName || client?.fullName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { if (!chargingNow) { setShowChargeModal(false); setChargeResult(null); } }}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {chargeResult ? (
              /* Result screen */
              <div className="p-8 text-center space-y-4">
                <div className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center ${chargeResult.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  {chargeResult.success
                    ? <CheckCircle className="h-7 w-7 text-emerald-500" />
                    : <AlertCircle className="h-7 w-7 text-red-500" />}
                </div>
                <div>
                  <p className="font-semibold text-foreground text-base">
                    {chargeResult.success ? 'Charge Successful!' : 'Charge Failed'}
                  </p>
                  <p className={`text-sm mt-1.5 ${chargeResult.success ? 'text-muted-foreground' : 'text-red-600'}`}>
                    {chargeResult.message}
                  </p>
                </div>
                <Button
                  onClick={() => { setShowChargeModal(false); setChargeResult(null); }}
                  className={`w-full ${chargeResult.success ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                >
                  Close
                </Button>
              </div>
            ) : (
              /* Charge form */
              <div className="p-6 space-y-4">
                {/* Card selector */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Select Card</label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={chargeCardId}
                    onValueChange={setChargeCardId}
                    options={displayMethods.map((pm) => ({
                      value: pm.id,
                      label: `${pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1)} •••• ${pm.last4}${pm.isDefault ? ' (Default)' : ''} — Exp ${String(pm.expMonth).padStart(2, '0')}/${pm.expYear}`,
                    }))}
                    placeholder="Select card"
                    aria-label="Card for charge"
                  />
                </div>

                {/* Invoice selector */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Link to Invoice (optional)</label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={chargeInvoiceId}
                    onValueChange={(val) => {
                      setChargeInvoiceId(val);
                      if (val) {
                        const inv = invoices.find(i => i.id === val);
                        if (inv) {
                          setChargeAmount(String(inv.totalAmount || ''));
                          setChargeDesc(`Payment for Invoice ${inv.invoiceNumber || inv.id}`);
                        }
                      } else {
                        setChargeAmount('');
                        setChargeDesc('');
                      }
                    }}
                    options={[
                      { value: '', label: '— No invoice (manual amount) —' },
                      ...invoices
                        .filter(inv => inv.status !== 'paid')
                        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                        .map(inv => ({
                          value: inv.id,
                          label: `${inv.invoiceNumber || 'INV-' + inv.id.slice(-6)} — ${fmtMoney(inv.totalAmount || 0)} — ${inv.status?.charAt(0).toUpperCase() + inv.status?.slice(1)}`,
                        })),
                    ]}
                    placeholder="Select an invoice..."
                    aria-label="Invoice to charge"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Amount (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={chargeAmount}
                      onChange={(e) => setChargeAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description (optional)</label>
                  <input
                    type="text"
                    value={chargeDesc}
                    onChange={(e) => setChargeDesc(e.target.value)}
                    placeholder="e.g. March 2026 service charge"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Summary */}
                {chargeAmount && parseFloat(chargeAmount) > 0 && chargeCardId && (() => {
                  const card = displayMethods.find((m) => m.id === chargeCardId);
                  return card ? (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                      Charge{' '}
                      <strong>{fmtMoney(parseFloat(chargeAmount))}</strong> to{' '}
                      <strong>{card.brand.charAt(0).toUpperCase() + card.brand.slice(1)} •••• {card.last4}</strong>
                    </div>
                  ) : null;
                })()}

                <div className="flex gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowChargeModal(false)}
                    disabled={chargingNow}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleChargeNow}
                    disabled={chargingNow || !chargeAmount || parseFloat(chargeAmount) <= 0 || !chargeCardId}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
                  >
                    {chargingNow ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Charging…</>
                    ) : (
                      <><Zap className="h-4 w-4" />Confirm Charge</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Card Modal ────────────────────────────────────────────────── */}
      {showCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !submittingCard && setShowCardModal(false)}
          />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Add Card for {client?.fullName}</h3>
                  <p className="text-xs text-muted-foreground">Secured by Stripe</p>
                </div>
              </div>
              <button
                onClick={() => !submittingCard && setShowCardModal(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAdminCardSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Card details</label>
                <div
                  ref={cardMountRef}
                  className="w-full rounded-lg border border-gray-300 bg-card px-4 py-3.5 text-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all min-h-[46px]"
                />
                {cardError && (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 flex-shrink-0" />
                    {cardError}
                  </p>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCardModal(false)}
                  disabled={submittingCard}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
                  disabled={submittingCard || !!cardError}
                >
                  {submittingCard ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                  ) : (
                    <><CheckCircle className="h-4 w-4" />Save Card</>
                  )}
                </Button>
              </div>
            </form>
            <div className="px-6 pb-5">
              <div className="flex items-center gap-2 rounded-lg bg-muted border border-border px-3 py-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  Card number is encrypted by Stripe and never touches our servers.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Bank Account Modal ────────────────────────────────────────── */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !submittingBank && setShowBankModal(false)}
          />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Add Bank Account for {client?.fullName}</h3>
                  <p className="text-xs text-muted-foreground">ACH Direct Debit via Stripe</p>
                </div>
              </div>
              <button
                onClick={() => !submittingBank && setShowBankModal(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddBankAccount} className="p-6 space-y-4">
              {/* Account Holder Name */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account Holder Name</label>
                <input
                  type="text"
                  value={bankHolderName}
                  onChange={(e) => setBankHolderName(e.target.value)}
                  placeholder="Full name on account"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Account Holder Type + Account Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Holder Type</label>
                  <select
                    value={bankHolderType}
                    onChange={(e) => setBankHolderType(e.target.value as 'individual' | 'company')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="individual">Individual</option>
                    <option value="company">Company</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account Type</label>
                  <select
                    value={bankAccountType}
                    onChange={(e) => setBankAccountType(e.target.value as 'checking' | 'savings')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
              </div>

              {/* Routing Number */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Routing Number</label>
                <input
                  type="text"
                  value={bankRouting}
                  onChange={(e) => setBankRouting(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="9-digit routing number"
                  maxLength={9}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Account Number */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account Number</label>
                <input
                  type="text"
                  value={bankAccountNum}
                  onChange={(e) => setBankAccountNum(e.target.value.replace(/\D/g, ''))}
                  placeholder="Account number"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {bankError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  {bankError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowBankModal(false)} disabled={submittingBank}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2" disabled={submittingBank}>
                  {submittingBank ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                  ) : (
                    <><CheckCircle className="h-4 w-4" />Save Bank Account</>
                  )}
                </Button>
              </div>
            </form>
            <div className="px-6 pb-5">
              <div className="flex items-center gap-2 rounded-lg bg-muted border border-border px-3 py-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  Bank details are securely transmitted to Stripe. Micro-deposit verification may be required before charging.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Billing Terms Modal ───────────────────────────────────────── */}
      {showBillingTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Edit Billing Terms</h2>
              <button onClick={() => setShowBillingTermsModal(false)} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Payment Terms</label>
                <SearchableSelect
                  className="w-full"
                  value={editPaymentTerms}
                  onValueChange={setEditPaymentTerms}
                  options={[
                    { value: '', label: 'Not set' },
                    { value: '7', label: 'Net 7 — every 7 days' },
                    { value: '14', label: 'Net 14 — every 14 days' },
                    { value: '15', label: 'Net 15 — every 15 days' },
                    { value: '30', label: 'Net 30 — every 30 days' },
                    { value: '45', label: 'Net 45 — every 45 days' },
                    { value: '60', label: 'Net 60 — every 60 days' },
                  ]}
                  placeholder="Select payment terms"
                  aria-label="Payment terms"
                />
                <p className="text-xs text-muted-foreground mt-1">Consolidated invoice sent after this many days</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Auto-Charge Threshold (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editAutoChargeThreshold}
                    onChange={(e) => setEditAutoChargeThreshold(e.target.value)}
                    placeholder="e.g. 500.00"
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Auto-charge when consolidated invoice reaches this amount</p>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowBillingTermsModal(false)} className="flex-1" disabled={savingBillingTerms}>Cancel</Button>
              <Button onClick={handleSaveBillingTerms} disabled={savingBillingTerms} className="flex-1 bg-blue-600 hover:bg-blue-700">
                {savingBillingTerms ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Client Info Modal ────────────────────────────────────────── */}
      {showEditClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Edit Client</h2>
              <button onClick={() => setShowEditClientModal(false)} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Email (cannot be changed)</label>
              <input
                type="email"
                value={client?.email || ''}
                disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-muted text-muted-foreground cursor-default"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Full name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Phone *</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Company</label>
                <SearchableSelect
                  className="w-full"
                  value={editCompanyId}
                  onValueChange={(v) => { setEditCompanyId(v); setEditAssignedLocations([]); }}
                  options={[
                    { value: '', label: 'No company' },
                    ...companies.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  placeholder="Select company"
                  aria-label="Company"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Status</label>
                <SearchableSelect
                  className="w-full"
                  value={editStatus}
                  onValueChange={(v) => setEditStatus(v as 'pending' | 'approved' | 'rejected')}
                  options={[
                    { value: 'approved', label: 'Approved' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'rejected', label: 'Rejected' },
                  ]}
                  placeholder="Status"
                  aria-label="Status"
                />
              </div>
            </div>

            {/* Assigned Locations */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Assigned Locations</label>
              <div className="border border-border rounded-lg p-3 max-h-48 overflow-y-auto bg-card">
                {(() => {
                  const locPool = editCompanyId
                    ? allLocations.filter((l) => l.companyId === editCompanyId)
                    : allLocations;
                  if (locPool.length === 0) {
                    return <p className="text-sm text-muted-foreground italic text-center py-3">{editCompanyId ? 'No locations for this company' : 'No locations available'}</p>;
                  }
                  return locPool.map((loc) => (
                    <label key={loc.id} className="flex items-center gap-2.5 py-2 px-2 hover:bg-muted rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editAssignedLocations.includes(loc.id)}
                        onChange={(e) => setEditAssignedLocations((prev) =>
                          e.target.checked ? [...prev, loc.id] : prev.filter((x) => x !== loc.id)
                        )}
                        className="h-4 w-4 text-blue-600 rounded border-input"
                      />
                      <span className="text-sm text-foreground">{loc.locationName}</span>
                      {loc.companyName && <span className="text-xs text-muted-foreground">· {loc.companyName}</span>}
                    </label>
                  ));
                })()}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setShowEditClientModal(false)} className="flex-1" disabled={savingClientInfo}>Cancel</Button>
              <Button onClick={handleSaveClientInfo} disabled={savingClientInfo} className="flex-1 bg-blue-600 hover:bg-blue-700">
                {savingClientInfo ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function BillingRow({
  label,
  value,
  mono,
  truncate,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
  highlight?: 'green' | 'blue' | 'red';
}) {
  const valueClass = highlight === 'green'
    ? 'text-emerald-700 font-semibold'
    : highlight === 'blue'
    ? 'text-blue-700 font-semibold'
    : highlight === 'red'
    ? 'text-red-600 font-semibold'
    : 'text-foreground';

  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="text-xs text-muted-foreground w-36 flex-shrink-0">{label}</span>
      <span className={`text-sm ${valueClass} ${mono ? 'font-mono text-xs' : ''} ${truncate ? 'truncate max-w-[160px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}
