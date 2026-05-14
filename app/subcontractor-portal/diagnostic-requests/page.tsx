'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { formatMoney } from '@/lib/money';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Stethoscope, Calendar, DollarSign, Search, Pencil, X,
  Upload, Loader2, CheckCircle, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { PortalListPage } from '@/components/ui/portal-list-page';
import { EmptyState } from '@/components/ui/empty-state';

const DIAGNOSTIC_TIME_SLOTS = [
  '12:00 AM - 1:00 AM', '1:00 AM - 2:00 AM', '2:00 AM - 3:00 AM',
  '3:00 AM - 4:00 AM', '4:00 AM - 5:00 AM', '5:00 AM - 6:00 AM',
  '6:00 AM - 7:00 AM', '7:00 AM - 8:00 AM', '8:00 AM - 9:00 AM',
  '9:00 AM - 10:00 AM', '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM',
  '12:00 PM - 1:00 PM', '1:00 PM - 2:00 PM', '2:00 PM - 3:00 PM',
  '3:00 PM - 4:00 PM', '4:00 PM - 5:00 PM', '5:00 PM - 6:00 PM',
  '6:00 PM - 7:00 PM', '7:00 PM - 8:00 PM', '8:00 PM - 9:00 PM',
  '9:00 PM - 10:00 PM', '10:00 PM - 11:00 PM', '11:00 PM - 12:00 AM',
];

const DIAG_STATUSES = [
  'diagnostic_requested',
  'diagnostic_accepted',
  'diagnostic_results_submitted',
  'diagnostic_rejected',
];

interface DiagnosticRequest {
  id: string;
  workOrderId: string;
  workOrderNumber?: string;
  workOrderTitle: string;
  clientName?: string;
  status: string;
  createdAt: any;
  diagnosticFee?: number;
  diagnosticResults?: string;
  diagnosticResultsImages?: string[];
  diagnosticResultsSubmittedAt?: any;
  diagnosticQuoteId?: string;
  diagnosticEditedAt?: any;
  diagnosticResultsEditedAt?: any;
}

const STATUS_INFO: Record<string, { style: string; text: string }> = {
  diagnostic_requested:        { style: 'bg-indigo-100 text-indigo-800', text: 'Awaiting Acceptance' },
  diagnostic_accepted:         { style: 'bg-emerald-100 text-emerald-800', text: 'Accepted' },
  diagnostic_results_submitted:{ style: 'bg-blue-100 text-blue-800', text: 'Results Submitted' },
  diagnostic_rejected:         { style: 'bg-red-100 text-red-800', text: 'Rejected' },
};

