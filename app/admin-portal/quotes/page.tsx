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
import { FileText, DollarSign, Send, Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { notifyQuoteSubmission } from '@/lib/notifications';
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

      // Notify client about quote
      if (quote.workOrderId && quote.workOrderNumber) {
        await notifyQuoteSubmission(
          quote.clientId,
          quote.workOrderId,
          quote.workOrderNumber,
          quote.subcontractorName,
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
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Quotes</h1>
            <p className="text-gray-600 mt-2">
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
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
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
        {sortedQuotes.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No quotes found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Work Order</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Subcontractor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">{quote.workOrderTitle}</div>
                      <div className="text-gray-500 text-xs mt-1">WO: {quote.workOrderNumber || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{quote.subcontractorName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{quote.clientName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">${(quote.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {quote.clientAmount ? `$${(quote.clientAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(quote.status)}`}>
                        {quote.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sortedQuotes.map((quote) => (
              <Card
                key={quote.id}
                className="hover:shadow-lg transition-shadow"
              >
                <CardHeader>
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{quote.workOrderTitle}</CardTitle>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(quote.status)}`}>
                        {quote.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      WO: {quote.workOrderNumber}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div><span className="font-semibold">From:</span> {quote.subcontractorName}</div>
                    <div><span className="font-semibold">Client:</span> {quote.clientName}</div>
                  </div>

                  {/* AI Decision Engine */}
                  <ProposalDecisionEngine
                    quote={quote}
                    allQuotes={quotes}
                    onApprove={(quote.status === 'pending' || quote.status === 'sent_to_client') ? () => { setSelectedQuote(quote); setMarkupPercent(String(quote.markupPercentage || 20)); } : undefined}
                  />

                  {/* Cost Breakdown */}
                  <div className="bg-gray-50 p-3 rounded-lg space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Labor Cost:</span>
                      <span className="font-semibold">${(quote.laborCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Material Cost:</span>
                      <span className="font-semibold">${(quote.materialCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {(quote.additionalCosts || 0) > 0 && (
                      <div className="flex justify-between">
                        <span>Additional Costs:</span>
                        <span className="font-semibold">${(quote.additionalCosts || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-gray-300">
                      <span className="font-bold">Subcontractor Total:</span>
                      <span className="font-bold text-lg">${(quote.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {quote.clientAmount && (
                      <>
                        <div className="flex justify-between text-blue-600">
                          <span>Markup ({quote.markupPercentage || 0}%):</span>
                          <span className="font-semibold">
                            ${((quote.clientAmount || 0) - (quote.totalAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-blue-600 font-bold">
                          <span>Client Amount:</span>
                          <span className="text-lg">${(quote.clientAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Line Items */}
                  {quote.lineItems && quote.lineItems.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-semibold text-sm">Line Items:</div>
                      <div className="space-y-1 text-xs">
                        {quote.lineItems.map((item, index) => (
                          <div key={index} className="flex justify-between text-gray-600">
                            <span>{item.description} ({item.quantity || 0}x)</span>
                            <span>${(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {quote.notes && (
                    <div className="text-sm">
                      <span className="font-semibold">Notes:</span>
                      <p className="text-gray-600 mt-1">{quote.notes}</p>
                    </div>
                  )}

                  {/* Action: Forward / Resend to Client with Markup */}
                  {(quote.status === 'pending' || quote.status === 'sent_to_client') && (
                    <div className="pt-4 border-t">
                      {selectedQuote?.id === quote.id ? (
                        <div className="space-y-3">
                          <Label>Markup Percentage</Label>
                          <Input
                            type="number"
                            value={markupPercent}
                            onChange={(e) => setMarkupPercent(e.target.value)}
                            placeholder="20"
                            min="0"
                            max="100"
                          />
                          <div className="text-sm text-gray-600">
                            Client will pay: ${((quote.totalAmount || 0) * (1 + parseFloat(markupPercent || '0') / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => handleApplyMarkupAndSend(quote, parseFloat(markupPercent))}
                            >
                              <Send className="h-4 w-4 mr-2" />
                              {quote.status === 'sent_to_client' ? 'Resend to Client' : 'Send to Client'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedQuote(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className={`w-full ${quote.status === 'sent_to_client' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                          onClick={() => {
                            setSelectedQuote(quote);
                            setMarkupPercent(String(quote.markupPercentage || 20));
                          }}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          {quote.status === 'sent_to_client' ? 'Resend to Client' : 'Forward to Client'}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Delete Button */}
                  <div className="pt-4 border-t">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full"
                      onClick={() => handleDeleteQuote(quote)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Quote
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Quote Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
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
                  <select
                    className="w-full border border-gray-300 rounded-md p-2"
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  >
                    <option value="">Choose a client...</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>
                        {client.fullName} ({client.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subcontractor Selection */}
                <div>
                  <Label>Select Subcontractor *</Label>
                  <select
                    className="w-full border border-gray-300 rounded-md p-2"
                    value={formData.subcontractorId}
                    onChange={(e) => setFormData({ ...formData, subcontractorId: e.target.value })}
                  >
                    <option value="">Choose a subcontractor...</option>
                    {subcontractors.map(sub => (
                      <option key={sub.id} value={sub.id}>
                        {sub.fullName} ({sub.email})
                      </option>
                    ))}
                  </select>
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
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
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
    <Suspense fallback={
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    }>
      <QuotesContent />
    </Suspense>
  );
}
