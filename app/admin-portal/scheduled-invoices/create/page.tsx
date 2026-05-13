'use client';

import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
/**
 * Admin → Create Scheduled Invoice
 *
 * Mirrors the Recurring Work Orders create flow (RWO is the canonical
 * example of the recurrence-pattern UX in this codebase) but trimmed
 * for the invoicing use-case: no category/priority/location-specific
 * fields, plus an optional auto-charge opt-in for clients with saved
 * payment methods.
 *
 * Scheduling math comes from `lib/recurrence.ts` so the "next 5 dates"
 * preview here uses the exact same iteration that the cron route will
 * use at execute time — no risk of UI/back-end drift on edge cases
 * like dayOfMonth=31 in February.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ArrowLeft, Save, Plus, Trash2, Calendar, Receipt, Zap } from 'lucide-react';
import { toast } from 'sonner';
import {
  RECURRENCE_PATTERN_LABELS,
  type RecurrencePatternLabel,
  buildRecurrencePattern,
  generateAllScheduledDates,
} from '@/lib/recurrence';
import { generateScheduledInvoiceNumber } from '@/lib/scheduled-invoice-number';
import { formatMoney } from '@/lib/money';
import { Timestamp } from 'firebase/firestore';

interface ClientLite {
  id: string;
  fullName: string;
  email: string;
  paymentMethods?: Array<{
    id: string;
    type?: 'card' | 'us_bank_account';
    last4?: string;
    brand?: string;
    bankName?: string;
    verificationStatus?: 'pending' | 'verified';
    isDefault?: boolean;
  }>;
  defaultPaymentMethodId?: string;
}

interface LineItem {
  description: string;
  /** Stored as string in form state so empty inputs render blank
   *  (no pre-filled "0" — the user explicitly asked for this). The
   *  submit handler coerces to number on write. */
  quantity: string;
  unitPrice: string;
  amount: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const labelDescription = (label: RecurrencePatternLabel): string => {
  switch (label) {
    case 'DAILY': return 'every day on the selected weekdays';
    case 'WEEKLY': return 'every week';
    case 'BI-WEEKLY': return 'every 2 weeks on the selected weekday';
    case 'MONTHLY': return 'every month';
    case 'BI-MONTHLY': return 'every 2 months';
    case 'QUARTERLY': return 'every 3 months';
    case 'SEMIANNUALLY': return 'every 6 months';
  }
};

const labelForPm = (pm: NonNullable<ClientLite['paymentMethods']>[number]): string => {
  if (pm.type === 'us_bank_account') {
    return `${pm.bankName || pm.brand || 'Bank'} ••${pm.last4 || ''}`;
  }
  const brand = pm.brand ? pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1) : 'Card';
  return `${brand} ••${pm.last4 || ''}`;
};

