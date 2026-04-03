'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  collection, query, getDocs, addDoc, doc, getDoc, updateDoc,
  serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Plus, Trash2, Receipt, ChevronDown, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { generateInvoiceNumber } from '@/lib/invoice-number';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  title: string;
  description?: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  category?: string;
  priority?: string;
  status?: string;
  locationId?: string;
  locationName?: string;
  companyId?: string;
  companyName?: string;
}

interface Client {
  id: string;
  fullName: string;
  email: string;
}

interface Category {
  id: string;
  name: string;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

// ─── SearchableSelect ─────────────────────────────────────────────────────────

interface SelectOption { value: string; label: string; }

function SearchableSelect({
  options, value, onChange, placeholder = 'Select...', disabled = false,
}: {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen(true); setSearch(''); setTimeout(() => inputRef.current?.focus(), 0); } }}
        className={`w-full flex items-center justify-between border border-gray-300 rounded-md p-2 bg-card text-left text-sm ${disabled ? 'opacity-50 cursor-not-allowed bg-muted' : 'hover:border-gray-400 cursor-pointer'}`}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 border border-border rounded-md">
              <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 text-sm outline-none bg-transparent"
              />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0
              ? <li className="px-3 py-2 text-sm text-muted-foreground">No results</li>
              : filtered.map(opt => (
                <li
                  key={opt.value}
                  onMouseDown={() => { onChange(opt.value); setOpen(false); setSearch(''); }}
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${opt.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-foreground'}`}
                >
                  {opt.label}
                  {opt.value === value && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function CreateInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedWorkOrderId = searchParams.get('workOrderId') || '';

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');

  const [formData, setFormData] = useState({
    clientId: '',
    clientName: '',
    clientEmail: '',
    workOrderId: '',
    workOrderTitle: '',
    workOrderDescription: '',
    category: '',
    priority: '',
    status: 'draft' as 'draft' | 'sent' | 'paid' | 'overdue',
    dueDate: '',
    notes: '',
    terms: 'Payment due within 30 days of invoice date.',
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, amount: 0 },
  ]);

  // ── Fetch data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [woSnap, clientSnap, catSnap] = await Promise.all([
          getDocs(query(collection(db, 'workOrders'))),
          getDocs(query(collection(db, 'clients'))),
          getDocs(query(collection(db, 'categories'), orderBy('name', 'asc'))),
        ]);
        const loadedWorkOrders = woSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkOrder));
        setWorkOrders(loadedWorkOrders);
        setClients(clientSnap.docs.map(d => ({
          id: d.id,
          fullName: d.data().fullName,
          email: d.data().email,
        })));
        setCategories(catSnap.docs.map(d => ({ id: d.id, name: d.data().name })));

        // Auto-select work order from URL param
        if (preselectedWorkOrderId) {
          const wo = loadedWorkOrders.find(w => w.id === preselectedWorkOrderId);
          if (wo) {
            setSelectedWorkOrderId(wo.id);
            setFormData(prev => ({
              ...prev,
              clientId: wo.clientId || '',
              clientName: wo.clientName || '',
              clientEmail: wo.clientEmail || '',
              workOrderId: wo.id,
              workOrderTitle: wo.title || '',
              workOrderDescription: wo.description || '',
              category: wo.category || prev.category,
              priority: wo.priority || prev.priority,
            }));
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [preselectedWorkOrderId]);

  // ── Auto-fill from work order ────────────────────────────────────────────────
  const handleWorkOrderSelect = (workOrderId: string) => {
    setSelectedWorkOrderId(workOrderId);
    if (!workOrderId) {
      setFormData(prev => ({
        ...prev,
        workOrderId: '',
        workOrderTitle: '',
        workOrderDescription: '',
        clientId: '',
        clientName: '',
        clientEmail: '',
        category: '',
        priority: '',
      }));
      return;
    }
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;
    setFormData(prev => ({
      ...prev,
      workOrderId: wo.id,
      workOrderTitle: wo.title ?? '',
      workOrderDescription: wo.description ?? '',
      clientId: wo.clientId ?? '',
      clientName: wo.clientName ?? '',
      clientEmail: wo.clientEmail ?? '',
      category: wo.category ?? '',
      priority: wo.priority ?? '',
    }));
  };

  // ── Line items ───────────────────────────────────────────────────────────────
  const updateLineItem = (index: number, field: keyof LineItem, raw: string) => {
    setLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === 'description') {
        item.description = raw;
      } else {
        const num = parseFloat(raw) || 0;
        (item as any)[field] = num;
        item.amount = item.quantity * item.unitPrice;
        if (field === 'quantity') item.amount = num * item.unitPrice;
        if (field === 'unitPrice') item.amount = item.quantity * num;
        if (field === 'amount') item.amount = num;
      }
      updated[index] = item;
      return updated;
    });
  };

  const addLineItem = () =>
    setLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, amount: 0 }]);

  const removeLineItem = (i: number) =>
    setLineItems(prev => prev.filter((_, idx) => idx !== i));

  const totalAmount = lineItems.reduce((sum, li) => sum + (li.amount || 0), 0);

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!formData.clientId || !formData.workOrderTitle || !formData.dueDate) {
      toast.error('Please fill in all required fields (Client, Work Order / Title, Due Date)');
      return;
    }
    if (lineItems.some(li => !li.description)) {
      toast.error('All line items must have a description');
      return;
    }
    setSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { toast.error('You must be logged in'); return; }

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const createdByName = adminDoc.exists() ? (adminDoc.data().fullName ?? 'Admin') : 'Admin';

      const invoiceNumber = generateInvoiceNumber();

      const invoiceRef = await addDoc(collection(db, 'invoices'), {
        invoiceNumber,
        clientId: formData.clientId,
        clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        workOrderId: formData.workOrderId || null,
        workOrderTitle: formData.workOrderTitle,
        workOrderDescription: formData.workOrderDescription,
        category: formData.category,
        priority: formData.priority,
        status: formData.status,
        totalAmount,
        lineItems,
        dueDate: new Date(formData.dueDate),
        notes: formData.notes,
        terms: formData.terms,
        createdBy: currentUser.uid,
        createdByName,
        creationSource: 'admin_portal_ui',
        systemInformation: {
          createdBy: {
            id: currentUser.uid,
            name: createdByName,
            role: 'admin',
            timestamp: new Date(),
          },
        },
        timeline: [{
          id: `created_${Date.now()}`,
          timestamp: new Date(),
          type: 'created',
          userId: currentUser.uid,
          userName: createdByName,
          userRole: 'admin',
          details: `Invoice created by ${createdByName} via Admin Portal`,
          metadata: { source: 'admin_portal_ui', invoiceNumber },
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Check if client has Fixed Auto-Charge Plan and invoice amount matches → auto-charge
      let autoCharged = false;
      if (totalAmount > 0 && formData.clientId) {
        try {
          const clientDoc = await getDoc(doc(db, 'clients', formData.clientId));
          if (clientDoc.exists()) {
            const clientData = clientDoc.data();
            const hasFixedPlan = clientData.stripeSubscriptionId && clientData.subscriptionStatus === 'active';
            const planAmount = Number(clientData.subscriptionAmount);
            const amountsMatch =
              Number.isFinite(planAmount) && planAmount > 0 && Math.abs(totalAmount - planAmount) < 0.01;
            const hasCard = clientData.defaultPaymentMethodId;

            if (hasFixedPlan && amountsMatch && hasCard) {
              // Auto-charge the client's saved card
              const chargeRes = await fetch('/api/stripe/charge-saved-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceId: invoiceRef.id, clientId: formData.clientId }),
              });
              const chargeData = await chargeRes.json();
              if (chargeRes.ok && chargeData.status === 'succeeded') {
                autoCharged = true;
                toast.success(`Invoice auto-charged $${totalAmount.toLocaleString()} via Fixed Auto-Charge Plan!`);
              } else {
                console.error('Auto-charge failed:', chargeData.error || chargeData.message);
              }
            }
          }
        } catch (autoChargeErr) {
          console.error('Auto-charge check error:', autoChargeErr);
          // Non-fatal: continue without auto-charge
        }
      }

      // Generate Stripe payment link if not auto-charged and there's a total amount
      if (!autoCharged && totalAmount > 0) {
        try {
          const res = await fetch('/api/stripe/create-payment-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              invoiceId: invoiceRef.id,
              invoiceNumber,
              amount: totalAmount,
              customerEmail: formData.clientEmail,
              clientName: formData.clientName,
              clientId: formData.clientId,
            }),
          });
          const data = await res.json();
          if (res.ok && data.paymentLink) {
            await updateDoc(doc(db, 'invoices', invoiceRef.id), {
              stripePaymentLink: data.paymentLink,
              stripeSessionId: data.sessionId,
            });
          }
        } catch (stripeErr) {
          console.error('Stripe payment link error:', stripeErr);
          // Non-fatal: invoice is created, just without payment link
        }
      }

      if (!autoCharged) toast.success('Invoice created successfully');
      router.push('/admin-portal/invoices');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Options ──────────────────────────────────────────────────────────────────
  const workOrderOptions: SelectOption[] = workOrders.map(wo => ({
    value: wo.id,
    label: wo.workOrderNumber ? `${wo.workOrderNumber} — ${wo.title}` : wo.title,
  }));

  const clientOptions: SelectOption[] = clients.map(c => ({
    value: c.id,
    label: `${c.fullName} (${c.email})`,
  }));

  const statusOptions: SelectOption[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'paid', label: 'Paid' },
    { value: 'overdue', label: 'Overdue' },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Create Invoice</h1>
            <p className="text-muted-foreground mt-1">Fill in the details or select a work order to auto-fill</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Work Order + Client */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Work Order & Client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Work Order <span className="text-muted-foreground font-normal">(auto-fills fields below)</span></Label>
                <div className="mt-1">
                  <SearchableSelect
                    options={workOrderOptions}
                    value={selectedWorkOrderId}
                    onChange={handleWorkOrderSelect}
                    placeholder="Search work orders..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Client *</Label>
                  <div className="mt-1">
                    <SearchableSelect
                      options={clientOptions}
                      value={formData.clientId}
                      onChange={(val) => {
                        const c = clients.find(x => x.id === val);
                        setFormData(prev => ({
                          ...prev,
                          clientId: val,
                          clientName: c?.fullName ?? '',
                          clientEmail: c?.email ?? '',
                        }));
                      }}
                      placeholder="Choose a client..."
                    />
                  </div>
                </div>

                <div>
                  <Label>Client Email</Label>
                  <Input
                    value={formData.clientEmail}
                    readOnly
                    className="mt-1 bg-muted text-muted-foreground"
                    placeholder="Auto-filled from client"
                  />
                </div>
              </div>

              <div>
                <Label>Work Order Title *</Label>
                <Input
                  className="mt-1"
                  value={formData.workOrderTitle}
                  onChange={e => setFormData(prev => ({ ...prev, workOrderTitle: e.target.value }))}
                  placeholder="e.g., HVAC Maintenance — March"
                />
              </div>

              <div>
                <Label>Description</Label>
                <textarea
                  className="mt-1 w-full border border-gray-300 rounded-md p-2 min-h-[80px] text-sm"
                  value={formData.workOrderDescription}
                  onChange={e => setFormData(prev => ({ ...prev, workOrderDescription: e.target.value }))}
                  placeholder="Work order description..."
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Status</Label>
                  <div className="mt-1">
                    <SearchableSelect
                      options={statusOptions}
                      value={formData.status}
                      onChange={val => setFormData(prev => ({ ...prev, status: val as any }))}
                      placeholder="Status..."
                    />
                  </div>
                </div>

                <div>
                  <Label>Due Date *</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={formData.dueDate}
                    onChange={e => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>Category</Label>
                  <div className="mt-1">
                    <SearchableSelect
                      options={categories.map(c => ({ value: c.name, label: c.name }))}
                      value={formData.category}
                      onChange={val => setFormData(prev => ({ ...prev, category: val }))}
                      placeholder="Select category..."
                    />
                  </div>
                </div>

                <div>
                  <Label>Priority</Label>
                  <div className="mt-1">
                    <SearchableSelect
                      options={[
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                      ]}
                      value={formData.priority}
                      onChange={val => setFormData(prev => ({ ...prev, priority: val }))}
                      placeholder="Priority..."
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Header row */}
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
                  <div className="col-span-4 md:col-span-2">
                    <Input
                      type="number"
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
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-foreground">${totalAmount.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes & Terms */}
          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea
                className="w-full border border-gray-300 rounded-md p-2 min-h-[100px] text-sm"
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Internal notes or client-facing notes..."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Terms</CardTitle></CardHeader>
            <CardContent>
              <textarea
                className="w-full border border-gray-300 rounded-md p-2 min-h-[100px] text-sm"
                value={formData.terms}
                onChange={e => setFormData(prev => ({ ...prev, terms: e.target.value }))}
                placeholder="Payment terms..."
              />
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-6 border-t">
          <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
            <Save className="h-4 w-4 mr-2" />
            {submitting ? 'Creating...' : 'Create Invoice'}
          </Button>
          <Button variant="outline" onClick={() => router.back()} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}

export default function CreateInvoicePage() {
  return (
    <Suspense fallback={null}>
      <CreateInvoiceContent />
    </Suspense>
  );
}
