'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, addDoc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Receipt, Download, Send, CreditCard, Edit2, Save, X, Plus, Trash2, Search } from 'lucide-react';
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
        taxRate: quote.taxRate || 0,
        taxAmount: quote.taxAmount || 0,
        discountAmount: quote.discountAmount || 0,
        dueDate: dueDate,
        notes: quote.notes || '',
        terms: 'Payment due within 30 days. Late payments may incur additional fees.',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

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
            customerEmail: quote.clientEmail,
            clientName: quote.clientName,
          }),
        });

        const stripeData = await stripeResponse.json();
        if (stripeData.paymentLink) {
          await updateDoc(doc(db, 'invoices', invoiceRef.id), {
            stripePaymentLink: stripeData.paymentLink,
            stripeSessionId: stripeData.sessionId,
            status: 'sent',
            sentAt: serverTimestamp(),
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
      } catch (error) {
        console.error('Error creating payment link:', error);
        toast.success(`Invoice ${invoiceNumber} created successfully. Create payment link to send.`);
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
    try {
      const response = await fetch('/api/stripe/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.totalAmount,
          customerEmail: invoice.clientEmail,
          clientName: invoice.clientName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create payment link');
      }

      const data = await response.json();

      // Update invoice with Stripe payment link
      await updateDoc(doc(db, 'invoices', invoice.id), {
        stripePaymentLink: data.paymentLink,
        stripeSessionId: data.sessionId,
        updatedAt: serverTimestamp(),
      });

      toast.success('Stripe payment link created successfully');
      fetchInvoices();
    } catch (error) {
      console.error('Error creating payment link:', error);
      toast.error('Failed to create Stripe payment link');
    }
  };

  const downloadInvoice = (invoice: Invoice) => {
    try {
      downloadInvoicePDF({
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        lineItems: invoice.lineItems,
        subtotal: invoice.totalAmount,
        taxRate: 0,
        taxAmount: 0,
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

      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'sent',
        sentAt: serverTimestamp(),
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
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

                  <div className="bg-purple-50 p-3 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold">Total Amount</span>
                      <span className="text-2xl font-bold text-purple-600">
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
                              <div className="text-lg font-bold text-purple-600">
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
                  <div className="mt-4 p-4 bg-purple-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total Amount:</span>
                      <span className="text-2xl font-bold text-purple-600">
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
                    disabled={submitting}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : 'Update Invoice'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    disabled={submitting}
                  >
                    Cancel
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
