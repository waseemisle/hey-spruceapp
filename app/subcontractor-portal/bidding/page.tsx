'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, addDoc, serverTimestamp, getDocs, updateDoc, Timestamp } from 'firebase/firestore';
import { createQuoteTimelineEvent } from '@/lib/timeline';
import { notifyQuoteSubmission } from '@/lib/notifications';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClipboardList, Calendar, MapPin, DollarSign, Search, Stethoscope, AlertCircle, FileText, X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatAddress } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';
import { ImageLightbox } from '@/components/ui/image-lightbox';

const DEFAULT_DIAGNOSTIC_FEE = 69;

interface BiddingWorkOrder {
  id: string;
  workOrderId: string;
  workOrderNumber?: string;
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
  status: string;
  sharedAt: any;
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
    estimatedDuration: '',
    proposedServiceDate: '',
    proposedServiceTime: '',
    notes: '',
  });

  /** Diagnostic fee for the initial visit — subcontractor bids this amount. Default $69. */
  const [diagnosticFee, setDiagnosticFee] = useState<string>(DEFAULT_DIAGNOSTIC_FEE.toFixed(2));

  // ─── Direct Submit Quote (no diagnostic) ───
  const [showDirectQuoteForm, setShowDirectQuoteForm] = useState(false);
  const [directQuoteLineItems, setDirectQuoteLineItems] = useState<Array<{ description: string; quantity: number; unitPrice: number; amount: number }>>([
    { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
    { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
  ]);
  const [directQuoteNotes, setDirectQuoteNotes] = useState('');
  const [directQuoteDuration, setDirectQuoteDuration] = useState('');
  const [directQuoteServiceDate, setDirectQuoteServiceDate] = useState('');
  const [directQuoteServiceTime, setDirectQuoteServiceTime] = useState('');
  const [directQuoteSubmitting, setDirectQuoteSubmitting] = useState(false);

  // ─── Reject Quote Request ───
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const biddingQuery = query(
          collection(db, 'biddingWorkOrders'),
          where('subcontractorId', '==', user.uid),
          where('status', '==', 'pending'),
          orderBy('sharedAt', 'desc')
        );

        const unsubscribeSnapshot = onSnapshot(
          biddingQuery,
          (snapshot) => {
            const biddingData = snapshot.docs.map(d => ({
              id: d.id,
              ...d.data(),
            })) as BiddingWorkOrder[];
            setBiddingWorkOrders(biddingData);
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
        const woDoc = await getDoc(doc(db, 'workOrders', viewWorkOrder.workOrderId));
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
    if (!directQuoteDuration || !directQuoteServiceDate || !directQuoteServiceTime) {
      toast.error('Please fill in estimated duration and proposed service date/time');
      return;
    }
    setDirectQuoteSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
      if (!subDoc.exists()) return;
      const subData = subDoc.data();

      const labor = validItems.filter(li => li.description.toLowerCase().includes('labor')).reduce((s, li) => s + Number(li.amount), 0);
      const material = validItems.filter(li => li.description.toLowerCase().includes('material')).reduce((s, li) => s + Number(li.amount), 0);
      const total = validItems.reduce((s, li) => s + Number(li.amount), 0);

      const createdByName = subData.fullName || subData.businessName || 'Subcontractor';
      const timelineEvent = createQuoteTimelineEvent({
        type: 'created',
        userId: currentUser.uid,
        userName: createdByName,
        userRole: 'subcontractor',
        details: `Quote submitted — total $${total.toFixed(2)}`,
        metadata: { source: 'subcontractor_bidding_direct', workOrderNumber: selectedBidding.workOrderNumber },
      });

      const quoteRef = await addDoc(collection(db, 'quotes'), {
        workOrderId: selectedBidding.workOrderId,
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
        estimatedDuration: directQuoteDuration,
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

      await notifyQuoteSubmission(
        selectedBidding.clientId,
        selectedBidding.workOrderId,
        selectedBidding.workOrderNumber || selectedBidding.workOrderId,
        subData.fullName || subData.businessName,
        total,
      );

      // Fire-and-forget admin email
      fetch('/api/email/send-quote-notification', {
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
      }).catch(console.error);

      // Update work order status + quotesReceived (best effort)
      try {
        const workOrderRef = doc(db, 'workOrders', selectedBidding.workOrderId);
        const workOrderSnapshot = await getDoc(workOrderRef);
        if (workOrderSnapshot.exists()) {
          const currentStatus = workOrderSnapshot.data()?.status as string | undefined;
          const statusesEligibleForQuote = ['pending', 'approved', 'bidding'];
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
            details: `Quote received from ${subData.fullName || subData.businessName} - $${total.toLocaleString()}`,
            metadata: { quoteId: quoteRef.id, amount: total },
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
        }
      } catch (e) { console.error('Quote submitted, but failed to update work order:', e); }

      try {
        await updateDoc(doc(db, 'biddingWorkOrders', selectedBidding.id), {
          status: 'quoted',
          quotedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (e) { console.error('Quote submitted, but failed to update biddingWorkOrder:', e); }

      toast.success('Quote submitted successfully!');
      setShowDirectQuoteForm(false);
      setSelectedBidding(null);
      setDirectQuoteLineItems([
        { description: 'Labor', quantity: 1, unitPrice: 0, amount: 0 },
        { description: 'Materials', quantity: 1, unitPrice: 0, amount: 0 },
      ]);
      setDirectQuoteNotes('');
      setDirectQuoteDuration('');
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
      toast.success('Quote request rejected');
    } catch (error) {
      console.error('Error rejecting bidding:', error);
      toast.error('Failed to reject quote request');
    } finally {
      setRejectingId(null);
    }
  };

  const handleSubmitQuote = async () => {
    if (!selectedBidding) return;

    if (!quoteForm.estimatedDuration || !quoteForm.proposedServiceDate || !quoteForm.proposedServiceTime) {
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
        details: `Diagnostic request submitted to client — fee $${feeNum.toFixed(2)}`,
        metadata: {
          source: 'subcontractor_bidding',
          workOrderNumber: selectedBidding.workOrderNumber,
          isDiagnosticQuote: true,
          diagnosticFee: feeNum,
        },
      });
      // Diagnostic Requests skip admin markup — send directly to the client.
      const quoteRef = await addDoc(collection(db, 'quotes'), {
        workOrderId: selectedBidding.workOrderId,
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
        estimatedDuration: quoteForm.estimatedDuration,
        proposedServiceDate: new Date(quoteForm.proposedServiceDate),
        proposedServiceTime: quoteForm.proposedServiceTime,
        lineItems: diagnosticLineItem,
        notes: quoteForm.notes,
        status: 'sent_to_client',
        sentToClientAt: serverTimestamp(),
        // Diagnostic → Repair workflow
        isDiagnosticQuote: true,
        diagnosticFee: feeNum,
        createdBy: currentUser.uid,
        creationSource: 'subcontractor_bidding',
        timeline: [timelineEvent],
        systemInformation: {
          createdBy: {
            id: currentUser.uid,
            name: createdByName,
            role: 'subcontractor',
            timestamp: Timestamp.now(),
          },
          sentToClientBy: {
            id: currentUser.uid,
            name: createdByName,
            role: 'subcontractor',
            timestamp: Timestamp.now(),
            autoForwarded: true,
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Notify admins + client that a Diagnostic Request arrived
      // (admin is informed but approval is not required — it went straight to client).
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

      // Best-effort downstream updates; quote creation above is the critical path.
      try {
        // Record the diagnostic request on the parent work order timeline, but
        // DO NOT flip the work order to 'quotes_received' — diagnostic requests
        // are a distinct flow that does not require admin markup.
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
            details: `Diagnostic Request received from ${subData.fullName || subData.businessName} - $${total.toLocaleString()} (sent directly to client)`,
            metadata: {
              quoteId: quoteRef.id,
              amount: total,
              diagnosticFee: feeNum,
              proposedServiceDate: quoteForm.proposedServiceDate,
              proposedServiceTime: quoteForm.proposedServiceTime,
              isDiagnosticQuote: true,
            },
          };

          const existingDiag = existingSysInfo.diagnosticRequests || [];
          const updatedSysInfo = {
            ...existingSysInfo,
            diagnosticRequests: [...existingDiag, {
              quoteId: quoteRef.id,
              subcontractorId: currentUser.uid,
              subcontractorName: subData.fullName || subData.businessName,
              diagnosticFee: feeNum,
              timestamp: Timestamp.now(),
            }],
          };

          await updateDoc(workOrderRef, {
            updatedAt: serverTimestamp(),
            timeline: [...existingTimeline, woTimelineEvent],
            systemInformation: updatedSysInfo,
          });
        }
      } catch (workOrderUpdateError) {
        console.error('Diagnostic request submitted, but failed to update work order:', workOrderUpdateError);
      }

      try {
        // Remove the bidding card from the sub's list (they've submitted their diagnostic)
        await updateDoc(doc(db, 'biddingWorkOrders', selectedBidding.id), {
          status: 'diagnostic_requested',
          quotedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (biddingUpdateError) {
        console.error('Diagnostic request submitted, but failed to update biddingWorkOrder:', biddingUpdateError);
      }

      toast.success('Diagnostic Request sent to client!');
      setShowQuoteForm(false);
      setSelectedBidding(null);
      setQuoteForm({
        estimatedDuration: '',
        proposedServiceDate: '',
        proposedServiceTime: '',
        notes: '',
      });
      setDiagnosticFee(DEFAULT_DIAGNOSTIC_FEE.toFixed(2));
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
      <SubcontractorLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </SubcontractorLayout>
    );
  }

  if (viewWorkOrder) {
    return (
      <SubcontractorLayout>
        <PageContainer>
          <PageHeader
            title="Work Order Details"
            subtitle={viewWorkOrder.workOrderNumber ? `Work Order: ${viewWorkOrder.workOrderNumber}` : viewWorkOrder.workOrderTitle}
            icon={ClipboardList}
            iconClassName="text-blue-600"
            action={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setViewWorkOrder(null)}>
                  Back
                </Button>
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => {
                    setSelectedBidding(viewWorkOrder);
                    setShowQuoteForm(true);
                    setViewWorkOrder(null);
                  }}
                >
                  <Stethoscope className="h-4 w-4 mr-1" />
                  Submit Diagnostic Bid
                </Button>
              </div>
            }
          />

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Work Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <p className="text-sm text-foreground">${Number(viewWorkOrder.estimateBudget).toLocaleString()}</p>
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
                      <button key={i} onClick={() => { setLightboxImages(workOrderImages); setLightboxIndex(i); }} className="block rounded-lg overflow-hidden border border-border hover:border-blue-400 transition-colors cursor-pointer">
                        <img src={img} alt={`Attachment ${i + 1}`} className="w-full h-24 object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </PageContainer>
      </SubcontractorLayout>
    );
  }

  if (showDirectQuoteForm && selectedBidding) {
    return (
      <SubcontractorLayout>
        <PageContainer>
          <PageHeader
            title="Submit Quote"
            subtitle={selectedBidding.workOrderNumber ? `Work Order: ${selectedBidding.workOrderNumber}` : selectedBidding.workOrderTitle}
            icon={FileText}
            iconClassName="text-emerald-600"
            action={
              <Button variant="outline" onClick={() => {
                setShowDirectQuoteForm(false);
                setSelectedBidding(null);
              }}>
                Cancel
              </Button>
            }
          />

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Work Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedBidding.workOrderTitle && (
                  <div>
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
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Address</p>
                    <p className="text-sm text-foreground">{formatAddress(selectedBidding.locationAddress)}</p>
                  </div>
                )}
              </div>
              {selectedBidding.workOrderDescription && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{selectedBidding.workOrderDescription}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/30 dark:bg-emerald-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
                <FileText className="h-5 w-5" />
                Quote Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-white dark:bg-emerald-950/30 border border-emerald-200 p-3 text-sm text-emerald-900 dark:text-emerald-200 flex items-start gap-2 mb-6">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  Submit your complete quote for this job (labor + materials). Once the client
                  approves it, the work order will be assigned to you.
                </span>
              </div>

              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="directDuration">Estimated Duration *</Label>
                    <Input
                      id="directDuration"
                      value={directQuoteDuration}
                      onChange={(e) => setDirectQuoteDuration(e.target.value)}
                      placeholder="e.g., 2-3 hours"
                      required
                    />
                  </div>
                  <div />
                  <div>
                    <Label htmlFor="directServiceDate">Proposed Service Date *</Label>
                    <Input
                      id="directServiceDate"
                      type="date"
                      value={directQuoteServiceDate}
                      onChange={(e) => setDirectQuoteServiceDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="directServiceTime">Proposed Service Time *</Label>
                    <Input
                      id="directServiceTime"
                      type="time"
                      value={directQuoteServiceTime}
                      onChange={(e) => setDirectQuoteServiceTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Line Items *</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addDirectLineItem} className="h-7 text-xs gap-1">
                      <Plus className="h-3.5 w-3.5" /> Add Item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {directQuoteLineItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          <Input
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateDirectLineItem(idx, 'description', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => updateDirectLineItem(idx, 'quantity', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder="Unit $"
                            value={item.unitPrice}
                            onChange={(e) => updateDirectLineItem(idx, 'unitPrice', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2 text-right text-sm font-semibold">
                          ${item.amount.toFixed(2)}
                        </div>
                        <div className="col-span-1">
                          {directQuoteLineItems.length > 1 && (
                            <Button type="button" size="icon" variant="ghost" onClick={() => removeDirectLineItem(idx)} className="h-8 w-8 text-red-600">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Any additional information..."
                  />
                </div>

                <div className="border-t pt-6">
                  <div className="bg-muted p-6 rounded-lg">
                    <h3 className="font-semibold text-lg mb-4">Quote Summary</h3>
                    <div className="flex justify-between text-xl font-bold">
                      <span>Total:</span>
                      <span className="text-emerald-700">${directQuoteTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => {
                    setShowDirectQuoteForm(false);
                    setSelectedBidding(null);
                  }}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitDirectQuote}
                    loading={directQuoteSubmitting} disabled={directQuoteSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {directQuoteSubmitting ? 'Submitting...' : 'Submit Quote'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </PageContainer>
      </SubcontractorLayout>
    );
  }

  if (showQuoteForm && selectedBidding) {
    return (
      <SubcontractorLayout>
        <PageContainer>
          <PageHeader
            title="Submit Diagnostic Bid"
            subtitle={selectedBidding.workOrderNumber ? `Work Order: ${selectedBidding.workOrderNumber}` : selectedBidding.workOrderTitle}
            icon={Stethoscope}
            iconClassName="text-indigo-600"
            action={
              <Button variant="outline" onClick={() => {
                setShowQuoteForm(false);
                setSelectedBidding(null);
              }}>
                Cancel
              </Button>
            }
          />

          {/* Work Order Details */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Work Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedBidding.workOrderTitle && (
                  <div>
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
                    <p className="text-sm text-foreground">${Number((selectedBidding as any).estimateBudget).toLocaleString()}</p>
                  </div>
                )}
                {selectedBidding.locationName && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Location</p>
                    <p className="text-sm text-foreground">{selectedBidding.locationName}</p>
                  </div>
                )}
                {selectedBidding.locationAddress && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Address</p>
                    <p className="text-sm text-foreground">{selectedBidding.locationAddress}</p>
                  </div>
                )}
              </div>
              {selectedBidding.workOrderDescription && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{selectedBidding.workOrderDescription}</p>
                </div>
              )}
              {selectedBidding.images && selectedBidding.images.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Attachments ({selectedBidding.images.length})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {selectedBidding.images.map((img, i) => (
                      <button key={i} onClick={() => { setLightboxImages(selectedBidding.images!); setLightboxIndex(i); }} className="block rounded-lg overflow-hidden border border-border hover:border-blue-400 transition-colors cursor-pointer">
                        <img src={img} alt={`Attachment ${i + 1}`} className="w-full h-24 object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Diagnostic Bid Form */}
          <Card className="rounded-xl border border-indigo-200 shadow-sm bg-indigo-50/30 dark:bg-indigo-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                <Stethoscope className="h-5 w-5" />
                Diagnostic Bid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-white dark:bg-indigo-950/30 border border-indigo-200 p-3 text-sm text-indigo-900 dark:text-indigo-200 flex items-start gap-2 mb-6">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  Bid the <strong>diagnostic fee</strong> for the initial service visit. After the
                  client approves this diagnostic fee, you'll be able to <strong>submit a repair quote</strong>.
                  If the client approves the repair, the final invoice will include <strong>both the diagnostic fee
                  and the repair amount</strong>. If the client declines the repair, only the diagnostic fee will be billed.
                </span>
              </div>

              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="diagnosticFee" className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Diagnostic Fee *
                    </Label>
                    <Input
                      id="diagnosticFee"
                      name="diagnosticFee"
                      type="number"
                      min="0"
                      step="0.01"
                      value={diagnosticFee}
                      onChange={(e) => setDiagnosticFee(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="69.00"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Default is ${DEFAULT_DIAGNOSTIC_FEE.toFixed(2)}. Override if your rate differs.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="estimatedDuration">Estimated Duration *</Label>
                    <Input
                      id="estimatedDuration"
                      name="estimatedDuration"
                      value={quoteForm.estimatedDuration}
                      onChange={handleQuoteFormChange}
                      placeholder="e.g., 1-2 hours"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="proposedServiceDate">Proposed Service Date *</Label>
                    <Input
                      id="proposedServiceDate"
                      name="proposedServiceDate"
                      type="date"
                      value={quoteForm.proposedServiceDate}
                      onChange={handleQuoteFormChange}
                      required
                      min={new Date().toISOString().split('T')[0]}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Date you can perform the diagnostic</p>
                  </div>

                  <div>
                    <Label htmlFor="proposedServiceTime">Proposed Service Time *</Label>
                    <Input
                      id="proposedServiceTime"
                      name="proposedServiceTime"
                      type="time"
                      value={quoteForm.proposedServiceTime}
                      onChange={handleQuoteFormChange}
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">Time you can perform the diagnostic</p>
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="notes">Additional Notes (Optional)</Label>
                    <textarea
                      id="notes"
                      name="notes"
                      value={quoteForm.notes}
                      onChange={handleQuoteFormChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Any additional information..."
                    />
                  </div>
                </div>

                <div className="border-t pt-6">
                  <div className="bg-muted p-6 rounded-lg">
                    <h3 className="font-semibold text-lg mb-4">Bid Summary</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground">Diagnostic Visit</span>
                        <span className="font-semibold">${(Number(diagnosticFee) || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xl font-bold border-t pt-2 mt-2">
                        <span>Total Bid:</span>
                        <span className="text-indigo-700">${(Number(diagnosticFee) || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-4">
                  <Button
                    type="button"
                    variant="outline"
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
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Stethoscope className="h-4 w-4 mr-2" />
                    {submitting ? 'Submitting...' : 'Submit Diagnostic Bid'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </PageContainer>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <PageContainer>
        <PageHeader
          title="Available Work Orders"
          subtitle="Submit quotes for available jobs"
          icon={ClipboardList}
          iconClassName="text-blue-600"
        />

        <StatCards
          items={[
            { label: 'Pending', value: biddingWorkOrders.length, icon: ClipboardList, color: 'blue' },
          ]}
        />

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, description, client, category, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
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
                className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                {/* Row 1: title + priority badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{bidding.workOrderTitle}</p>
                    {bidding.workOrderNumber && (
                      <p className="text-xs text-muted-foreground">WO: {bidding.workOrderNumber}</p>
                    )}
                  </div>
                  {bidding.priority && (
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold border ${getPriorityBadge(bidding.priority)}`}>
                      {bidding.priority}
                    </span>
                  )}
                </div>

                {/* Row 2: secondary info */}
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <span className="truncate">Client: {bidding.clientName}</span>
                  {bidding.locationName && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {bidding.locationName}
                      {bidding.locationAddress && ` · ${formatAddress(bidding.locationAddress)}`}
                    </span>
                  )}
                  {bidding.category && (
                    <span className="truncate">Category: {bidding.category}</span>
                  )}
                  <span className="flex items-center gap-1">
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
                      <img
                        key={idx}
                        src={image}
                        alt={`Work order ${idx + 1}`}
                        className="h-12 w-12 object-cover rounded flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => { setLightboxImages(bidding.images!); setLightboxIndex(idx); }}
                      />
                    ))}
                  </div>
                )}

                {/* Actions row — 4 buttons in a 2x2 grid */}
                <div className="border-t border-border pt-1 grid grid-cols-2 gap-2 mt-auto">
                  <Button
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    onClick={() => setViewWorkOrder(bidding)}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    View Work Order
                  </Button>
                  <Button
                    className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => {
                      setSelectedBidding(bidding);
                      setShowDirectQuoteForm(true);
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Submit Quote
                  </Button>
                  <Button
                    className="h-8 text-xs gap-1 bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => {
                      setSelectedBidding(bidding);
                      setShowQuoteForm(true);
                    }}
                  >
                    <Stethoscope className="h-3.5 w-3.5" />
                    Submit Diagnostic Request
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8 text-xs gap-1 text-red-600 border-red-300 hover:bg-red-50"
                    disabled={rejectingId === bidding.id}
                    onClick={() => handleRejectBidding(bidding)}
                  >
                    <X className="h-3.5 w-3.5" />
                    {rejectingId === bidding.id ? 'Rejecting…' : 'Reject Quote Request'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageContainer>

      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}
    </SubcontractorLayout>
  );
}
