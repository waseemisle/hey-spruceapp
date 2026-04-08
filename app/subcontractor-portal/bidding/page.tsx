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
import { ClipboardList, Calendar, MapPin, DollarSign, Plus, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { formatAddress } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';

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

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export default function SubcontractorBidding() {
  const { auth, db } = useFirebaseInstance();
  const [biddingWorkOrders, setBiddingWorkOrders] = useState<BiddingWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBidding, setSelectedBidding] = useState<BiddingWorkOrder | null>(null);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [viewWorkOrder, setViewWorkOrder] = useState<BiddingWorkOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [quoteForm, setQuoteForm] = useState({
    estimatedDuration: '',
    proposedServiceDate: '',
    proposedServiceTime: '',
    notes: '',
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: 'Labor Cost', quantity: 1, unitPrice: 0, amount: 0 },
    { description: 'Material Cost', quantity: 1, unitPrice: 0, amount: 0 },
  ]);

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

  const handleQuoteFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setQuoteForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleLineItemChange = (index: number, field: keyof LineItem, value: string | number) => {
    const newLineItems = [...lineItems];
    newLineItems[index] = { ...newLineItems[index], [field]: value };

    if (field === 'quantity' || field === 'unitPrice') {
      newLineItems[index].amount = newLineItems[index].quantity * newLineItems[index].unitPrice;
    }

    setLineItems(newLineItems);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const handleSubmitQuote = async () => {
    if (!selectedBidding) return;

    if (!quoteForm.estimatedDuration || !quoteForm.proposedServiceDate || !quoteForm.proposedServiceTime) {
      toast.error('Please fill in all required fields (including service date and time)');
      return;
    }

    const validLineItems = lineItems.filter(item => item.description && item.amount > 0);
    if (validLineItems.length === 0) {
      toast.error('Please add at least one line item with a description and amount');
      return;
    }

    setSubmitting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
      if (!subDoc.exists()) return;

      const subData = subDoc.data();

      const total = calculateTotal();
      const labor = lineItems
        .filter(item => item.description.toLowerCase().includes('labor'))
        .reduce((sum, item) => sum + item.amount, 0);
      const material = lineItems
        .filter(item => item.description.toLowerCase().includes('material'))
        .reduce((sum, item) => sum + item.amount, 0);

      // Do not read client profile from subcontractor context (rules may block this).
      // Prefer any email already embedded on the bidding doc; otherwise skip client email notification.
      const clientEmail = (selectedBidding as any).clientEmail || '';

      const createdByName = subData.fullName || subData.businessName || 'Subcontractor';
      const timelineEvent = createQuoteTimelineEvent({
        type: 'created',
        userId: currentUser.uid,
        userName: createdByName,
        userRole: 'subcontractor',
        details: 'Quote submitted via bidding portal',
        metadata: { source: 'subcontractor_bidding', workOrderNumber: selectedBidding.workOrderNumber },
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
        clientEmail: clientEmail,
        laborCost: labor,
        materialCost: material,
        additionalCosts: 0,
        discountAmount: 0,
        totalAmount: total,
        originalAmount: total,
        estimatedDuration: quoteForm.estimatedDuration,
        proposedServiceDate: new Date(quoteForm.proposedServiceDate),
        proposedServiceTime: quoteForm.proposedServiceTime,
        lineItems: lineItems.filter(item => item.description && item.amount > 0),
        notes: quoteForm.notes,
        status: 'pending',
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
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await notifyQuoteSubmission(
        selectedBidding.clientId,
        selectedBidding.workOrderId,
        selectedBidding.workOrderNumber || selectedBidding.workOrderId,
        subData.fullName || subData.businessName,
        total
      );

      try {
        if (clientEmail) {
          await fetch('/api/email/send-quote-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toEmail: clientEmail,
              toName: selectedBidding.clientName,
              workOrderNumber: selectedBidding.workOrderNumber || selectedBidding.workOrderId,
              workOrderTitle: selectedBidding.workOrderTitle,
              subcontractorName: subData.fullName || subData.businessName,
              quoteAmount: total,
              proposedServiceDate: quoteForm.proposedServiceDate,
              proposedServiceTime: quoteForm.proposedServiceTime,
              portalLink: `${window.location.origin}/client-portal/quotes`,
            }),
          });
        }

        // Notify admins server-side (subcontractors can't read adminUsers collection)
        fetch('/api/email/send-quote-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      } catch (emailError) {
        console.error('Failed to send quote notification emails:', emailError);
      }

      // Best-effort downstream updates; quote creation above is the critical path.
      try {
        // Update parent work order status
        const workOrderRef = doc(db, 'workOrders', selectedBidding.workOrderId);
        const workOrderSnapshot = await getDoc(workOrderRef);
        if (workOrderSnapshot.exists()) {
          const currentStatus = workOrderSnapshot.data()?.status as string | undefined;
          const statusesEligibleForQuote = ['pending', 'approved', 'bidding'];
          const workOrderData = workOrderSnapshot.data();
          const existingTimeline = workOrderData?.timeline || [];
          const existingSysInfo = workOrderData?.systemInformation || {};

          const woTimelineEvent = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Timestamp.now(),
            type: 'quote_received',
            userId: currentUser.uid,
            userName: subData.fullName || subData.businessName,
            userRole: 'subcontractor',
            details: `Quote received from ${subData.fullName || subData.businessName} - $${total.toLocaleString()}`,
            metadata: {
              quoteId: quoteRef.id,
              amount: total,
              proposedServiceDate: quoteForm.proposedServiceDate,
              proposedServiceTime: quoteForm.proposedServiceTime,
            }
          };

          const existingQuotes = existingSysInfo.quotesReceived || [];
          const updatedSysInfo = {
            ...existingSysInfo,
            quotesReceived: [...existingQuotes, {
              quoteId: quoteRef.id,
              subcontractorId: currentUser.uid,
              subcontractorName: subData.fullName || subData.businessName,
              amount: total,
              timestamp: Timestamp.now(),
            }]
          };

          if (currentStatus === 'quotes_received') {
            await updateDoc(workOrderRef, {
              updatedAt: serverTimestamp(),
              timeline: [...existingTimeline, woTimelineEvent],
              systemInformation: updatedSysInfo,
            });
          } else if (!currentStatus || statusesEligibleForQuote.includes(currentStatus)) {
            await updateDoc(workOrderRef, {
              status: 'quotes_received',
              quoteReceivedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              timeline: [...existingTimeline, woTimelineEvent],
              systemInformation: updatedSysInfo,
            });
          }
        }
      } catch (workOrderUpdateError) {
        console.error('Quote submitted, but failed to update work order:', workOrderUpdateError);
      }

      try {
        // Mark biddingWorkOrder as quoted
        await updateDoc(doc(db, 'biddingWorkOrders', selectedBidding.id), {
          status: 'quoted',
          quotedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (biddingUpdateError) {
        console.error('Quote submitted, but failed to update biddingWorkOrder:', biddingUpdateError);
      }

      toast.success('Quote submitted successfully!');
      setShowQuoteForm(false);
      setSelectedBidding(null);
      setQuoteForm({
        estimatedDuration: '',
        proposedServiceDate: '',
        proposedServiceTime: '',
        notes: '',
      });
      setLineItems([
        { description: 'Labor Cost', quantity: 1, unitPrice: 0, amount: 0 },
        { description: 'Material Cost', quantity: 1, unitPrice: 0, amount: 0 },
      ]);
    } catch (error) {
      console.error('Error submitting quote:', error);
      toast.error('Failed to submit quote');
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
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    setSelectedBidding(viewWorkOrder);
                    setShowQuoteForm(true);
                    setViewWorkOrder(null);
                  }}
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  Submit Quote
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
              {viewWorkOrder.images && viewWorkOrder.images.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Attachments ({viewWorkOrder.images.length})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {viewWorkOrder.images.map((img, i) => (
                      <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-border hover:border-blue-400 transition-colors">
                        <img src={img} alt={`Attachment ${i + 1}`} className="w-full h-24 object-cover" />
                      </a>
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

  if (showQuoteForm && selectedBidding) {
    return (
      <SubcontractorLayout>
        <PageContainer>
          <PageHeader
            title="Submit Quote"
            subtitle={selectedBidding.workOrderNumber ? `Work Order: ${selectedBidding.workOrderNumber}` : selectedBidding.workOrderTitle}
            icon={DollarSign}
            iconClassName="text-blue-600"
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
                      <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-border hover:border-blue-400 transition-colors">
                        <img src={img} alt={`Attachment ${i + 1}`} className="w-full h-24 object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quote Form */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle>Quote Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="estimatedDuration">Estimated Duration *</Label>
                    <Input
                      id="estimatedDuration"
                      name="estimatedDuration"
                      value={quoteForm.estimatedDuration}
                      onChange={handleQuoteFormChange}
                      placeholder="e.g., 2-3 days"
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
                    <p className="text-xs text-muted-foreground mt-1">Date you can perform the work</p>
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
                    <p className="text-xs text-muted-foreground mt-1">Time you can perform the work</p>
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="notes">Additional Notes (Optional)</Label>
                    <textarea
                      id="notes"
                      name="notes"
                      value={quoteForm.notes}
                      onChange={handleQuoteFormChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Any additional information..."
                    />
                  </div>
                </div>

                <div className="border-t pt-6">
                  <div className="flex justify-between items-center mb-2">
                    <Label>Line Items *</Label>
                    <Button type="button" onClick={addLineItem} size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">At least one line item with a description and amount is required</p>

                  <div className="space-y-3">
                    {/* Column headers */}
                    <div className="grid grid-cols-12 gap-3 px-1">
                      <div className="col-span-5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</div>
                      <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Qty</div>
                      <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit Price</div>
                      <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</div>
                      <div className="col-span-1"></div>
                    </div>
                    {lineItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-5">
                          <Input
                            placeholder="e.g. Labor Cost"
                            value={item.description}
                            onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            placeholder="Qty *"
                            value={item.quantity || ''}
                            onChange={(e) => handleLineItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Unit Price *"
                            value={item.unitPrice || ''}
                            onChange={(e) => handleLineItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            value={`$${item.amount.toFixed(2)}`}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                        <div className="col-span-1">
                          {lineItems.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeLineItem(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-6">
                  <div className="bg-muted p-6 rounded-lg">
                    <h3 className="font-semibold text-lg mb-4">Quote Summary</h3>
                    <div className="space-y-2">
                      {lineItems.filter(item => item.description && item.amount > 0).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-foreground">{item.description} {item.quantity > 1 ? `(×${item.quantity})` : ''}</span>
                          <span className="font-semibold">${item.amount.toFixed(2)}</span>
                        </div>
                      ))}
                      {lineItems.filter(item => item.description && item.amount > 0).length === 0 && (
                        <p className="text-sm text-muted-foreground">Add line items above to see the summary</p>
                      )}
                      <div className="flex justify-between text-xl font-bold border-t pt-2 mt-2">
                        <span>Total:</span>
                        <span className="text-green-600">${calculateTotal().toFixed(2)}</span>
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
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {submitting ? 'Submitting...' : 'Submit Quote'}
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
                        className="h-12 w-12 object-cover rounded flex-shrink-0"
                      />
                    ))}
                  </div>
                )}

                {/* Actions row */}
                <div className="border-t border-border pt-1 flex gap-2 mt-auto">
                  <Button
                    variant="outline"
                    className="flex-1 h-8 text-xs gap-1"
                    onClick={() => setViewWorkOrder(bidding)}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    View Work Order
                  </Button>
                  <Button
                    className="flex-1 h-8 text-xs gap-1"
                    onClick={() => {
                      setSelectedBidding(bidding);
                      setShowQuoteForm(true);
                    }}
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    Submit Quote
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageContainer>
    </SubcontractorLayout>
  );
}
