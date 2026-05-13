'use client';

import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
/**
 * Admin → Edit Scheduled Invoice
 *
 * Intentionally narrower than the create page. Editing schedule shape
 * (frequency, days, start date) mid-flight makes the past-execution
 * audit confusing and risks duplicate or skipped runs, so this page
 * only allows safe metadata edits — title, description, line items,
 * notes, terms, total. To change the schedule, admin should cancel
 * and recreate (status pill on the detail page makes that a one-click
 * trip).
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, serverTimestamp, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Plus, Trash2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney } from '@/lib/money';

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
}

export default function EditScheduledInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    notes: '',
    terms: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'scheduledInvoices', id));
        if (!snap.exists()) {
          toast.error('Scheduled invoice not found.');
          router.push('/admin-portal/scheduled-invoices');
          return;
        }
        const data = snap.data() as any;
        setForm({
          title: data.title || '',
          description: data.description || '',
          notes: data.notes || '',
          terms: data.terms || '',
        });
        setLineItems(
          (Array.isArray(data.lineItems) && data.lineItems.length > 0
            ? data.lineItems
            : [{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]
          ).map((li: any) => ({
            description: String(li.description || ''),
            quantity: li.quantity ? String(li.quantity) : '',
            unitPrice: li.unitPrice ? String(li.unitPrice) : '',
            amount: li.amount ? String(li.amount) : '',
          })),
        );
      } catch (e) {
        console.error(e);
        toast.error('Failed to load scheduled invoice.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

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

  const totalAmount = lineItems.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required.');
      return;
    }
    const cleaned = lineItems
      .filter(li => li.description.trim() && parseFloat(li.amount) > 0)
      .map(li => ({
        description: li.description.trim(),
        quantity: Number(li.quantity) || 1,
        unitPrice: Number(li.unitPrice) || Number(li.amount) || 0,
        amount: Number(li.amount) || 0,
      }));
    if (cleaned.length === 0) {
      toast.error('Add at least one line item with a positive amount.');
      return;
    }
    setSaving(true);
    try {
      const currentUser = auth.currentUser;
      const adminDoc = currentUser ? await getDoc(doc(db, 'adminUsers', currentUser.uid)) : null;
      const userName = adminDoc?.exists() ? (adminDoc.data() as any).fullName || 'Admin' : 'Admin';

      const total = cleaned.reduce((s, li) => s + li.amount, 0);

      await updateDoc(doc(db, 'scheduledInvoices', id), {
        title: form.title.trim(),
        description: form.description.trim() || '',
        notes: form.notes.trim() || '',
        terms: form.terms.trim() || '',
        lineItems: cleaned,
        totalAmount: total,
        updatedAt: serverTimestamp(),
        // Append a timeline event so the audit trail shows what changed.
        // We avoid arrayUnion to keep the existing timeline ordering and
        // structure consistent with create.
      });
      const fresh = await getDoc(doc(db, 'scheduledInvoices', id));
      const existingTimeline = (fresh.data() as any)?.timeline || [];
      await updateDoc(doc(db, 'scheduledInvoices', id), {
        timeline: [
          ...existingTimeline,
          {
            id: `edited_${Date.now()}`,
            timestamp: Timestamp.now(),
            type: 'edited',
            userId: currentUser?.uid || 'unknown',
            userName,
            userRole: 'admin',
            details: `Schedule edited by ${userName} (total ${formatMoney(total)})`,
            metadata: {},
          },
        ],
      });

      toast.success('Saved.');
      router.push(`/admin-portal/scheduled-invoices/${id}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <>
      <PageContainer>
        <PageHeader
          title="Edit Scheduled Invoice"
          subtitle="Update title, description, and line items. Schedule changes require cancel + recreate."
          icon={Receipt}
          action={
            <Link href={`/admin-portal/scheduled-invoices/${id}`}>
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
              Invoice Content
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input className="mt-1" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <textarea
                className="mt-1 w-full border border-input rounded-md p-2 min-h-[80px] text-sm bg-background"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Notes</Label>
                <textarea
                  className="mt-1 w-full border border-input rounded-md p-2 min-h-[60px] text-sm bg-background"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div>
                <Label>Terms</Label>
                <textarea
                  className="mt-1 w-full border border-input rounded-md p-2 min-h-[60px] text-sm bg-background"
                  value={form.terms}
                  onChange={e => setForm({ ...form, terms: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
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
                  <Input value={li.description} onChange={e => updateLineItem(i, 'description', e.target.value)} placeholder="Description" />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Input type="number" inputMode="decimal" min="0" step="0.01" value={li.quantity} onChange={e => updateLineItem(i, 'quantity', e.target.value)} onWheel={e => e.currentTarget.blur()} placeholder="Qty" />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Input type="number" inputMode="decimal" min="0" step="0.01" value={li.unitPrice} onChange={e => updateLineItem(i, 'unitPrice', e.target.value)} onWheel={e => e.currentTarget.blur()} placeholder="Unit $" />
                </div>
                <div className="col-span-3 md:col-span-2">
                  <Input type="number" inputMode="decimal" min="0" step="0.01" value={li.amount} onChange={e => updateLineItem(i, 'amount', e.target.value)} onWheel={e => e.currentTarget.blur()} placeholder="Amount" />
                </div>
                <div className="col-span-1 flex justify-center">
                  {lineItems.length > 1 && (
                    <Button type="button" size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto" onClick={() => removeLineItem(i)}>
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
                <p className="text-xs text-muted-foreground">New per-iteration total</p>
                <p className="text-2xl font-bold">{formatMoney(totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
          <Link href={`/admin-portal/scheduled-invoices/${id}`} className="flex-1">
            <Button variant="outline" disabled={saving} className="w-full">Cancel</Button>
          </Link>
        </div>
        </div>
      </PageContainer>
    </>
  );
}
