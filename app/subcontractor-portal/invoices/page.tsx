'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, limit, getDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { formatMoney } from '@/lib/money';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Receipt, Calendar, DollarSign, CheckCircle, XCircle,
  Clock, Search, Pencil, Plus, Trash2, X, AlertCircle, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { PortalListPage } from '@/components/ui/portal-list-page';
import { EmptyState } from '@/components/ui/empty-state';

interface EditLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface Invoice {
  id: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle?: string;
  clientName?: string;
  lineItems?: InvoiceLineItem[];
  totalAmount: number;
  notes?: string;
  status: string;
  createdAt: any;
  editedAt?: any;
  biddingWorkOrderId?: string;
  subcontractorId?: string;
}

function getStatusInfo(status: string) {
  switch (status) {
    case 'paid':
      return { style: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Paid' };
    case 'sent':
      return { style: 'bg-blue-100 text-blue-800', icon: FileText, text: 'Sent to Client' };
    case 'pending_approval':
      return { style: 'bg-amber-100 text-amber-800', icon: Clock, text: 'Pending Approval' };
    case 'overdue':
      return { style: 'bg-red-100 text-red-800', icon: AlertCircle, text: 'Overdue' };
    case 'disputed':
      return { style: 'bg-red-100 text-red-800', icon: XCircle, text: 'Disputed' };
    case 'draft':
      return { style: 'bg-gray-100 text-gray-700', icon: FileText, text: 'Draft' };
    default:
      return { style: 'bg-gray-100 text-gray-700', icon: Clock, text: 'Pending' };
  }
}

export default function SubcontractorInvoices() {
  const { auth, db } = useFirebaseInstance();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [canEditInvoice, setCanEditInvoice] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Edit form state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editLineItems, setEditLineItems] = useState<EditLineItem[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUserId(user.uid);

        getDoc(doc(db, 'subcontractors', user.uid))
          .then(snap => {
            if (snap.exists()) setCanEditInvoice(snap.data().editPermissions?.canEditInvoice ?? false);
          })
          .catch(err => console.error('Failed to load edit permissions:', err));

        const q = query(
          collection(db, 'invoices'),
          where('subcontractorId', '==', user.uid),
          limit(200),
        );

        const unsub = onSnapshot(q, snap => {
          const data = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as Invoice))
            .sort((a, b) => {
              const aMs = a.createdAt?.toMillis?.() ?? 0;
              const bMs = b.createdAt?.toMillis?.() ?? 0;
              return bMs - aMs;
            });
          setInvoices(data);
          setLoading(false);
        }, err => {
          console.error('Invoices listener error:', err);
          setLoading(false);
        });

        return () => unsub();
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, [auth, db]);

  const openEditForm = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setEditLineItems(
      invoice.lineItems?.length
        ? invoice.lineItems.map(li => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.rate ?? 0,
            amount: li.amount,
          }))
        : [{ description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 }]
    );
    setEditNotes(invoice.notes || '');
  };

  const editTotal = editLineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0);

  const updateLineItem = (idx: number, field: 'description' | 'quantity' | 'unitPrice', value: string | number) => {
    setEditLineItems(prev => prev.map((li, i) => {
      if (i !== idx) return li;
      const u = { ...li, [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        u.amount = Number(u.quantity) * Number(u.unitPrice);
      }
      return u;
    }));
  };

  const handleSaveEdit = async () => {
    if (!editingInvoice || !currentUserId) return;
    const validItems = editLineItems.filter(li => li.description.trim() && Number(li.amount) > 0);
    if (!validItems.length) { toast.error('Add at least one line item'); return; }
    if (editTotal <= 0) { toast.error('Total must be greater than $0'); return; }
    if (!editingInvoice.biddingWorkOrderId || !editingInvoice.workOrderId) {
      toast.error('Cannot edit: missing work order reference');
      return;
    }

    setEditSaving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/work-orders/bidding-direct-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          biddingWorkOrderId: editingInvoice.biddingWorkOrderId,
          workOrderId: editingInvoice.workOrderId,
          lineItems: validItems.map(li => ({
            description: li.description,
            quantity: li.quantity,
            rate: li.unitPrice,
            amount: li.amount,
          })),
          notes: editNotes,
          totalAmount: editTotal,
          existingInvoiceId: editingInvoice.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || 'Update failed');
      }

      toast.success('Invoice updated successfully!');
      setEditingInvoice(null);
    } catch (err: any) {
      console.error('Failed to save invoice edit:', err);
      toast.error(err.message || 'Failed to update invoice');
    } finally {
      setEditSaving(false);
    }
  };

  const filtered = invoices.filter(inv => {
    let statusMatch = true;
    if (filter === 'pending') statusMatch = !['paid', 'sent', 'disputed'].includes(inv.status);
    else if (filter === 'sent') statusMatch = inv.status === 'sent';
    else if (filter === 'paid') statusMatch = inv.status === 'paid';
    else if (filter === 'disputed') statusMatch = inv.status === 'disputed';

    const sl = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      inv.workOrderTitle?.toLowerCase().includes(sl) ||
      inv.clientName?.toLowerCase().includes(sl) ||
      inv.workOrderNumber?.toLowerCase().includes(sl);

    return statusMatch && searchMatch;
  });

  const filterOptions = [
    { value: 'all', label: 'All', count: invoices.length },
    { value: 'pending', label: 'Pending', count: invoices.filter(i => !['paid', 'sent', 'disputed'].includes(i.status)).length },
    { value: 'sent', label: 'Sent', count: invoices.filter(i => i.status === 'sent').length },
    { value: 'paid', label: 'Paid', count: invoices.filter(i => i.status === 'paid').length },
    { value: 'disputed', label: 'Disputed', count: invoices.filter(i => i.status === 'disputed').length },
  ];

  if (loading) {
    return (
      <PortalListPage
        title="My Invoices"
        subtitle="Track your submitted invoices and their payment status"
        icon={Receipt}
      >
        <div className="flex h-64 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        </div>
      </PortalListPage>
    );
  }

  return (
    <>
      <PortalListPage
        title="My Invoices"
        subtitle="Track your submitted invoices and their payment status"
        icon={Receipt}
      >
        <div className="space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, client, or WO number…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {filterOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  filter === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-foreground border border-border hover:bg-muted'
                }`}
              >
                {opt.label} ({opt.count})
              </button>
            ))}
          </div>

          {/* Cards */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices found"
              subtitle={
                filter === 'all'
                  ? 'Invoices you submit from the Bidding page will appear here'
                  : 'Try a different filter'
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(invoice => {
                const si = getStatusInfo(invoice.status);
                const SIcon = si.icon;
                const canEdit = canEditInvoice && !['paid', 'sent'].includes(invoice.status);

                return (
                  <div
                    key={invoice.id}
                    className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
                  >
                    {/* Title + badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">
                          {invoice.workOrderTitle || 'Invoice'}
                        </p>
                        {invoice.workOrderNumber && (
                          <p className="text-xs text-muted-foreground">WO: {invoice.workOrderNumber}</p>
                        )}
                        {invoice.editedAt && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground italic mt-0.5">
                            <Pencil className="h-3 w-3" /> Edited
                          </span>
                        )}
                      </div>
                      <span className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${si.style}`}>
                        <SIcon className="h-3 w-3" />
                        {si.text}
                      </span>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {invoice.clientName && (
                        <span className="truncate">Client: {invoice.clientName}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="font-semibold text-foreground">{formatMoney(invoice.totalAmount)}</span>
                        <span className="text-muted-foreground">total</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        Submitted {invoice.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </span>
                    </div>

                    {/* Line items breakdown */}
                    {invoice.lineItems && invoice.lineItems.length > 0 && (
                      <div className="rounded-lg bg-muted/40 p-2.5 space-y-1">
                        {invoice.lineItems.map((li, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-muted-foreground truncate pr-2">
                              {li.description}{li.quantity > 1 ? ` × ${li.quantity}` : ''}
                            </span>
                            <span className="font-medium text-foreground shrink-0">{formatMoney(li.amount)}</span>
                          </div>
                        ))}
                        <div className="border-t border-border pt-1 mt-1 flex justify-between text-xs font-semibold">
                          <span>Total</span>
                          <span>{formatMoney(invoice.totalAmount)}</span>
                        </div>
                      </div>
                    )}

                    {invoice.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{invoice.notes}</p>
                    )}

                    {invoice.status === 'paid' && (
                      <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800 flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" /> Payment received
                      </div>
                    )}

                    {invoice.status === 'disputed' && (
                      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" /> Invoice disputed by client
                      </div>
                    )}

                    {canEdit && (
                      <div className="border-t border-border pt-2 mt-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-1.5 text-xs"
                          onClick={() => openEditForm(invoice)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit Invoice
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PortalListPage>

      {/* ── Edit Invoice modal ── */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="font-semibold text-base">Edit Invoice</h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {editingInvoice.workOrderTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingInvoice(null)}
                className="rounded-lg p-2 hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* Line items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Line Items</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => setEditLineItems(prev => [
                      ...prev,
                      { description: '', quantity: 1, unitPrice: 0, amount: 0 },
                    ])}
                  >
                    <Plus className="h-3 w-3" /> Add Item
                  </Button>
                </div>

                <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-0.5">
                  <span className="col-span-5">Description</span>
                  <span className="col-span-2 text-center">Qty</span>
                  <span className="col-span-3 text-center">Unit $</span>
                  <span className="col-span-1 text-center">Amt</span>
                  <span className="col-span-1" />
                </div>

                {editLineItems.map((li, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Input
                        placeholder="Description"
                        value={li.description}
                        onChange={e => updateLineItem(idx, 'description', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="1"
                        value={li.quantity || ''}
                        min={1}
                        onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value))}
                        className="h-8 text-sm text-center"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={li.unitPrice || ''}
                        min={0}
                        step="0.01"
                        onChange={e => updateLineItem(idx, 'unitPrice', Number(e.target.value))}
                        className="h-8 text-sm text-right"
                      />
                    </div>
                    <div className="col-span-1 flex items-center justify-center h-8 text-xs font-semibold text-foreground">
                      {formatMoney(li.amount)}
                    </div>
                    <div className="col-span-1 flex items-center justify-center">
                      {editLineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEditLineItems(prev => prev.filter((_, i) => i !== idx))}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex justify-between items-center rounded-lg bg-muted/50 px-3 py-2 text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(editTotal)}</span>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-sm">Notes (optional)</Label>
                <Textarea
                  placeholder="Any additional notes…"
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-border">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditingInvoice(null)}
                disabled={editSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveEdit}
                disabled={editSaving}
              >
                {editSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
