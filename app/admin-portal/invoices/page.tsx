'use client';

import { useEffect, useState } from 'react';
import { useViewControls } from '@/contexts/view-controls-context';
import { collection, query, getDocs, doc, updateDoc, addDoc, serverTimestamp, getDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Receipt, Download, Send, CreditCard, Edit2, Save, X, Plus, Trash2, Search, Upload, Eye, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import { Quote } from '@/types';
import { toast } from 'sonner';
import { notifyClientOfInvoice } from '@/lib/notifications';

interface Invoice {
  id: string;
  invoiceNumber: string;
  quoteId?: string;
  workOrderId: string;
  workOrderTitle: string;
  workOrderDescription?: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorId?: string;
  subcontractorName?: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  totalAmount: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  dueDate: any;
  stripePaymentLink?: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  autoChargeAttempted?: boolean;
  autoChargeStatus?: 'pending' | 'succeeded' | 'failed' | 'requires_action';
  autoChargeError?: string;
  notes?: string;
  terms?: string;
  createdAt: any;
}

interface ClientBilling {
  defaultPaymentMethodId?: string;
  savedCardLast4?: string;
  savedCardBrand?: string;
  autoPayEnabled?: boolean;
}

export default function InvoicesManagement() {
  const { viewMode } = useViewControls();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clientBillingMap, setClientBillingMap] = useState<Record<string, ClientBilling>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'paid' | 'overdue'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [chargingInvoice, setChargingInvoice] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    notes: '',
    terms: '',
    status: 'draft' as Invoice['status'],
  });

  const [lineItems, setLineItems] = useState<Invoice['lineItems']>([
    { description: '', quantity: 1, unitPrice: 0, amount: 0 }
  ]);

  const fetchInvoices = async () => {
    try {
      const invoicesQuery = query(collection(db, 'invoices'));
      const snapshot = await getDocs(invoicesQuery);
      const invoicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Invoice[];
      setInvoices(invoicesData);

      // Load billing info for unique clients that have unpaid invoices
      const unpaidClientIds = [...new Set(
        invoicesData
          .filter(inv => inv.status === 'sent' || inv.status === 'overdue')
          .map(inv => inv.clientId)
      )];
      if (unpaidClientIds.length > 0) {
        const billingMap: Record<string, ClientBilling> = {};
        await Promise.all(unpaidClientIds.map(async (clientId) => {
          try {
            const clientSnap = await getDoc(doc(db, 'clients', clientId));
            if (clientSnap.exists()) {
              const d = clientSnap.data();
              billingMap[clientId] = {
                defaultPaymentMethodId: d.defaultPaymentMethodId,
                savedCardLast4: d.savedCardLast4,
                savedCardBrand: d.savedCardBrand,
                autoPayEnabled: d.autoPayEnabled,
              };
            }
          } catch {}
        }));
        setClientBillingMap(billingMap);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoCharge = async (invoice: Invoice) => {
    const billing = clientBillingMap[invoice.clientId];
    if (!billing?.defaultPaymentMethodId) {
      toast.error('This client has no saved card. Ask them to add one via their portal.');
      return;
    }
    if (!confirm(`Auto-charge $${invoice.totalAmount.toLocaleString()} from ${invoice.clientName}'s saved ${billing.savedCardBrand || 'card'} ending in ${billing.savedCardLast4}?`)) return;
    setChargingInvoice(invoice.id);
    try {
      const res = await fetch('/api/stripe/charge-saved-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, clientId: invoice.clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Charge failed');
      if (data.status === 'succeeded') {
        toast.success(`$${invoice.totalAmount.toLocaleString()} charged successfully! Invoice marked as paid.`);
      } else {
        toast.warning(`Charge requires authentication from the client (status: ${data.status}).`);
      }
      fetchInvoices();
    } catch (error: any) {
      toast.error(error.message || 'Failed to charge invoice');
    } finally {
      setChargingInvoice(null);
    }
  };

  const fetchAcceptedQuotes = async () => {
    try {
      const quotesQuery = query(collection(db, 'quotes'));
      const snapshot = await getDocs(quotesQuery);
      const acceptedQuotes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Quote))
        .filter(q => q.status === 'accepted');
      setQuotes(acceptedQuotes);
    } catch (error) {
      console.error('Error fetching quotes:', error);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchAcceptedQuotes();
  }, []);

  const generateInvoiceFromQuote = async (quote: any) => {
    try {
      setGenerating(quote.id);
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const invoiceNumber = `SPRUCE-${Date.now().toString().slice(-8).toUpperCase()}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data()?.fullName : 'Admin';
      const createdEvent = createInvoiceTimelineEvent({
        type: 'created',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: 'Invoice created from accepted quote',
        metadata: { source: 'from_quote', quoteId: quote.id, workOrderNumber: quote.workOrderNumber },
      });
      const invoiceData = {
        invoiceNumber,
        quoteId: quote.id,
        workOrderId: quote.workOrderId,
        workOrderTitle: quote.workOrderTitle,
        clientId: quote.clientId,
        clientName: quote.clientName,
        clientEmail: quote.clientEmail,
        subcontractorId: quote.subcontractorId,
        subcontractorName: quote.subcontractorName,
        status: 'draft',
        totalAmount: quote.clientAmount || quote.totalAmount,
        lineItems: quote.lineItems || [],
        discountAmount: quote.discountAmount || 0,
        dueDate: dueDate,
        notes: quote.notes || '',
        terms: 'Payment due within 30 days. Late payments may incur additional fees.',
        createdBy: currentUser.uid,
        creationSource: 'from_quote',
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

      // Validate required fields before creating invoice
      if (!invoiceData.totalAmount || invoiceData.totalAmount <= 0) {
        toast.error('Cannot create invoice: Quote amount must be greater than 0');
        setGenerating(null);
        return;
      }

      if (!quote.clientEmail) {
        toast.error('Cannot create invoice: Client email is missing');
        setGenerating(null);
        return;
      }

      const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);

      // Create Stripe payment link
      try {
        const stripeResponse = await fetch('/api/stripe/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: invoiceRef.id,
            invoiceNumber: invoiceNumber,
            amount: invoiceData.totalAmount,
            customerEmail: quote.clientEmail || invoiceData.clientEmail,
            clientName: quote.clientName || invoiceData.clientName,
            clientId: quote.clientId || invoiceData.clientId,
          }),
        });

        const stripeData = await stripeResponse.json();
        
        if (!stripeResponse.ok) {
          console.error('Stripe payment link creation failed:', stripeData);
          toast.error(`Failed to create payment link: ${stripeData.error || 'Unknown error'}`);
          // Still create invoice but mark as draft
          await updateDoc(doc(db, 'invoices', invoiceRef.id), {
            status: 'draft',
            updatedAt: serverTimestamp(),
          });
        } else if (stripeData.paymentLink) {
          const sentEvent = createInvoiceTimelineEvent({
            type: 'sent',
            userId: currentUser.uid,
            userName: adminName,
            userRole: 'admin',
            details: 'Invoice sent to client with payment link',
            metadata: { invoiceNumber },
          });
          const invSnap = await getDoc(doc(db, 'invoices', invoiceRef.id));
          const invData = invSnap.data();
          const existingTimeline = invData?.timeline || [];
          const existingSysInfo = invData?.systemInformation || {};
          await updateDoc(doc(db, 'invoices', invoiceRef.id), {
            stripePaymentLink: stripeData.paymentLink,
            stripeSessionId: stripeData.sessionId,
            status: 'sent',
            sentAt: serverTimestamp(),
            timeline: [...existingTimeline, sentEvent],
            systemInformation: {
              ...existingSysInfo,
              sentBy: {
                id: currentUser.uid,
                name: adminName,
                timestamp: Timestamp.now(),
              },
            },
            updatedAt: serverTimestamp(),
          });

          // Notify client of invoice
          await notifyClientOfInvoice(
            quote.clientId,
            invoiceRef.id,
            invoiceNumber,
            quote.workOrderNumber || quote.workOrderId || '',
            invoiceData.totalAmount
          );

          toast.success(`Invoice ${invoiceNumber} generated, payment link created, and sent to client`);
        } else {
          toast.success(`Invoice ${invoiceNumber} created successfully. Create payment link to send.`);
        }
      } catch (error: any) {
        console.error('Error creating payment link:', error);
        const errorMessage = error?.message || error?.error || 'Unknown error';
        toast.error(`Failed to create payment link: ${errorMessage}. Invoice ${invoiceNumber} created but not sent.`);
        // Still update invoice but mark as draft
        await updateDoc(doc(db, 'invoices', invoiceRef.id), {
          status: 'draft',
          updatedAt: serverTimestamp(),
        });
      }

      fetchInvoices();
      fetchAcceptedQuotes();
    } catch (error) {
      console.error('Error generating invoice:', error);
      toast.error('Failed to generate invoice');
    } finally {
      setGenerating(null);
    }
  };

  const createStripePaymentLink = async (invoice: Invoice) => {
    // Validate required fields
    if (!invoice.totalAmount || invoice.totalAmount <= 0) {
      toast.error('Cannot create payment link: Invoice amount must be greater than 0');
      return;
    }

    if (!invoice.clientEmail) {
      toast.error('Cannot create payment link: Client email is missing');
      return;
    }

    try {
      const response = await fetch('/api/stripe/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.totalAmount,
          customerEmail: invoice.clientEmail,
          clientName: invoice.clientName || 'Client',
          clientId: invoice.clientId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payment link');
      }

      const data = await response.json();
      
      if (!data.paymentLink) {
        throw new Error(data.error || 'Payment link not returned');
      }

      // Update invoice with Stripe payment link
      await updateDoc(doc(db, 'invoices', invoice.id), {
        stripePaymentLink: data.paymentLink,
        stripeSessionId: data.sessionId,
        updatedAt: serverTimestamp(),
      });

      toast.success('Stripe payment link created successfully');
      fetchInvoices();
    } catch (error: any) {
      console.error('Error creating payment link:', error);
      const errorMessage = error?.message || error?.error || 'Unknown error';
      toast.error(`Failed to create payment link: ${errorMessage}`);
    }
  };

  const downloadInvoice = (invoice: Invoice) => {
    try {
      downloadInvoicePDF({
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        workOrderName: invoice.workOrderTitle,
        vendorName: invoice.subcontractorName,
        serviceDescription: invoice.workOrderDescription,
        lineItems: invoice.lineItems,
        subtotal: invoice.totalAmount,
        discountAmount: 0,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate?.toDate?.()?.toLocaleDateString?.() || 'N/A',
        notes: invoice.notes,
        terms: invoice.terms,
      });
    } catch (error) {
      console.error('Error downloading invoice:', error);
      toast.error('Failed to download invoice');
    }
  };

  const resetForm = () => {
    setFormData({
      notes: '',
      terms: '',
      status: 'draft',
    });
    setLineItems([{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenEdit = (invoice: Invoice) => {
    setFormData({
      notes: invoice.notes || '',
      terms: invoice.terms || '',
      status: invoice.status,
    });
    setLineItems(invoice.lineItems.length > 0 ? invoice.lineItems : [{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
    setEditingId(invoice.id);
    setShowModal(true);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof Invoice['lineItems'][0], value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'quantity' || field === 'unitPrice') {
      updated[index].amount = updated[index].quantity * updated[index].unitPrice;
    }

    setLineItems(updated);
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const handleSubmit = async () => {
    if (!editingId) return;

    setSubmitting(true);

    try {
      const totalAmount = calculateTotal();

      await updateDoc(doc(db, 'invoices', editingId), {
        lineItems: lineItems.filter(item => item.description && item.amount > 0),
        totalAmount,
        notes: formData.notes,
        terms: formData.terms,
        status: formData.status,
        updatedAt: serverTimestamp(),
      });

      toast.success('Invoice updated successfully');
      resetForm();
      fetchInvoices();
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      toast.error(error.message || 'Failed to save invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const markAsSent = async (invoiceId: string) => {
    try {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) {
        toast.error('Invoice not found');
        return;
      }
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data()?.fullName : 'Admin';
      const sentEvent = createInvoiceTimelineEvent({
        type: 'sent',
        userId: currentUser.uid,
        userName: adminName,
        userRole: 'admin',
        details: 'Invoice marked as sent to client',
        metadata: { invoiceNumber: invoice.invoiceNumber },
      });
      const existingTimeline = (invoice as any).timeline || [];
      const existingSysInfo = (invoice as any).systemInformation || {};
      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'sent',
        sentAt: serverTimestamp(),
        timeline: [...existingTimeline, sentEvent],
        systemInformation: {
          ...existingSysInfo,
          sentBy: {
            id: currentUser.uid,
            name: adminName,
            timestamp: Timestamp.now(),
          },
        },
        updatedAt: serverTimestamp(),
      });

      // Notify client of invoice
      await notifyClientOfInvoice(
        invoice.clientId,
        invoiceId,
        invoice.invoiceNumber,
        invoice.workOrderTitle,
        invoice.totalAmount
      );

      toast.success('Invoice marked as sent and client notified');
      fetchInvoices();
    } catch (error) {
      console.error('Error marking invoice as sent:', error);
      toast.error('Failed to update invoice status');
    }
  };

  const handleDeleteInvoice = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setShowDeleteModal(true);
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    try {
      await deleteDoc(doc(db, 'invoices', invoiceToDelete.id));
      toast.success('Invoice deleted successfully');
      setShowDeleteModal(false);
      setInvoiceToDelete(null);
      fetchInvoices();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Failed to delete invoice');
    }
  };

  const handleUploadPdf = async () => {
    if (!selectedFile) {
      toast.error('Please select a PDF file');
      return;
    }

    setUploadingPdf(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/invoices/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process PDF');
      }

      toast.success('Invoice created successfully from uploaded PDF!');
      setShowUploadModal(false);
      setSelectedFile(null);
      fetchInvoices();
    } catch (error: any) {
      console.error('Error uploading PDF:', error);
      toast.error(error.message || 'Failed to process PDF');
    } finally {
      setUploadingPdf(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    // Filter by status
    const statusMatch = filter === 'all' || inv.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      inv.invoiceNumber.toLowerCase().includes(searchLower) ||
      inv.workOrderTitle.toLowerCase().includes(searchLower) ||
      inv.clientName.toLowerCase().includes(searchLower) ||
      inv.clientEmail.toLowerCase().includes(searchLower) ||
      (inv.subcontractorName && inv.subcontractorName.toLowerCase().includes(searchLower));

    return statusMatch && searchMatch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'text-muted-foreground bg-muted';
      case 'sent': return 'text-blue-600 bg-blue-50';
      case 'paid': return 'text-green-600 bg-green-50';
      case 'overdue': return 'text-red-600 bg-red-50';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Invoices</h1>
            <p className="text-muted-foreground mt-2">Generate and manage invoices with Stripe payment links</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin-portal/invoices/new">
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create Invoice
              </Button>
            </Link>
            <Button onClick={() => setShowUploadModal(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Invoice
            </Button>
          </div>
        </div>

        {/* Generate from Accepted Quotes */}
        {quotes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Generate Invoices from Accepted Quotes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {quotes.map(quote => (
                  <div key={quote.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <div className="font-semibold">{quote.workOrderTitle}</div>
                      <div className="text-sm text-muted-foreground">
                        {quote.clientName} - ${quote.clientAmount?.toLocaleString() || quote.totalAmount?.toLocaleString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => generateInvoiceFromQuote(quote)}
                      disabled={generating === quote.id}
                    >
                      {generating === quote.id ? 'Generating...' : 'Generate Invoice'}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices by number, title, client, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'draft', 'sent', 'paid', 'overdue'].map((filterOption) => (
            <Button
              key={filterOption}
              variant={filter === filterOption ? 'default' : 'outline'}
              onClick={() => setFilter(filterOption as typeof filter)}
              className="capitalize"
              size="sm"
            >
              {filterOption} ({invoices.filter(i => filterOption === 'all' || i.status === filterOption).length})
            </Button>
          ))}
        </div>

        {/* Invoices — list or grid based on viewMode */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-lg border border-border p-6 space-y-4 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-5 w-32 rounded bg-muted" />
                  <div className="h-6 w-16 rounded-full bg-muted" />
                </div>
                <div className="h-4 w-48 rounded bg-muted" />
                <div className="h-8 w-24 rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : filteredInvoices.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No invoices found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work Order</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {filteredInvoices.map((invoice) => {
                  const dueDate = invoice.dueDate?.toDate ? invoice.dueDate.toDate() : invoice.dueDate ? new Date(invoice.dueDate) : null;
                  return (
                    <tr key={invoice.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{invoice.invoiceNumber}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">{invoice.workOrderTitle}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{invoice.clientName}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(invoice.status)}`}>
                          {invoice.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">
                        ${invoice.totalAmount?.toLocaleString() ?? '0'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {dueDate ? dueDate.toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Link href={`/admin-portal/invoices/${invoice.id}`}>
                            <Button size="sm" variant="outline"><Eye className="h-4 w-4" /></Button>
                          </Link>
                          <Button size="sm" variant="outline" onClick={() => handleOpenEdit(invoice)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadInvoice(invoice)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDeleteInvoice(invoice)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInvoices.map((invoice) => {
              const dueDate = invoice.dueDate?.toDate ? invoice.dueDate.toDate() : invoice.dueDate ? new Date(invoice.dueDate) : null;
              const hasSavedCard = (invoice.status === 'sent' || invoice.status === 'overdue') && clientBillingMap[invoice.clientId]?.defaultPaymentMethodId;
              return (
                <div key={invoice.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                  {/* Top row: invoice number + status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{invoice.workOrderTitle}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(invoice.status)}`}>
                      {invoice.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Client + amount */}
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground truncate">{invoice.clientName}</span>
                    <span className="font-bold text-foreground shrink-0">${invoice.totalAmount?.toLocaleString() ?? '0'}</span>
                  </div>

                  {/* Due date + optional badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {dueDate && <span>Due {dueDate.toLocaleDateString()}</span>}
                    {invoice.stripePaymentLink && (
                      <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">Link ready</span>
                    )}
                    {hasSavedCard && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                        <CreditCard className="h-3 w-3" />
                        {clientBillingMap[invoice.clientId]?.savedCardBrand} ···{clientBillingMap[invoice.clientId]?.savedCardLast4}
                      </span>
                    )}
                    {invoice.autoChargeAttempted && (
                      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
                        invoice.autoChargeStatus === 'succeeded' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        invoice.autoChargeStatus === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {invoice.autoChargeStatus === 'succeeded' ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                        {invoice.autoChargeStatus}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                    <Link href={`/admin-portal/invoices/${invoice.id}`} className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs">
                        <Eye className="h-3.5 w-3.5 mr-1" />View
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => handleOpenEdit(invoice)} title="Edit">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => downloadInvoice(invoice)} title="Download PDF">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {invoice.status === 'draft' && !invoice.stripePaymentLink && (
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => createStripePaymentLink(invoice)} title="Create Payment Link">
                        <CreditCard className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {invoice.status === 'draft' && invoice.stripePaymentLink && (
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => markAsSent(invoice.id)} title="Mark as Sent">
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDeleteInvoice(invoice)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Modal */}
        {showModal && editingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-card z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Edit Invoice</h2>
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-6">
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
                              placeholder="Service description"
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
                                ${item.amount.toLocaleString()}
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
                        ${calculateTotal().toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label>Notes</Label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md p-2 min-h-[80px]"
                    placeholder="Additional notes..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

                {/* Terms */}
                <div>
                  <Label>Terms</Label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md p-2 min-h-[80px]"
                    placeholder="Payment terms..."
                    value={formData.terms}
                    onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                  />
                </div>

                {/* Status */}
                <div>
                  <Label>Status</Label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={formData.status}
                    onValueChange={(v) => setFormData({ ...formData, status: v as Invoice['status'] })}
                    options={[
                      { value: 'draft', label: 'Draft' },
                      { value: 'sent', label: 'Sent' },
                      { value: 'paid', label: 'Paid' },
                      { value: 'overdue', label: 'Overdue' },
                    ]}
                    placeholder="Status"
                    aria-label="Invoice status"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    loading={submitting} disabled={submitting}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : 'Update Invoice'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    loading={submitting} disabled={submitting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upload PDF Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg max-w-md w-full">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Upload Invoice PDF</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowUploadModal(false);
                      setSelectedFile(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <Label>Select PDF File</Label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full border border-gray-300 rounded-md p-2 mt-1"
                  />
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Selected: {selectedFile.name}
                    </p>
                  )}
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• We'll extract invoice details from the PDF</li>
                    <li>• An invoice will be created with GroundOps branding</li>
                    <li>• A Stripe payment link will be generated</li>
                    <li>• The invoice will be available in your system</li>
                  </ul>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowUploadModal(false);
                      setSelectedFile(null);
                    }}
                    disabled={uploadingPdf}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUploadPdf}
                    disabled={uploadingPdf || !selectedFile}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingPdf ? 'Processing...' : 'Upload & Process'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && invoiceToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg max-w-md w-full">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">Delete Invoice</h2>
                <p className="text-foreground mb-4">
                  Are you sure you want to delete invoice <strong>"{invoiceToDelete.invoiceNumber}"</strong>?
                </p>
                <div className="bg-muted p-4 rounded mb-4">
                  <p className="text-sm"><strong>Client:</strong> {invoiceToDelete.clientName}</p>
                  <p className="text-sm"><strong>Amount:</strong> ${invoiceToDelete.totalAmount?.toFixed(2) || '0.00'}</p>
                </div>
                <p className="text-sm text-red-600 mb-4">This action cannot be undone.</p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setInvoiceToDelete(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmDeleteInvoice}
                    className="flex-1"
                  >
                    Delete Invoice
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
