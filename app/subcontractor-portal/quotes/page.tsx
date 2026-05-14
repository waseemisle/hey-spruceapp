'use client';

import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, orderBy, limit,
  getDoc, getDocs, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { formatMoney } from '@/lib/money';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText, Calendar, DollarSign, CheckCircle, XCircle,
  Clock, Search, Pencil, Plus, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PortalListPage } from '@/components/ui/portal-list-page';
import { EmptyState } from '@/components/ui/empty-state';

const SERVICE_TIME_SLOTS = [
  '12:00 AM - 2:00 AM', '2:00 AM - 4:00 AM', '4:00 AM - 6:00 AM',
  '6:00 AM - 8:00 AM', '8:00 AM - 10:00 AM', '10:00 AM - 12:00 PM',
  '12:00 PM - 2:00 PM', '2:00 PM - 4:00 PM', '4:00 PM - 6:00 PM',
  '6:00 PM - 8:00 PM', '8:00 PM - 10:00 PM', '10:00 PM - 12:00 AM',
];

interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Quote {
  id: string;
  workOrderId: string;
  workOrderNumber?: string;
  workOrderTitle: string;
  clientName: string;
  laborCost: number;
  materialCost: number;
  totalAmount: number;
  lineItems: QuoteLineItem[];
  notes?: string;
  proposedServiceDate?: any;
  proposedServiceTime?: string;
  status: string;
  createdAt: any;
  editedAt?: any;
  forwardedToClient: boolean;
  acceptedAt?: any;
  rejectedAt?: any;
  rejectionReason?: string;
}