export default function CreateScheduledInvoicePage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    clientId: '',
    clientName: '',
    clientEmail: '',
    title: '',
    description: '',
    notes: '',
    terms: 'Payment due within 30 days of invoice date.',
    recurrencePatternLabel: 'MONTHLY' as RecurrencePatternLabel,
    daysOfWeek: [] as number[],
    daysOfMonth: [1] as number[],
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    autoCharge: false,
    autoChargePaymentMethodId: '',
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: '', unitPrice: '', amount: '' },
  ]);

  // Load clients (with their saved payment methods so the auto-charge
  // picker can render the right options once a client is selected).
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'clients'), where('status', '==', 'approved')));
        const list = snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            fullName: data.fullName || data.companyName || data.email || 'Client',
            email: data.email || '',
            paymentMethods: Array.isArray(data.paymentMethods) ? data.paymentMethods : [],
            defaultPaymentMethodId: data.defaultPaymentMethodId,
          } as ClientLite;
        });
        setClients(list);
      } catch (e) {
        console.error('Failed to load clients:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedClient = clients.find(c => c.id === formData.clientId);

  // Chargeable PMs filtered down — pending banks can't auto-charge yet.
  const chargeablePms = useMemo(() => {
    return (selectedClient?.paymentMethods || []).filter(
      (m) => m && m.id && m.verificationStatus !== 'pending',
    );
  }, [selectedClient]);

  // When the client changes, seed the auto-charge PM with their default.
  useEffect(() => {
    if (!selectedClient) {
      setFormData(prev => ({ ...prev, autoChargePaymentMethodId: '' }));
      return;
    }
    const defaultId =
      selectedClient.defaultPaymentMethodId
        && chargeablePms.some(m => m.id === selectedClient.defaultPaymentMethodId)
        ? selectedClient.defaultPaymentMethodId
        : chargeablePms[0]?.id || '';
    setFormData(prev => ({ ...prev, autoChargePaymentMethodId: defaultId }));
  }, [selectedClient, chargeablePms]);

  // Update line-item math. Strings in / strings out — empty stays empty,
  // computed amount populated only when both qty + unit price are entered.
  const updateLineItem = (index: number, field: keyof LineItem, raw: string) => {
    setLineItems(prev => {
      const next = [...prev];
      const li = { ...next[index], [field]: raw };
      if (field === 'quantity' || field === 'unitPrice') {
        const q = parseFloat(li.quantity);
        const u = parseFloat(li.unitPrice);
        if (Number.isFinite(q) && Number.isFinite(u)) {
          li.amount = (q * u).toFixed(2);
        }
      }
      next[index] = li;
      return next;
    });
  };

  const addLineItem = () =>
    setLineItems(prev => [...prev, { description: '', quantity: '', unitPrice: '', amount: '' }]);
  const removeLineItem = (i: number) =>
    setLineItems(prev => prev.filter((_, idx) => idx !== i));

  const totalAmount = lineItems.reduce(
    (sum, li) => sum + (parseFloat(li.amount) || 0),
    0,
  );

  // Compute the next 5 scheduled dates from the form's current pattern
  // state. Empty / partial state returns []. Drives the preview card so
  // the admin can see exactly what dates the cron will fire on.
  const previewDates = useMemo(() => {
    if (!formData.startDate) return [];
    const label = formData.recurrencePatternLabel;
    const isWeekday = label === 'DAILY' || label === 'BI-WEEKLY';
    const isMonthly = ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label);

    if (isWeekday && formData.daysOfWeek.length === 0) return [];
    if (isMonthly && formData.daysOfMonth.length === 0) return [];
    if (label === 'BI-WEEKLY' && formData.daysOfWeek.length !== 1) return [];
    if (label === 'BI-MONTHLY' && formData.daysOfMonth.length !== 2) return [];
    if (['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label) && formData.daysOfMonth.length !== 1) return [];

    try {
      const pattern = buildRecurrencePattern({
        label,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
        daysOfWeek: formData.daysOfWeek,
        daysOfMonth: formData.daysOfMonth,
      });
      return generateAllScheduledDates(
        { recurrencePattern: pattern, recurrencePatternLabel: label },
        5,
      );
    } catch {
      return [];
    }
  }, [formData.recurrencePatternLabel, formData.daysOfWeek, formData.daysOfMonth, formData.startDate, formData.endDate]);

  const toggleDayOfWeek = (idx: number) => {
    setFormData(prev => {
      const has = prev.daysOfWeek.includes(idx);
      // BI-WEEKLY: exactly 1 day; clicking another replaces.
      if (prev.recurrencePatternLabel === 'BI-WEEKLY') {
        return { ...prev, daysOfWeek: has ? [] : [idx] };
      }
      return {
        ...prev,
        daysOfWeek: has ? prev.daysOfWeek.filter(d => d !== idx) : [...prev.daysOfWeek, idx],
      };
    });
  };

  const toggleDayOfMonth = (day: number) => {
    setFormData(prev => {
      const has = prev.daysOfMonth.includes(day);
      // BI-MONTHLY: exactly 2 days; clicking a 3rd replaces oldest.
      if (prev.recurrencePatternLabel === 'BI-MONTHLY') {
        if (has) return { ...prev, daysOfMonth: prev.daysOfMonth.filter(d => d !== day) };
        if (prev.daysOfMonth.length >= 2) return { ...prev, daysOfMonth: [...prev.daysOfMonth.slice(1), day] };
        return { ...prev, daysOfMonth: [...prev.daysOfMonth, day] };
      }
      // MONTHLY / QUARTERLY / SEMIANNUALLY: exactly 1 day.
      return { ...prev, daysOfMonth: [day] };
    });
  };

  const handleClientChange = (clientId: string) => {
    const c = clients.find(x => x.id === clientId);
    setFormData(prev => ({
      ...prev,
      clientId,
      clientName: c?.fullName || '',
      clientEmail: c?.email || '',
    }));
  };

  const handlePatternChange = (label: RecurrencePatternLabel) => {
    setFormData(prev => {
      // Reset day selectors when switching between pattern families so
      // we don't leave stale state behind (e.g. 7 days-of-week from
      // DAILY when the user switches to MONTHLY).
      const next = { ...prev, recurrencePatternLabel: label };
      const isWeekday = label === 'DAILY' || label === 'BI-WEEKLY';
      const isMonthly = ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label);
      if (!isWeekday) next.daysOfWeek = [];
      if (!isMonthly) next.daysOfMonth = [];
      if (isMonthly && prev.daysOfMonth.length === 0) next.daysOfMonth = [1];
      if (label === 'BI-MONTHLY') {
        // Force exactly 2 days; default to 1 + 15 if user hasn't picked.
        next.daysOfMonth = prev.daysOfMonth.length === 2 ? prev.daysOfMonth : [1, 15];
      } else if (isMonthly) {
        next.daysOfMonth = prev.daysOfMonth.length >= 1 ? [prev.daysOfMonth[0]] : [1];
      }
      if (label === 'BI-WEEKLY') {
        next.daysOfWeek = prev.daysOfWeek.length === 1 ? prev.daysOfWeek : [1]; // Mon default
      }
      return next;
    });
  };

  const validate = (): string | null => {
    if (!formData.clientId) return 'Pick a client.';
    if (!formData.title.trim()) return 'Add a title for the scheduled invoice.';
    if (!formData.startDate) return 'Pick a start date.';
    const visibleLineItems = lineItems.filter(li => li.description.trim() || li.amount);
    if (visibleLineItems.length === 0) return 'Add at least one line item.';
    if (visibleLineItems.some(li => !li.description.trim())) return 'All line items need a description.';
    if (visibleLineItems.some(li => !(parseFloat(li.amount) > 0))) return 'Each line item needs a positive amount.';
    const label = formData.recurrencePatternLabel;
    if (label === 'DAILY' && formData.daysOfWeek.length === 0) return 'Pick at least one day for DAILY.';
    if (label === 'BI-WEEKLY' && formData.daysOfWeek.length !== 1) return 'Pick exactly 1 day for BI-WEEKLY.';
    if (label === 'BI-MONTHLY' && formData.daysOfMonth.length !== 2) return 'Pick exactly 2 days for BI-MONTHLY.';
    if (['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label) && formData.daysOfMonth.length !== 1) {
      return 'Pick exactly 1 day for ' + label + '.';
    }
    if (formData.autoCharge && !formData.autoChargePaymentMethodId) {
      return 'Auto-charge requires a saved payment method on the client.';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not signed in.');

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const createdByName = adminDoc.exists() ? (adminDoc.data() as any).fullName || 'Admin' : 'Admin';

      const cleanedLineItems = lineItems
        .filter(li => li.description.trim() && parseFloat(li.amount) > 0)
        .map(li => ({
          description: li.description.trim(),
          quantity: Number(li.quantity) || 1,
          unitPrice: Number(li.unitPrice) || Number(li.amount) || 0,
          amount: Number(li.amount) || 0,
        }));
      const total = cleanedLineItems.reduce((s, li) => s + li.amount, 0);

      const pattern = buildRecurrencePattern({
        label: formData.recurrencePatternLabel,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
        daysOfWeek: formData.daysOfWeek,
        daysOfMonth: formData.daysOfMonth,
      });

      const all = generateAllScheduledDates(
        { recurrencePattern: pattern, recurrencePatternLabel: formData.recurrencePatternLabel },
        50,
      );
      const nextExecution = all.find(d => d >= new Date()) || all[0] || new Date(formData.startDate);

      const scheduledInvoiceNumber = generateScheduledInvoiceNumber();

      const docRef = await addDoc(collection(db, 'scheduledInvoices'), {
        scheduledInvoiceNumber,
        clientId: formData.clientId,
        clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        title: formData.title.trim(),
        description: formData.description.trim() || '',
        notes: formData.notes.trim() || '',
        terms: formData.terms.trim() || '',
        totalAmount: total,
        lineItems: cleanedLineItems,
        status: 'active',
        recurrencePattern: pattern,
        recurrencePatternLabel: formData.recurrencePatternLabel,
        nextExecution: Timestamp.fromDate(nextExecution),
        autoCharge: formData.autoCharge === true,
        ...(formData.autoCharge && formData.autoChargePaymentMethodId
          ? { autoChargePaymentMethodId: formData.autoChargePaymentMethodId }
          : {}),
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        createdBy: currentUser.uid,
        createdByName,
        creationSource: 'admin_portal_ui',
        systemInformation: {
          createdBy: {
            id: currentUser.uid,
            name: createdByName,
            role: 'admin',
            timestamp: Timestamp.now(),
          },
        },
        timeline: [{
          id: `created_${Date.now()}`,
          timestamp: Timestamp.now(),
          type: 'created',
          userId: currentUser.uid,
          userName: createdByName,
          userRole: 'admin',
          details: `Scheduled invoice created (${formData.recurrencePatternLabel}, ${formatMoney(total)})`,
          metadata: { scheduledInvoiceNumber },
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success(`Scheduled invoice created — next run ${nextExecution.toLocaleDateString()}.`);
      router.push(`/admin-portal/scheduled-invoices/${docRef.id}`);
    } catch (e: any) {
      console.error('[scheduled-invoices/create]', e);
      toast.error(e?.message || 'Failed to create scheduled invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  const needsDayOfMonthPicker = ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY']
    .includes(formData.recurrencePatternLabel);
  const needsDayOfWeekPicker =
    formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY';
  const isBiMonthly = formData.recurrencePatternLabel === 'BI-MONTHLY';

  if (loading) {
    return (
      <>
        <PageContainer>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
          </div>
        </PageContainer>
      </>
    );
  }

  const clientOptions = clients.map(c => ({ value: c.id, label: `${c.fullName} (${c.email})` }));
  const patternOptions = RECURRENCE_PATTERN_LABELS.map(l => ({ value: l, label: l }));

  return (
    <>
      <PageContainer>
        <PageHeader
          title="Create Scheduled Invoice"
          subtitle="Define the recurring billing schedule."
          icon={Receipt}
          action={
            <Link href="/admin-portal/scheduled-invoices">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
          }
        />

        <div className="mx-auto w-full max-w-6xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Client & Invoice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Client *</Label>
                <div className="mt-1">
                  <SearchableSelect
                    options={clientOptions}
                    value={formData.clientId}
                    onValueChange={handleClientChange}
                    placeholder="Pick a client..."
                  />
                </div>
              </div>
              <div>
                <Label>Client Email</Label>
                <Input value={formData.clientEmail} readOnly className="mt-1 bg-muted text-muted-foreground" />
              </div>
            </div>

            <div>
              <Label>Title *</Label>
              <Input
                className="mt-1"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Monthly Maintenance Subscription"
              />
            </div>

            <div>
              <Label>Description</Label>
              <textarea
                className="mt-1 w-full border border-input rounded-md p-2 min-h-[80px] text-sm bg-background"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional — shown to the client on the invoice."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground uppercase px-1">
              <div className="col-span-5">Description</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit Price</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-1" />
            </div>
            {lineItems.map((li, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-12 md:col-span-5">
                  <Input
                    value={li.description}
                    onChange={e => updateLineItem(i, 'description', e.target.value)}
                    placeholder="Description"
                  />
                </div>
                {/*
                  Empty inputs render BLANK instead of the typical
                  pre-filled "0" — the user explicitly asked not to see
                  default zeros. The submit handler coerces the strings
                  back to numbers (0 fallback) before write.
                */}
                <div className="col-span-4 md:col-span-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={li.quantity}
                    onChange={e => updateLineItem(i, 'quantity', e.target.value)}
                    onWheel={e => e.currentTarget.blur()}
                    placeholder="Qty"
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={li.unitPrice}
                    onChange={e => updateLineItem(i, 'unitPrice', e.target.value)}
                    onWheel={e => e.currentTarget.blur()}
                    placeholder="Unit $"
                  />
                </div>
                <div className="col-span-3 md:col-span-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={li.amount}
                    onChange={e => updateLineItem(i, 'amount', e.target.value)}
                    onWheel={e => e.currentTarget.blur()}
                    placeholder="Amount"
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  {lineItems.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
                      onClick={() => removeLineItem(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
              <Plus className="h-4 w-4 mr-1" />
              Add Line Item
            </Button>
            <div className="flex justify-end pt-2 border-t">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Per-iteration total</p>
                <p className="text-2xl font-bold">{formatMoney(totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Recurrence & Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Frequency *</Label>
              <div className="mt-1">
                <SearchableSelect
                  options={patternOptions}
                  value={formData.recurrencePatternLabel}
                  onValueChange={(v) => handlePatternChange(v as RecurrencePatternLabel)}
                  placeholder="Select frequency..."
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Invoice will be generated <strong>{labelDescription(formData.recurrencePatternLabel)}</strong>.
              </p>
            </div>

            {needsDayOfMonthPicker && (
              <div>
                <Label>{isBiMonthly ? 'Pick 2 days of the month *' : 'Day of the month *'}</Label>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                    const isSelected = formData.daysOfMonth.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDayOfMonth(day)}
                        className={`h-9 rounded-md text-sm font-medium border transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-border hover:bg-muted text-foreground'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                {formData.daysOfMonth.some(d => d > 28) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Note: months with fewer days fall back to the last day of the month.
                  </p>
                )}
              </div>
            )}

            {needsDayOfWeekPicker && (
              <div>
                <Label>{formData.recurrencePatternLabel === 'BI-WEEKLY' ? 'Day of the week *' : 'Days of the week *'}</Label>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-7 gap-2">
                  {DAY_LABELS.map((day, idx) => {
                    const isSelected = formData.daysOfWeek.includes(idx);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDayOfWeek(idx)}
                        className={`h-9 rounded-md text-sm font-medium border transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-border hover:bg-muted text-foreground'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Start date *</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={formData.startDate}
                  onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>End date <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={formData.endDate}
                  onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            {/*
              Next 5 dates preview — driven by the same lib/recurrence.ts
              math the cron uses, so what the admin sees here is exactly
              what will fire. Empty when the form's pattern state isn't
              yet valid (e.g. user just switched to BI-WEEKLY but hasn't
              picked a day yet) — reduces noise.
            */}
            {previewDates.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                <p className="text-sm font-semibold text-blue-700 mb-2">
                  Next {previewDates.length} scheduled invoice {previewDates.length === 1 ? 'date' : 'dates'}:
                </p>
                <ul className="space-y-1">
                  {previewDates.map((d, i) => (
                    <li key={i} className="text-sm text-blue-700">
                      {i + 1}. {d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Auto-Charge <span className="text-sm font-normal text-muted-foreground">(optional)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.autoCharge}
                onChange={e => setFormData({ ...formData, autoCharge: e.target.checked })}
                className="mt-1 accent-blue-600"
              />
              <div className="text-sm">
                <p className="font-medium">Auto-charge the client's saved payment method on each iteration</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, the cron will create the invoice AND attempt an off-session charge
                  against the selected method. When disabled, the cron just sends the hosted Stripe
                  pay link and the client pays manually.
                </p>
              </div>
            </label>

            {formData.autoCharge && (
              chargeablePms.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  This client has no saved payment method. Add a card or bank from the client detail
                  page first, or leave auto-charge off and the client will receive a Stripe pay link.
                </p>
              ) : (
                <div className="ml-6">
                  <Label>Pay from</Label>
                  <select
                    value={formData.autoChargePaymentMethodId}
                    onChange={e => setFormData({ ...formData, autoChargePaymentMethodId: e.target.value })}
                    className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {chargeablePms.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {labelForPm(pm)}{pm.id === selectedClient?.defaultPaymentMethodId ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
            <Save className="h-4 w-4 mr-2" />
            {submitting ? 'Creating…' : 'Create Scheduled Invoice'}
          </Button>
          <Link href="/admin-portal/scheduled-invoices" className="flex-1">
            <Button variant="outline" disabled={submitting} className="w-full">
              Cancel
            </Button>
          </Link>
        </div>
        </div>
      </PageContainer>
    </>
  );
}