export default function DiagnosticRequestsPage() {
  const { auth, db } = useFirebaseInstance();
  const [items, setItems] = useState<DiagnosticRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [canEditDiagnostic, setCanEditDiagnostic] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Edit diagnostic request form
  const [editReqItem, setEditReqItem] = useState<DiagnosticRequest | null>(null);
  const [editFee, setEditFee] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editReqSaving, setEditReqSaving] = useState(false);
  const [editReqLoading, setEditReqLoading] = useState(false);

  // Edit diagnostic results form
  const [editResItem, setEditResItem] = useState<DiagnosticRequest | null>(null);
  const [editResults, setEditResults] = useState('');
  const [editResImages, setEditResImages] = useState<string[]>([]);
  const [uploadingResImages, setUploadingResImages] = useState(false);
  const [editResSaving, setEditResSaving] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUserId(user.uid);

        getDoc(doc(db, 'subcontractorEditPermissions', user.uid))
          .then(snap => {
            if (snap.exists()) setCanEditDiagnostic(snap.data().canEditDiagnostic ?? false);
          })
          .catch(err => console.error('Failed to load edit permissions:', err));

        // Query all biddingWorkOrders for this sub, filter client-side by status
        const q = query(
          collection(db, 'biddingWorkOrders'),
          where('subcontractorId', '==', user.uid),
        );

        const unsub = onSnapshot(q, snap => {
          const all = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as DiagnosticRequest))
            .filter(d => DIAG_STATUSES.includes(d.status))
            .sort((a, b) => {
              const aMs = a.createdAt?.toMillis?.() ?? 0;
              const bMs = b.createdAt?.toMillis?.() ?? 0;
              return bMs - aMs;
            });
          setItems(all);
          setLoading(false);
        }, err => {
          console.error('Diagnostic requests listener error:', err);
          setLoading(false);
        });

        return () => unsub();
      } else {
        setLoading(false);
      }
    });
    return () => unsubAuth();
  }, [auth, db]);

  // ── Open edit request form ──
  const openEditReqForm = async (item: DiagnosticRequest) => {
    setEditReqItem(item);
    setEditFee(item.diagnosticFee != null ? String(item.diagnosticFee) : '');
    setEditDate('');
    setEditTime('');
    setEditReqLoading(true);
    if (item.diagnosticQuoteId) {
      try {
        const qSnap = await getDoc(doc(db, 'quotes', item.diagnosticQuoteId));
        if (qSnap.exists()) {
          const d = qSnap.data();
          const dateObj = d.proposedServiceDate?.toDate?.() ||
            (d.proposedServiceDate ? new Date(d.proposedServiceDate) : null);
          setEditDate(dateObj ? dateObj.toLocaleDateString('en-CA') : '');
          setEditTime(d.proposedServiceTime || '');
        }
      } catch (err) {
        console.error('Could not load diagnostic quote:', err);
      }
    }
    setEditReqLoading(false);
  };

  const handleSaveEditReq = async () => {
    if (!editReqItem || !currentUserId) return;
    const feeNum = Number(editFee);
    if (!editFee || isNaN(feeNum) || feeNum <= 0) { toast.error('Enter a valid diagnostic fee'); return; }
    if (!editDate) { toast.error('Select a proposed date'); return; }
    if (!editTime) { toast.error('Select a proposed time'); return; }

    setEditReqSaving(true);
    try {
      if (editReqItem.diagnosticQuoteId) {
        await updateDoc(doc(db, 'quotes', editReqItem.diagnosticQuoteId), {
          proposedServiceDate: new Date(editDate),
          proposedServiceTime: editTime,
          updatedAt: serverTimestamp(),
          editedAt: serverTimestamp(),
          editedBy: currentUserId,
        });
      }

      await updateDoc(doc(db, 'biddingWorkOrders', editReqItem.id), {
        diagnosticFee: feeNum,
        diagnosticEditedAt: serverTimestamp(),
        diagnosticEditedBy: currentUserId,
        updatedAt: serverTimestamp(),
      });

      toast.success('Diagnostic request updated!');
      setEditReqItem(null);
    } catch (err) {
      console.error('Failed to update diagnostic request:', err);
      toast.error('Failed to update diagnostic request');
    } finally {
      setEditReqSaving(false);
    }
  };

  // ── Open edit results form ──
  const openEditResForm = (item: DiagnosticRequest) => {
    setEditResItem(item);
    setEditResults(item.diagnosticResults || '');
    setEditResImages(item.diagnosticResultsImages || []);
  };

  const handleResImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingResImages(true);
    try {
      const { uploadMultipleToCloudinary } = await import('@/lib/cloudinary-upload');
      const urls = await uploadMultipleToCloudinary(files);
      setEditResImages(prev => [...prev, ...urls]);
    } catch (err: any) {
      console.error('Image upload failed:', err);
      toast.error(err?.message || 'Failed to upload images');
    } finally {
      setUploadingResImages(false);
      e.target.value = '';
    }
  };

  const handleSaveEditRes = async () => {
    if (!editResItem || !currentUserId) return;
    if (!editResults.trim()) { toast.error('Enter diagnostic results'); return; }

    setEditResSaving(true);
    try {
      await updateDoc(doc(db, 'biddingWorkOrders', editResItem.id), {
        diagnosticResults: editResults,
        diagnosticResultsImages: editResImages,
        diagnosticResultsEditedAt: serverTimestamp(),
        diagnosticResultsEditedBy: currentUserId,
        updatedAt: serverTimestamp(),
      });

      // Best-effort update on the parent work order so admins see updated results
      try {
        await updateDoc(doc(db, 'workOrders', editResItem.workOrderId), {
          diagnosticResults: editResults,
          diagnosticResultsImages: editResImages,
          diagnosticResultsEditedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch { /* best effort */ }

      toast.success('Diagnostic results updated!');
      setEditResItem(null);
    } catch (err) {
      console.error('Failed to update diagnostic results:', err);
      toast.error('Failed to update diagnostic results');
    } finally {
      setEditResSaving(false);
    }
  };

  const FILTER_MAP: Record<string, string> = {
    pending:  'diagnostic_requested',
    accepted: 'diagnostic_accepted',
    results:  'diagnostic_results_submitted',
    rejected: 'diagnostic_rejected',
  };

  const filtered = items.filter(item => {
    const statusMatch = filter === 'all' || item.status === FILTER_MAP[filter];
    const sl = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      item.workOrderTitle?.toLowerCase().includes(sl) ||
      item.clientName?.toLowerCase().includes(sl) ||
      item.workOrderNumber?.toLowerCase().includes(sl);
    return statusMatch && searchMatch;
  });

  const filterOptions = [
    { value: 'all',      label: 'All',                count: items.length },
    { value: 'pending',  label: 'Awaiting Acceptance', count: items.filter(i => i.status === 'diagnostic_requested').length },
    { value: 'accepted', label: 'Accepted',            count: items.filter(i => i.status === 'diagnostic_accepted').length },
    { value: 'results',  label: 'Results Submitted',   count: items.filter(i => i.status === 'diagnostic_results_submitted').length },
    { value: 'rejected', label: 'Rejected',            count: items.filter(i => i.status === 'diagnostic_rejected').length },
  ];

  if (loading) {
    return (
      <PortalListPage
        title="My Diagnostic Requests"
        subtitle="View and manage your diagnostic requests and results"
        icon={Stethoscope}
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
        title="My Diagnostic Requests"
        subtitle="View and manage your diagnostic requests and results"
        icon={Stethoscope}
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
                    ? 'bg-indigo-600 text-white'
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
              icon={Stethoscope}
              title="No diagnostic requests"
              subtitle={
                filter === 'all'
                  ? 'Diagnostic requests you submit will appear here'
                  : 'Try a different filter'
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(item => {
                const si = STATUS_INFO[item.status] || { style: 'bg-gray-100 text-gray-700', text: item.status };

                return (
                  <div
                    key={item.id}
                    className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{item.workOrderTitle}</p>
                        {item.workOrderNumber && (
                          <p className="text-xs text-muted-foreground">WO: {item.workOrderNumber}</p>
                        )}
                        {item.diagnosticEditedAt && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground italic mt-0.5">
                            <Pencil className="h-3 w-3" /> Edited
                          </span>
                        )}
                      </div>
                      <span className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${si.style}`}>
                        <Stethoscope className="h-3 w-3" />
                        {si.text}
                      </span>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {item.clientName && <span className="truncate">Client: {item.clientName}</span>}
                      {item.diagnosticFee != null && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                          <span className="font-semibold text-foreground">{formatMoney(item.diagnosticFee)}</span>
                          <span className="text-muted-foreground">diagnostic fee</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        Submitted {item.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </span>
                    </div>

                    {/* Results section */}
                    {item.diagnosticResults && (
                      <div className="rounded-lg bg-blue-50 border border-blue-200/60 p-2.5">
                        <p className="text-xs font-medium text-blue-800 mb-1 flex items-center gap-1.5">
                          Diagnostic Results
                          {item.diagnosticResultsEditedAt && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground italic">
                              <Pencil className="h-3 w-3" /> Edited
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-blue-900 line-clamp-3">{item.diagnosticResults}</p>
                        {item.diagnosticResultsImages && item.diagnosticResultsImages.length > 0 && (
                          <p className="text-xs text-blue-700 mt-1">
                            {item.diagnosticResultsImages.length} image{item.diagnosticResultsImages.length > 1 ? 's' : ''} attached
                          </p>
                        )}
                      </div>
                    )}

                    {item.status === 'diagnostic_rejected' && (
                      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                        Diagnostic rejected by client
                      </div>
                    )}

                    {item.status === 'diagnostic_accepted' && (
                      <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        Accepted — submit results on the Bidding page
                      </div>
                    )}

                    {/* Edit actions */}
                    {canEditDiagnostic && (item.status === 'diagnostic_requested' || item.status === 'diagnostic_results_submitted') && (
                      <div className="flex flex-col gap-2 border-t border-border pt-2 mt-auto">
                        {item.status === 'diagnostic_requested' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-1.5 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            onClick={() => openEditReqForm(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit Diagnostic Request
                          </Button>
                        )}
                        {item.status === 'diagnostic_results_submitted' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                            onClick={() => openEditResForm(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit Diagnostic Results
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PortalListPage>

      {/* ── Edit Diagnostic Request modal ── */}
      {editReqItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="font-semibold text-base">Edit Diagnostic Request</h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{editReqItem.workOrderTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditReqItem(null)}
                className="rounded-lg p-2 hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {editReqLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Diagnostic Fee ($)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    min={0}
                    step="0.01"
                    value={editFee}
                    onChange={e => setEditFee(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Proposed Date</Label>
                    <Input
                      type="date"
                      value={editDate}
                      onChange={e => setEditDate(e.target.value)}
                      className="h-9 text-sm"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Proposed Time</Label>
                    <select
                      value={editTime}
                      onChange={e => setEditTime(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select…</option>
                      {DIAGNOSTIC_TIME_SLOTS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 px-5 py-4 border-t border-border">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditReqItem(null)}
                disabled={editReqSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleSaveEditReq}
                disabled={editReqSaving || editReqLoading}
              >
                {editReqSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Diagnostic Results modal ── */}
      {editResItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="font-semibold text-base">Edit Diagnostic Results</h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{editResItem.workOrderTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditResItem(null)}
                className="rounded-lg p-2 hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Diagnostic Results</Label>
                <Textarea
                  placeholder="Describe your findings in detail…"
                  value={editResults}
                  onChange={e => setEditResults(e.target.value)}
                  rows={5}
                  className="resize-none text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Photos / Attachments</Label>
                {editResImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {editResImages.map((url, i) => (
                      <div key={i} className="relative">
                        <img
                          src={url}
                          alt={`Result ${i + 1}`}
                          className="h-16 w-16 object-cover rounded-lg border border-border"
                        />
                        <button
                          type="button"
                          onClick={() => setEditResImages(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
                  {uploadingResImages
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Upload className="h-4 w-4" />}
                  {uploadingResImages ? 'Uploading…' : 'Upload photos'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={handleResImageUpload}
                    disabled={uploadingResImages}
                  />
                </label>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-border">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditResItem(null)}
                disabled={editResSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSaveEditRes}
                disabled={editResSaving}
              >
                {editResSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