export default function SubcontractorQuotes() {
  const { auth, db } = useFirebaseInstance();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [canEditQuote, setCanEditQuote] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Edit form state
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [editLineItems, setEditLineItems] = useState<QuoteLineItem[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [editServiceDate, setEditServiceDate] = useState('');
  const [editServiceTime, setEditServiceTime] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUserId(user.uid);

        getDoc(doc(db, 'subcontractors', user.uid))
          .then(snap => {
            if (snap.exists()) setCanEditQuote(snap.data().editPermissions?.canEditQuote ?? false);
          })
          .catch(err => console.error('Failed to load edit permissions:', err));

        const quotesQuery = query(
          collection(db, 'quotes'),
          where('subcontractorId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(200),
        );

        const unsubscribeSnapshot = onSnapshot(quotesQuery, (snapshot) => {
          const quotesData = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data(),
          })) as Quote[];
          setQuotes(quotesData);
          setLoading(false);
        }, (error) => {
          console.error('Quotes listener error:', error);
          setLoading(false);
        });

        return () => unsubscribeSnapshot();
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db]);

  const openEditForm = (quote: Quote) => {
    setEditingQuote(quote);
    setEditLineItems(
      quote.lineItems?.length
        ? quote.lineItems.map(li => ({ ...li }))
        : [{ description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 }]
    );
    setEditNotes(quote.notes || '');
    const dateObj = quote.proposedServiceDate?.toDate?.() ||
      (quote.proposedServiceDate ? new Date(quote.proposedServiceDate) : null);
    setEditServiceDate(dateObj ? dateObj.toLocaleDateString('en-CA') : '');
    setEditServiceTime(quote.proposedServiceTime || '');
  };

  const editTotal = editLineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0);

  const updateLineItem = (idx: number, field: keyof QuoteLineItem, value: string | number) => {
    setEditLineItems(prev => prev.map((li, i) => {
      if (i !== idx) return li;
      const updated = { ...li, [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        updated.amount = Number(updated.quantity) * Number(updated.unitPrice);
      }
      return updated;
    }));
  };

  const handleSaveEdit = async () => {
    if (!editingQuote || !currentUserId) return;
    const validItems = editLineItems.filter(li => li.description.trim() && Number(li.amount) > 0);
    if (!validItems.length) { toast.error('Add at least one line item'); return; }
    if (editTotal <= 0) { toast.error('Total must be greater than $0'); return; }
    if (!editServiceDate) { toast.error('Select a proposed service date'); return; }
    if (!editServiceTime) { toast.error('Select a proposed service time'); return; }

    setEditSaving(true);
    try {
      await updateDoc(doc(db, 'quotes', editingQuote.id), {
        lineItems: validItems,
        notes: editNotes,
        proposedServiceDate: new Date(editServiceDate),
        proposedServiceTime: editServiceTime,
        totalAmount: editTotal,
        editedAt: serverTimestamp(),
        editedBy: currentUserId,
        updatedAt: serverTimestamp(),
      });

      // Stamp the associated biddingWorkOrders doc (best-effort, look up by quoteId)
      try {
        const biddingSnap = await getDocs(
          query(collection(db, 'biddingWorkOrders'), where('quoteId', '==', editingQuote.id))
        );
        if (!biddingSnap.empty) {
          await updateDoc(biddingSnap.docs[0].ref, {
            quoteEditedAt: serverTimestamp(),
            quoteEditedBy: currentUserId,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error('Failed to stamp biddingWorkOrder on quote edit:', err);
      }

      toast.success('Quote updated successfully!');
      setEditingQuote(null);
    } catch (err) {
      console.error('Failed to save quote edit:', err);
      toast.error('Failed to update quote');
    } finally {
      setEditSaving(false);
    }
  };

  const getStatusBadge = (quote: Quote) => {
    if (quote.status === 'accepted') {
      return { style: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Approved' };
    }
    if (quote.status === 'rejected') {
      return { style: 'bg-red-100 text-red-800', icon: XCircle, text: 'Rejected' };
    }
    if (quote.forwardedToClient) {
      return { style: 'bg-blue-100 text-blue-800', icon: Clock, text: 'Awaiting Client' };
    }
    return { style: 'bg-amber-100 text-amber-800', icon: Clock, text: 'Request Pending' };
  };

  const filteredQuotes = quotes.filter(quote => {
    let statusMatch = true;
    if (filter === 'pending') statusMatch = quote.status === 'pending' && !quote.forwardedToClient;
    else if (filter === 'review') statusMatch = quote.status === 'pending' && quote.forwardedToClient;
    else if (filter === 'accepted') statusMatch = quote.status === 'accepted';
    else if (filter === 'rejected') statusMatch = quote.status === 'rejected';

    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      quote.workOrderTitle?.toLowerCase().includes(searchLower) ||
      quote.clientName?.toLowerCase().includes(searchLower) ||
      (quote.notes && quote.notes.toLowerCase().includes(searchLower));

    return statusMatch && searchMatch;
  });

  const filterOptions = [
    { value: 'all', label: 'All', count: quotes.length },
    { value: 'pending', label: 'Request Pending', count: quotes.filter(q => q.status === 'pending' && !q.forwardedToClient).length },
    { value: 'review', label: 'Awaiting Client', count: quotes.filter(q => q.status === 'pending' && q.forwardedToClient).length },
    { value: 'accepted', label: 'Approved', count: quotes.filter(q => q.status === 'accepted').length },
    { value: 'rejected', label: 'Rejected', count: quotes.filter(q => q.status === 'rejected').length },
  ];

  if (loading) {
    return (
      <PortalListPage title="My Quotes" subtitle="Track your submitted quotes and their status" icon={FileText}>
        <div className="flex h-64 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        </div>
      </PortalListPage>
    );
  }

  return (
    <>
      <PortalListPage title="My Quotes" subtitle="Track your submitted quotes and their status" icon={FileText}>
        <div className="space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or client…"
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
                    ? 'bg-emerald-600 text-white'
                    : 'bg-card text-foreground border border-border hover:bg-muted'
                }`}
              >
                {opt.label} ({opt.count})
              </button>
            ))}
          </div>

          {/* Cards */}
          {filteredQuotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No quotes found"
              subtitle={filter === 'all' ? 'Start submitting quotes for available work orders' : 'Try a different filter'}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredQuotes.map(quote => {
                const statusInfo = getStatusBadge(quote);
                const StatusIcon = statusInfo.icon;
                const isEditable = canEditQuote && quote.status === 'pending';

                return (
                  <div
                    key={quote.id}
                    className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
                  >
                    {/* Title + status badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{quote.workOrderTitle}</p>
                        {quote.workOrderNumber && (
                          <p className="text-xs text-muted-foreground">WO: {quote.workOrderNumber}</p>
                        )}
                        {quote.editedAt && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground italic mt-0.5">
                            <Pencil className="h-3 w-3" /> Edited
                          </span>
                        )}
                      </div>
                      <span className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusInfo.style}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusInfo.text}
                      </span>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      <span className="truncate">Client: {quote.clientName}</span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span className="font-semibold text-foreground">{formatMoney(quote.totalAmount)}</span>
                        <span className="text-muted-foreground">total</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        Submitted {quote.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </span>
                      {quote.proposedServiceDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          Proposed: {quote.proposedServiceDate?.toDate?.().toLocaleDateString() || 'N/A'}
                          {quote.proposedServiceTime ? ` · ${quote.proposedServiceTime}` : ''}
                        </span>
                      )}
                    </div>

                    {/* Line items breakdown */}
                    {quote.lineItems?.length > 0 && (
                      <div className="rounded-lg bg-muted/40 p-2.5 space-y-1">
                        {quote.lineItems.map((li, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-muted-foreground truncate pr-2">{li.description}</span>
                            <span className="font-medium text-foreground shrink-0">{formatMoney(li.amount)}</span>
                          </div>
                        ))}
                        <div className="border-t border-border pt-1 mt-1 flex justify-between text-xs font-semibold">
                          <span>Total</span>
                          <span>{formatMoney(quote.totalAmount)}</span>
                        </div>
                      </div>
                    )}

                    {quote.forwardedToClient && (
                      <div className="rounded-md bg-primary/10 px-3 py-2 text-xs text-foreground">
                        Sent to client for approval
                      </div>
                    )}

                    {quote.status === 'rejected' && quote.rejectionReason && (
                      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                        <span className="font-semibold">Rejected: </span>{quote.rejectionReason}
                      </div>
                    )}

                    {quote.status === 'accepted' && quote.acceptedAt && (
                      <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800 flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
                        Approved on {quote.acceptedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </div>
                    )}

                    {quote.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{quote.notes}</p>
                    )}

                    {isEditable && (
                      <div className="border-t border-border pt-2 mt-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-1.5 text-xs"
                          onClick={() => openEditForm(quote)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit Quote
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

      {/* ── Edit Quote modal ── */}
      {editingQuote && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="font-semibold text-base">Edit Quote</h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{editingQuote.workOrderTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingQuote(null)}
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

                {/* Column headers */}
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

                {/* Total row */}
                <div className="flex justify-between items-center rounded-lg bg-muted/50 px-3 py-2 text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(editTotal)}</span>
                </div>
              </div>

              {/* Proposed date + time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Proposed Date</Label>
                  <Input
                    type="date"
                    value={editServiceDate}
                    onChange={e => setEditServiceDate(e.target.value)}
                    className="h-9 text-sm"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Proposed Time</Label>
                  <select
                    value={editServiceTime}
                    onChange={e => setEditServiceTime(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select time…</option>
                    {SERVICE_TIME_SLOTS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
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
                onClick={() => setEditingQuote(null)}
                disabled={editSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
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
