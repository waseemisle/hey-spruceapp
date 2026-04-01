'use client';

import { useEffect, useState, Suspense } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, addDoc, deleteDoc, getDoc, Timestamp } from 'firebase/firestore';
import { createTimelineEvent, createQuoteTimelineEvent } from '@/lib/timeline';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FileText, DollarSign, Send, Plus, Trash2, Search, UserPlus, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { notifyClientOfQuoteSent } from '@/lib/notifications';
import { useViewControls } from '@/contexts/view-controls-context';
import ProposalDecisionEngine from '@/components/proposal-decision-engine';

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Quote {
  id: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail: string;
  laborCost: number;
  materialCost: number;
  additionalCosts: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  originalAmount: number;
  clientAmount?: number;
  markupPercentage?: number;
  lineItems: LineItem[];
  notes: string;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
  createdAt: any;
}

interface Client {
  id: string;
  fullName: string;
  email: string;
  companyName?: string;
}

interface Subcontractor {
  id: string;
  fullName: string;
  email: string;
  companyName?: string;
}

function QuotesContent() {
  const searchParams = useSearchParams();
  const workOrderIdFilter = searchParams.get('workOrderId');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'sent_to_client' | 'accepted' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [markupPercent, setMarkupPercent] = useState('20');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewQuote, setViewQuote] = useState<Quote | null>(null);
  const { viewMode, sortOption } = useViewControls();

  // Create Quote Form State
  const [formData, setFormData] = useState({
    workOrderTitle: '',
    clientId: '',
    subcontractorId: '',
    notes: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, amount: 0 }
  ]);

  const fetchQuotes = async () => {
    try {
      const quotesQuery = workOrderIdFilter
        ? query(collection(db, 'quotes'), where('workOrderId', '==', workOrderIdFilter))
        : query(collection(db, 'quotes'));
      const snapshot = await getDocs(quotesQuery);
      const quotesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Quote[];
      setQuotes(quotesData);
    } catch (error) {
      console.error('Error fetching quotes:', error);
      toast.error('Failed to load quotes');
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const clientsQuery = query(collection(db, 'clients'));
      const snapshot = await getDocs(clientsQuery);
      const clientsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Client[];
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchSubcontractors = async () => {
    try {
      const subsQuery = query(collection(db, 'subcontractors'));
      const snapshot = await getDocs(subsQuery);
      const subsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Subcontractor[];
      setSubcontractors(subsData);
    } catch (error) {
      console.error('Error fetching subcontractors:', error);
    }
  };

  useEffect(() => {
    fetchQuotes();
    fetchClients();
    fetchSubcontractors();
  }, [workOrderIdFilter]);

  const handleApplyMarkupAndSend = async (quote: Quote, markup: number) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data()?.fullName : 'Admin';

      const markupDecimal = markup / 100;
      const clientAmount = quote.totalAmount * (1 + markupDecimal);
      const markupFactor = quote.totalAmount > 0 ? clientAmount / quote.totalAmount : 1;
      const clientLineItems = (quote.lineItems || []).map(item => ({
        ...item,
        unitPrice: item.unitPrice * markupFactor,
        amount: item.amount * markupFactor,
      }));
      const isResend = quote.status === 'sent_to_client';

      const existingQuoteTimeline = (quote as any).timeline || [];
      const sentEvent = createQuoteTimelineEvent({
        type: 'sent_to_client',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: isResend
          ? `Quote resent to client with ${markup}% markup ($${clientAmount.toFixed(2)})`
          : `Quote sent to client with ${markup}% markup ($${clientAmount.toFixed(2)})`,
        metadata: { quoteId: quote.id, workOrderNumber: quote.workOrderNumber },
      });
      const existingSysInfo = (quote as any).systemInformation || {};
      await updateDoc(doc(db, 'quotes', quote.id), {
        markupPercentage: markup,
        clientAmount: clientAmount,
        clientLineItems: clientLineItems,
        originalAmount: quote.totalAmount,
        status: 'sent_to_client',
        sentToClientAt: serverTimestamp(),
        sentBy: currentUser.uid,
        timeline: [...existingQuoteTimeline, sentEvent],
        systemInformation: {
          ...existingSysInfo,
          sentToClientBy: {
            id: currentUser.uid,
            name: adminName,
            timestamp: Timestamp.now(),
          },
        },
        updatedAt: serverTimestamp(),
      });

      // Add timeline event to work order
      if (quote.workOrderId) {
        const woDoc = await getDoc(doc(db, 'workOrders', quote.workOrderId));
        const woData = woDoc.data();
        const existingTimeline = woData?.timeline || [];
        const existingSysInfo = woData?.systemInformation || {};

        await updateDoc(doc(db, 'workOrders', quote.workOrderId), {
          timeline: [...existingTimeline, createTimelineEvent({
            type: 'quote_shared_with_client',
            userId: currentUser.uid,
            userName: adminName,
            userRole: 'admin',
            details: isResend
              ? `Quote from ${quote.subcontractorName} resent to client with ${markup}% markup ($${clientAmount.toFixed(2)})`
              : `Quote from ${quote.subcontractorName} sent to client with ${markup}% markup ($${clientAmount.toFixed(2)})`,
            metadata: { quoteId: quote.id, subcontractorName: quote.subcontractorName, clientAmount, markup },
          })],
          systemInformation: {
            ...existingSysInfo,
            quoteSharedWithClient: {
              quoteId: quote.id,
              by: { id: currentUser.uid, name: adminName },
              timestamp: Timestamp.now(),
            },
          },
          updatedAt: serverTimestamp(),
        });
      }

      // Notify client that their quote is ready (with markup-inclusive amount)
      if (quote.workOrderId && quote.workOrderNumber) {
        await notifyClientOfQuoteSent(
          quote.clientId,
          quote.workOrderId,
          quote.workOrderNumber,
          clientAmount
        );
      }

      toast.success(isResend ? `Quote resent to client with ${markup}% markup` : `Quote forwarded to client with ${markup}% markup`);
      setSelectedQuote(null);
      fetchQuotes();
    } catch (error) {
      console.error('Error sending quote:', error);
      toast.error('Failed to send quote to client');
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    // Calculate amount
    if (field === 'quantity' || field === 'unitPrice') {
      updated[index].amount = updated[index].quantity * updated[index].unitPrice;
    }

    setLineItems(updated);
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const resetForm = () => {
    setFormData({
      workOrderTitle: '',
      clientId: '',
      subcontractorId: '',
      notes: '',
    });
    setLineItems([{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
    setShowCreateModal(false);
  };

  const handleCreateQuote = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('You must be logged in');
        return;
      }

      if (!formData.clientId || !formData.subcontractorId || !formData.workOrderTitle) {
        toast.error('Please fill in all required fields');
        return;
      }

      const client = clients.find(c => c.id === formData.clientId);
      const subcontractor = subcontractors.find(s => s.id === formData.subcontractorId);

      if (!client || !subcontractor) {
        toast.error('Invalid client or subcontractor selected');
        return;
      }

      const totalAmount = calculateTotal();
      const quoteNumber = `QUOTE-${Date.now().toString().slice(-8).toUpperCase()}`;

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data()?.fullName : 'Admin';
      const createdEvent = createQuoteTimelineEvent({
        type: 'created',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: 'Quote created via admin portal',
        metadata: { source: 'admin_portal' },
      });
      const quoteData = {
        quoteNumber,
        workOrderTitle: formData.workOrderTitle,
        clientId: client.id,
        clientName: client.fullName,
        clientEmail: client.email,
        subcontractorId: subcontractor.id,
        subcontractorName: subcontractor.fullName,
        subcontractorEmail: subcontractor.email,
        lineItems: lineItems.filter(item => item.description && item.amount > 0),
        laborCost: 0,
        materialCost: 0,
        additionalCosts: 0,
        discountAmount: 0,
        totalAmount,
        originalAmount: totalAmount,
        notes: formData.notes,
        status: 'pending',
        createdBy: currentUser.uid,
        creationSource: 'admin_portal',
        timeline: [createdEvent],
        systemInformation: {
          createdBy: {
            id: currentUser.uid,
            name: adminName,
            role: 'admin',
            timestamp: Timestamp.now(),
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'quotes'), quoteData);

      toast.success(`Quote ${quoteNumber} created successfully!`);
      resetForm();
      fetchQuotes();
    } catch (error) {
      console.error('Error creating quote:', error);
      toast.error('Failed to create quote');
    }
  };

  const handleDeleteQuote = async (quote: Quote) => {
    // Show confirmation toast with action buttons
    toast(`Delete quote for "${quote.workOrderTitle}"?`, {
      description: `Quote Amount: $${quote.totalAmount?.toFixed(2) || '0.00'}\nSubcontractor: ${quote.subcontractorName}\n\nThis action cannot be undone.`,
      action: {
        label: 'Delete',
        onClick: async () => {
          await performDeleteQuote(quote);
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const handleAssignWorkOrderFromQuote = async (quote: Quote) => {
    if (!quote.workOrderId) {
      toast.error('Quote has no associated work order');
      return;
    }

    try {
      const workOrderRef = doc(db, 'workOrders', quote.workOrderId);
      const woSnap = await getDoc(workOrderRef);
      if (!woSnap.exists()) {
        toast.error('Work order not found');
        return;
      }

      const wo = woSnap.data();
      const timeline = wo.timeline || [];
      const systemInformation = wo.systemInformation || {};
      const currentUser = auth.currentUser;
      const adminName = currentUser ? ((await getDoc(doc(db, 'adminUsers', currentUser.uid))).data()?.fullName || 'Admin') : 'Admin';

      await updateDoc(workOrderRef, {
        status: 'assigned',
        assignedSubcontractor: quote.subcontractorId,
        assignedSubcontractorName: quote.subcontractorName,
        assignedAt: serverTimestamp(),
        approvedQuoteId: quote.id,
        approvedQuoteAmount: quote.clientAmount || quote.totalAmount,
        approvedQuoteLaborCost: quote.laborCost,
        approvedQuoteMaterialCost: quote.materialCost,
        approvedQuoteLineItems: quote.lineItems || [],
        timeline: [
          ...timeline,
          createTimelineEvent({
            type: 'quote_approved_by_client',
            userId: currentUser?.uid || 'unknown',
            userName: adminName,
            userRole: 'admin',
            details: `Work order assigned to ${quote.subcontractorName} from accepted quote.`,
            metadata: {
              quoteId: quote.id,
              subcontractorName: quote.subcontractorName,
              amount: quote.clientAmount || quote.totalAmount,
              source: 'admin_quotes_manual_assign',
            },
          }),
        ],
        systemInformation: {
          ...systemInformation,
          quoteApprovalByClient: {
            quoteId: quote.id,
            approvedBy: { id: currentUser?.uid || 'unknown', name: adminName },
            timestamp: Timestamp.now(),
          },
        },
        updatedAt: serverTimestamp(),
      });

      // Best effort for subcontractor assigned-queue
      try {
        await addDoc(collection(db, 'assignedJobs'), {
          workOrderId: quote.workOrderId,
          subcontractorId: quote.subcontractorId,
          assignedAt: serverTimestamp(),
          status: 'pending_acceptance',
        });
      } catch (e) {
        console.error('Assigned work order, but failed to create assignedJobs record:', e);
      }

      toast.success('Work order assigned to subcontractor from accepted quote');
    } catch (error) {
      console.error('Error assigning work order from quote:', error);
      toast.error('Failed to assign work order');
    }
  };

  const performDeleteQuote = async (quote: Quote) => {
    try {
      await deleteDoc(doc(db, 'quotes', quote.id));
      toast.success('Quote deleted successfully');
      fetchQuotes();
    } catch (error) {
      console.error('Error deleting quote:', error);
      toast.error('Failed to delete quote');
    }
  };

  const getTimestampValue = (value: any) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object' && value?.toDate) {
      const dateValue = value.toDate();
      return dateValue instanceof Date ? dateValue.getTime() : 0;
    }
    return 0;
  };

  const filteredQuotes = quotes.filter(quote => {
    // Filter by status
    const statusMatch = filter === 'all' || quote.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      quote.workOrderTitle.toLowerCase().includes(searchLower) ||
      quote.clientName.toLowerCase().includes(searchLower) ||
      quote.subcontractorName.toLowerCase().includes(searchLower) ||
      (quote.workOrderNumber && quote.workOrderNumber.toLowerCase().includes(searchLower)) ||
      (quote.notes && quote.notes.toLowerCase().includes(searchLower));

    return statusMatch && searchMatch;
  });

  const sortedQuotes = [...filteredQuotes].sort((a, b) => {
    switch (sortOption) {
      case 'updatedAt':
        return (
          getTimestampValue((b as any).updatedAt || b.createdAt) -
          getTimestampValue((a as any).updatedAt || a.createdAt)
        );
      case 'createdAt':
      default:
        return getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt);
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'sent_to_client': return 'text-blue-600 bg-blue-50';
      case 'accepted': return 'text-green-600 bg-green-50';
      case 'rejected': return 'text-red-600 bg-red-50';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Quotes</h1>
            <p className="text-muted-foreground mt-2">
              {workOrderIdFilter
                ? 'Showing quotes for this work order'
                : 'Review quotes from subcontractors and forward to clients'}
            </p>
            {workOrderIdFilter && (
              <a href="/admin-portal/quotes" className="text-sm text-blue-600 hover:underline mt-1 inline-block">
                View all quotes
              </a>
            )}
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Quote
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search quotes by title, client, subcontractor, or work order number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'sent_to_client', 'accepted', 'rejected'].map((filterOption) => (
            <Button
              key={filterOption}
              variant={filter === filterOption ? 'default' : 'outline'}
              onClick={() => setFilter(filterOption as typeof filter)}
              className="capitalize"
              size="sm"
            >
              {filterOption.replace('_', ' ')} ({quotes.filter(q => filterOption === 'all' || q.status === filterOption).length})
            </Button>
          ))}
        </div>

        {/* Quotes Grid/List */}
        {loading ? (
          <div className="border rounded-lg overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border animate-pulse">
                <div className="h-4 flex-1 rounded bg-gray-200" />
                <div className="h-4 w-28 rounded bg-gray-200" />
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="h-4 w-20 rounded bg-gray-200" />
                <div className="h-6 w-16 rounded-full bg-gray-200" />
              </div>
            ))}
          </div>
        ) : sortedQuotes.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No quotes found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work Order</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subcontractor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-gray-200">
                {sortedQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-muted transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-foreground">{quote.workOrderTitle}</div>
                      <div className="text-muted-foreground text-xs mt-1">WO: {quote.workOrderNumber || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{quote.subcontractorName}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{quote.clientName}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">${(quote.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {quote.clientAmount ? `$${(quote.clientAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(quote.status)}`}>
                        {quote.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewQuote(quote)}
                          title="View full quote"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {quote.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedQuote(quote);
                              setMarkupPercent('20');
                            }}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {quote.status === 'accepted' && quote.workOrderId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAssignWorkOrderFromQuote(quote)}
                            title="Assign this work order to the quote's subcontractor"
                          >
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteQuote(quote)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedQuotes.map((quote) => (
              <div key={quote.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                {/* Row 1: title + status badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{quote.workOrderTitle}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{quote.subcontractorName}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(quote.status)}`}>
                    {quote.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                </div>

                {/* Row 2: client + amount */}
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground truncate">{quote.clientName}</span>
                  <span className="text-foreground font-medium shrink-0">
                    {quote.clientAmount
                      ? `$${(quote.clientAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `$${(quote.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                </div>

                {/* Inline send panel — only shown when this quote is selected */}
                {selectedQuote?.id === quote.id && (quote.status === 'pending' || quote.status === 'sent_to_client') && (
                  <div className="space-y-2 pt-1 border-t border-border">
                    <Label className="text-xs">Markup %</Label>
                    <Input
                      type="number"
                      value={markupPercent}
                      onChange={(e) => setMarkupPercent(e.target.value)}
                      placeholder="20"
                      min="0"
                      max="100"
                      className="h-8 text-sm"
                    />
                    {quote.lineItems && quote.lineItems.length > 0 && (
                      <div className="border rounded overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted text-muted-foreground">
                              <th className="px-2 py-1 text-left">Description</th>
                              <th className="px-2 py-1 text-center">Qty</th>
                              <th className="px-2 py-1 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quote.lineItems.map((item, idx) => {
                              const factor = 1 + parseFloat(markupPercent || '0') / 100;
                              return (
                                <tr key={idx} className="border-t border-border">
                                  <td className="px-2 py-1">{item.description}</td>
                                  <td className="px-2 py-1 text-center">{item.quantity.toFixed(1)}</td>
                                  <td className="px-2 py-1 text-right font-medium">${(item.amount * factor).toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-foreground">
                      Client pays: ${((quote.totalAmount || 0) * (1 + parseFloat(markupPercent || '0') / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1 h-8 text-xs gap-1" onClick={() => handleApplyMarkupAndSend(quote, parseFloat(markupPercent))}>
                        <Send className="h-3 w-3" />
                        {quote.status === 'sent_to_client' ? 'Resend' : 'Send'}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs px-2" onClick={() => setSelectedQuote(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* AI Decision Engine */}
                <ProposalDecisionEngine
                  quote={quote}
                  allQuotes={quotes}
                  onApprove={(quote.status === 'pending' || quote.status === 'sent_to_client') ? () => { setSelectedQuote(quote); setMarkupPercent(String(quote.markupPercentage || 20)); } : undefined}
                />

                {/* Actions row */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2"
                    title="View full quote"
                    onClick={() => setViewQuote(quote)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {(quote.status === 'pending' || quote.status === 'sent_to_client') && selectedQuote?.id !== quote.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs gap-1"
                      onClick={() => { setSelectedQuote(quote); setMarkupPercent(String(quote.markupPercentage || 20)); }}
                    >
                      <Send className="h-3 w-3" />
                      {quote.status === 'sent_to_client' ? 'Resend' : 'Send to Client'}
                    </Button>
                  )}
                  {quote.status === 'accepted' && quote.workOrderId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs gap-1"
                      onClick={() => handleAssignWorkOrderFromQuote(quote)}
                      title="Assign work order to subcontractor"
                    >
                      <UserPlus className="h-3 w-3" />
                      Assign WO
                    </Button>
                  )}
                  {(quote.status === 'rejected' || (!['pending', 'sent_to_client', 'accepted'].includes(quote.status))) && (
                    <span className="flex-1" />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50"
                    title="Delete"
                    onClick={() => handleDeleteQuote(quote)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* View Quote Modal */}
        {viewQuote && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-card rounded-lg shadow-lg max-w-2xl w-full my-4">
              <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-card z-10">
                <div>
                  <h2 className="text-lg font-semibold">{viewQuote.workOrderTitle}</h2>
                  {viewQuote.workOrderNumber && <p className="text-xs text-muted-foreground">WO: {viewQuote.workOrderNumber}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${(() => {
                    switch (viewQuote.status) {
                      case 'pending': return 'text-yellow-600 bg-yellow-50';
                      case 'sent_to_client': return 'text-blue-600 bg-blue-50';
                      case 'accepted': return 'text-green-600 bg-green-50';
                      case 'rejected': return 'text-red-600 bg-red-50';
                      default: return 'text-muted-foreground bg-muted';
                    }
                  })()}`}>
                    {viewQuote.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setViewQuote(null)}><X className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* Info grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground mb-0.5">Subcontractor</p><p className="font-medium">{viewQuote.subcontractorName}</p><p className="text-xs text-muted-foreground">{viewQuote.subcontractorEmail}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">Client</p><p className="font-medium">{viewQuote.clientName}</p><p className="text-xs text-muted-foreground">{viewQuote.clientEmail}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">Subcontractor Total</p><p className="font-semibold text-base">${(viewQuote.totalAmount || 0).toFixed(2)}</p></div>
                  {viewQuote.clientAmount != null && (
                    <div><p className="text-xs text-muted-foreground mb-0.5">Client Amount {viewQuote.markupPercentage != null ? `(${viewQuote.markupPercentage}% markup)` : ''}</p><p className="font-semibold text-base text-blue-600">${viewQuote.clientAmount.toFixed(2)}</p></div>
                  )}
                </div>
                {/* Line Items */}
                {viewQuote.lineItems && viewQuote.lineItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Line Items</p>
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted text-muted-foreground text-xs uppercase">
                            <th className="px-3 py-2 text-left">Description</th>
                            <th className="px-3 py-2 text-center">Qty</th>
                            <th className="px-3 py-2 text-right">Unit Price</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewQuote.lineItems.map((item, idx) => (
                            <tr key={idx} className="border-t border-border">
                              <td className="px-3 py-2">{item.description}</td>
                              <td className="px-3 py-2 text-center">{item.quantity.toFixed(1)}</td>
                              <td className="px-3 py-2 text-right">${item.unitPrice.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-medium">${item.amount.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 text-right text-sm font-semibold">Total: ${(viewQuote.totalAmount || 0).toFixed(2)}</div>
                  </div>
                )}
                {/* Notes */}
                {viewQuote.notes && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-3">{viewQuote.notes}</p>
                  </div>
                )}
                {/* Send action */}
                {(viewQuote.status === 'pending' || viewQuote.status === 'sent_to_client') && (
                  <div className="border-t pt-4">
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      onClick={() => { setSelectedQuote(viewQuote); setMarkupPercent(String(viewQuote.markupPercentage || 20)); setViewQuote(null); }}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {viewQuote.status === 'sent_to_client' ? 'Resend to Client' : 'Send to Client'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Create Quote Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-card rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-card z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Create New Quote</h2>
                  <Button variant="outline" onClick={resetForm}>Cancel</Button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Quote Title */}
                <div>
                  <Label>Quote Title / Work Order Title *</Label>
                  <Input
                    placeholder="e.g., HVAC Service for Delilah"
                    value={formData.workOrderTitle}
                    onChange={(e) => setFormData({ ...formData, workOrderTitle: e.target.value })}
                  />
                </div>

                {/* Client Selection */}
                <div>
                  <Label>Select Client *</Label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={formData.clientId}
                    onValueChange={(v) => setFormData({ ...formData, clientId: v })}
                    options={[
                      { value: '', label: 'Choose a client...' },
                      ...clients.map((client) => ({
                        value: client.id,
                        label: `${client.fullName} (${client.email})`,
                      })),
                    ]}
                    placeholder="Choose a client..."
                    aria-label="Client"
                  />
                </div>

                {/* Subcontractor Selection */}
                <div>
                  <Label>Select Subcontractor *</Label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={formData.subcontractorId}
                    onValueChange={(v) => setFormData({ ...formData, subcontractorId: v })}
                    options={[
                      { value: '', label: 'Choose a subcontractor...' },
                      ...subcontractors.map((sub) => ({
                        value: sub.id,
                        label: `${sub.fullName} (${sub.email})`,
                      })),
                    ]}
                    placeholder="Choose a subcontractor..."
                    aria-label="Subcontractor"
                  />
                </div>

                {/* Line Items */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <Label>Line Items</Label>
                    <Button size="sm" variant="outline" onClick={addLineItem}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {lineItems.map((item, index) => (
                      <div key={index} className="border border-border rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-6">
                            <Label className="text-xs">Description</Label>
                            <Input
                              placeholder="Swamp cooler service"
                              value={item.description}
                              onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-xs">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-xs">Unit Price ($)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            />
                          </div>
                          <div className="md:col-span-2 flex items-end gap-2">
                            <div className="flex-1">
                              <Label className="text-xs">Amount</Label>
                              <div className="text-lg font-bold text-blue-600">
                                ${(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                            {lineItems.length > 1 && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => removeLineItem(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total Amount:</span>
                      <span className="text-2xl font-bold text-blue-600">
                        ${(calculateTotal() || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label>Notes (optional)</Label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md p-2 min-h-[100px]"
                    placeholder="e.g., Door gaskets are special order—pricing and labor vary by manufacturer."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={handleCreateQuote}
                    disabled={!formData.clientId || !formData.subcontractorId || !formData.workOrderTitle || calculateTotal() === 0}
                  >
                    Create Quote
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default function QuotesManagement() {
  return (
    <Suspense fallback={<AdminLayout><div /></AdminLayout>}>
      <QuotesContent />
    </Suspense>
  );
}
