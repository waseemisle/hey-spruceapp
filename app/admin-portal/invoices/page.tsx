'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, addDoc, serverTimestamp, getDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { createInvoiceTimelineEvent } from '@/lib/timeline';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Receipt, Download, Send, CreditCard, Edit2, Save, X, Plus, Trash2, Search, Upload, Eye } from 'lucide-react';
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
  notes?: string;
  terms?: string;
  createdAt: any;
}

export default function InvoicesManagement() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'paid' | 'overdue'>('all');
  const [searchQuery, setSearchQuery] = useState('');
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
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
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
      case 'draft': return 'text-gray-600 bg-gray-50';
      case 'sent': return 'text-blue-600 bg-blue-50';
      case 'paid': return 'text-green-600 bg-green-50';
      case 'overdue': return 'text-red-600 bg-red-50';
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
            <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
            <p className="text-gray-600 mt-2">Generate and manage invoices with Stripe payment links</p>
          </div>
          <Button onClick={() => setShowUploadModal(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Invoice
          </Button>
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
                  <div key={quote.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-semibold">{quote.workOrderTitle}</div>
                      <div className="text-sm text-gray-600">
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
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
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

        {/* Invoices Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredInvoices.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No invoices found</p>
              </CardContent>
            </Card>
          ) : (
            filteredInvoices.map((invoice) => (
              <Card key={invoice.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{invoice.invoiceNumber}</CardTitle>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(invoice.status)}`}>
                        {invoice.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">{invoice.workOrderTitle}</div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div><span className="font-semibold">Client:</span> {invoice.clientName}</div>
                    <div><span className="font-semibold">Email:</span> {invoice.clientEmail}</div>
                    {invoice.subcontractorName && (
                      <div><span className="font-semibold">Subcontractor:</span> {invoice.subcontractorName}</div>
                    )}
                  </div>

                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold">Total Amount</span>
                      <span className="text-2xl font-bold text-blue-600">
                        ${invoice.totalAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Stripe Payment Link */}
                  {invoice.stripePaymentLink && (
                    <div className="bg-green-50 p-3 rounded-lg text-sm">
                      <div className="font-semibold text-green-800 mb-1">Payment Link Ready</div>
                      <a
                        href={invoice.stripePaymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs break-all"
                      >
                        {invoice.stripePaymentLink.substring(0, 50)}...
                      </a>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-2">
                    <Link href={`/admin-portal/invoices/${invoice.id}`}>
                      <Button size="sm" variant="outline" className="w-full">
                        <Eye className="h-4 w-4 mr-2" />
                        View (Timeline)
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleOpenEdit(invoice)}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Invoice
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => downloadInvoice(invoice)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>

                    {invoice.status === 'draft' && (
                      <>
                        {!invoice.stripePaymentLink && (
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => createStripePaymentLink(invoice)}
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            Create Payment Link
                          </Button>
                        )}

                        {invoice.stripePaymentLink && (
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => markAsSent(invoice.id)}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Mark as Sent
                          </Button>
                        )}
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full"
                      onClick={() => handleDeleteInvoice(invoice)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Invoice
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Edit Modal */}
        {showModal && editingId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
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
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
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
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full border border-gray-300 rounded-md p-2"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full">
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
                    <p className="text-sm text-gray-600 mt-2">
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">Delete Invoice</h2>
                <p className="text-gray-700 mb-4">
                  Are you sure you want to delete invoice <strong>"{invoiceToDelete.invoiceNumber}"</strong>?
                </p>
                <div className="bg-gray-50 p-4 rounded mb-4">
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
