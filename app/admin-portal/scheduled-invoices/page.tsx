'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Play, Trash2, ToggleLeft, ToggleRight, Edit2, Save, X, Search, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getInvoicePDFBase64 } from '@/lib/pdf-generator';
import { useViewControls } from '@/contexts/view-controls-context';

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface ScheduledInvoice {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  title: string;
  description: string;
  amount: number;
  lineItems?: LineItem[];
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  dayOfMonth?: number;
  isActive: boolean;
  nextExecution: any;
  lastExecution?: any;
  createdAt: any;
}

export default function ScheduledInvoicesManagement() {
  const [scheduledInvoices, setScheduledInvoices] = useState<ScheduledInvoice[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const { viewMode, sortOption } = useViewControls();
  const [formData, setFormData] = useState({
    clientId: '',
    title: '',
    description: '',
    amount: '',
    frequency: 'monthly' as 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    dayOfMonth: '1',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, amount: 0 }
  ]);

  const fetchScheduledInvoices = async () => {
    try {
      const q = query(collection(db, 'scheduled_invoices'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ScheduledInvoice[];
      setScheduledInvoices(data);
    } catch (error) {
      console.error('Error fetching scheduled invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const q = query(collection(db, 'clients'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(data.filter((c: any) => c.status === 'approved'));
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  useEffect(() => {
    fetchScheduledInvoices();
    fetchClients();
  }, []);

  const calculateNextExecution = (frequency: string, dayOfMonth: number) => {
    const now = new Date();
    const next = new Date();

    switch (frequency) {
      case 'weekly':
        next.setDate(now.getDate() + 7);
        break;
      case 'monthly':
        next.setMonth(now.getMonth() + 1);
        next.setDate(dayOfMonth);
        break;
      case 'quarterly':
        next.setMonth(now.getMonth() + 3);
        next.setDate(dayOfMonth);
        break;
      case 'yearly':
        next.setFullYear(now.getFullYear() + 1);
        next.setDate(dayOfMonth);
        break;
    }

    return next;
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const selectedClient = clients.find(c => c.id === formData.clientId);
      if (!selectedClient) {
        toast.error('Please select a client');
        return;
      }

      const totalAmount = calculateTotal();
      const nextExecution = calculateNextExecution(formData.frequency, parseInt(formData.dayOfMonth));

      await addDoc(collection(db, 'scheduled_invoices'), {
        clientId: formData.clientId,
        clientName: selectedClient.fullName,
        clientEmail: selectedClient.email,
        title: formData.title,
        description: formData.description,
        amount: totalAmount,
        lineItems: lineItems.filter(item => item.description && item.amount > 0),
        frequency: formData.frequency,
        dayOfMonth: parseInt(formData.dayOfMonth),
        isActive: true,
        nextExecution: nextExecution,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });

      toast.success('Scheduled invoice created successfully');
      setShowCreateForm(false);
      setFormData({
        clientId: '',
        title: '',
        description: '',
        amount: '',
        frequency: 'monthly',
        dayOfMonth: '1',
      });
      setLineItems([{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
      fetchScheduledInvoices();
    } catch (error) {
      console.error('Error creating scheduled invoice:', error);
      toast.error('Failed to create scheduled invoice');
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'scheduled_invoices', id), {
        isActive: !currentStatus,
        updatedAt: serverTimestamp(),
      });
      fetchScheduledInvoices();
    } catch (error) {
      console.error('Error toggling status:', error);
      toast.error('Failed to update status');
    }
  };

  const executeNow = async (schedule: ScheduledInvoice) => {
    setExecuting(schedule.id);
    try {
      // Step 1: Create invoice in database
      const invoiceNumber = `SPRUCE-${Date.now().toString().slice(-8).toUpperCase()}`;
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Use line items if available, otherwise create a single line item from description
      const invoiceLineItems = schedule.lineItems && schedule.lineItems.length > 0
        ? schedule.lineItems
        : [{
            description: schedule.description || 'Service',
            quantity: 1,
            unitPrice: schedule.amount,
            amount: schedule.amount,
          }];

      const invoiceDocRef = await addDoc(collection(db, 'invoices'), {
        invoiceNumber,
        scheduledInvoiceId: schedule.id,
        clientId: schedule.clientId,
        clientName: schedule.clientName,
        clientEmail: schedule.clientEmail,
        workOrderTitle: schedule.title,
        totalAmount: schedule.amount,
        status: 'sent',
        lineItems: invoiceLineItems,
        dueDate: dueDate,
        notes: schedule.description || '',
        createdAt: serverTimestamp(),
      });

      toast.success('Invoice created, generating payment link...');

      // Step 2: Create Stripe payment link
      let stripePaymentLink = '';
      try {
        const stripeResponse = await fetch('/api/stripe/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: invoiceDocRef.id,
            invoiceNumber: invoiceNumber,
            amount: schedule.amount,
            customerEmail: schedule.clientEmail,
            clientName: schedule.clientName,
          }),
        });

        if (stripeResponse.ok) {
          const stripeData = await stripeResponse.json();
          stripePaymentLink = stripeData.paymentLink;

          // Update invoice with payment link
          await updateDoc(doc(db, 'invoices', invoiceDocRef.id), {
            stripePaymentLink: stripeData.paymentLink,
            stripeSessionId: stripeData.sessionId,
          });

          toast.success('Payment link created, generating PDF...');
        }
      } catch (stripeError) {
        console.error('Error creating payment link:', stripeError);
        // Continue even if Stripe fails
      }

      // Step 3: Generate PDF as base64
      const pdfBase64 = getInvoicePDFBase64({
        invoiceNumber,
        clientName: schedule.clientName,
        clientEmail: schedule.clientEmail,
        workOrderName: schedule.title,
        serviceDescription: schedule.description,
        lineItems: invoiceLineItems,
        subtotal: schedule.amount,
        taxRate: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: schedule.amount,
        dueDate: dueDate.toLocaleDateString(),
        notes: schedule.description,
      });

      toast.success('PDF generated, sending email...');

      // Step 4: Send email with PDF and payment link
      try {
        const emailResponse = await fetch('/api/email/send-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: schedule.clientEmail,
            toName: schedule.clientName,
            invoiceNumber: invoiceNumber,
            workOrderTitle: schedule.title,
            totalAmount: schedule.amount,
            dueDate: dueDate.toLocaleDateString(),
            lineItems: invoiceLineItems,
            notes: schedule.description,
            stripePaymentLink: stripePaymentLink,
            pdfBase64: pdfBase64,
          }),
        });

        const emailResult = await emailResponse.json();

        if (emailResult.success) {
          toast.success('Invoice created and email sent successfully!');
        } else if (emailResult.testMode) {
          toast.info('Invoice created (Email in test mode - check console)');
        } else {
          console.error('Email failed:', emailResult.error);
          console.log('Troubleshooting:', emailResult.details);
          toast.warning('Invoice created successfully, but email notification failed. Client can view it in their portal.');
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        toast.warning('Invoice created successfully, but email notification failed. Client can view it in their portal.');
      }

      // Step 5: Update scheduled invoice execution dates
      const nextExecution = calculateNextExecution(schedule.frequency, schedule.dayOfMonth || 1);
      await updateDoc(doc(db, 'scheduled_invoices', schedule.id), {
        lastExecution: serverTimestamp(),
        nextExecution: nextExecution,
      });

      fetchScheduledInvoices();
    } catch (error) {
      console.error('Error executing schedule:', error);
      toast.error('Failed to execute scheduled invoice');
    } finally {
      setExecuting(null);
    }
  };

  const deleteSchedule = async (id: string) => {
    toast('Delete this scheduled invoice?', {
      description: 'This action cannot be undone.',
      action: {
        label: 'Delete',
        onClick: async () => {
          await performDeleteSchedule(id);
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const performDeleteSchedule = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'scheduled_invoices', id));
      toast.success('Scheduled invoice deleted');
      fetchScheduledInvoices();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete');
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

  const handleOpenEdit = (schedule: ScheduledInvoice) => {
    setFormData({
      clientId: schedule.clientId,
      title: schedule.title,
      description: schedule.description,
      amount: schedule.amount.toString(),
      frequency: schedule.frequency,
      dayOfMonth: schedule.dayOfMonth?.toString() || '1',
    });
    // Load line items if available, otherwise create default
    if (schedule.lineItems && schedule.lineItems.length > 0) {
      setLineItems(schedule.lineItems);
    } else {
      setLineItems([{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
    }
    setEditingId(schedule.id);
    setShowEditModal(true);
  };

  const resetEditForm = () => {
    setFormData({
      clientId: '',
      title: '',
      description: '',
      amount: '',
      frequency: 'monthly',
      dayOfMonth: '1',
    });
    setLineItems([{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
    setEditingId(null);
    setShowEditModal(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    setSubmitting(true);

    try {
      const totalAmount = calculateTotal();
      const nextExecution = calculateNextExecution(formData.frequency, parseInt(formData.dayOfMonth));

      await updateDoc(doc(db, 'scheduled_invoices', editingId), {
        title: formData.title,
        description: formData.description,
        amount: totalAmount,
        lineItems: lineItems.filter(item => item.description && item.amount > 0),
        frequency: formData.frequency,
        dayOfMonth: parseInt(formData.dayOfMonth),
        nextExecution: nextExecution,
        updatedAt: serverTimestamp(),
      });

      toast.success('Scheduled invoice updated successfully');
      resetEditForm();
      fetchScheduledInvoices();
    } catch (error) {
      console.error('Error updating scheduled invoice:', error);
      toast.error('Failed to update scheduled invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredScheduledInvoices = scheduledInvoices.filter(schedule => {
    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      schedule.title.toLowerCase().includes(searchLower) ||
      schedule.clientName.toLowerCase().includes(searchLower) ||
      schedule.description.toLowerCase().includes(searchLower) ||
      schedule.frequency.toLowerCase().includes(searchLower);

    return searchMatch;
  });

  const sortedScheduledInvoices = [...filteredScheduledInvoices].sort((a, b) => {
    switch (sortOption) {
      case 'updatedAt':
        return (
          getTimestampValue((b as any).updatedAt || b.lastExecution || b.createdAt) -
          getTimestampValue((a as any).updatedAt || a.lastExecution || a.createdAt)
        );
      case 'createdAt':
      default:
        return getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt);
    }
  });

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
            <h1 className="text-3xl font-bold text-gray-900">Scheduled Invoices</h1>
            <p className="text-gray-600 mt-2">Manage recurring invoice schedules</p>
          </div>
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : 'Create New Schedule'}
          </Button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <Card>
            <CardHeader>
              <CardTitle>Create Scheduled Invoice</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label>Client</Label>
                  <select
                    className="w-full mt-1 p-2 border rounded"
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    required
                  >
                    <option value="">Select Client</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.fullName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Title</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Description / Notes</Label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md p-2 min-h-[80px]"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="General description or notes about this recurring invoice..."
                  />
                </div>

                {/* Line Items */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <Label>Line Items</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addLineItem}>
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
                                type="button"
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
                <div>
                  <Label>Frequency</Label>
                  <select
                    className="w-full mt-1 p-2 border rounded"
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                {formData.frequency !== 'weekly' && (
                  <div>
                    <Label>Day of Month (1-31)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.dayOfMonth}
                      onChange={(e) => setFormData({ ...formData, dayOfMonth: e.target.value })}
                    />
                  </div>
                )}
                <Button type="submit" className="w-full">Create Schedule</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search scheduled invoices by title, client, description, or frequency..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Scheduled Invoices Grid/List */}
        {sortedScheduledInvoices.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No scheduled invoices found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Frequency</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Next Execution</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedScheduledInvoices.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">{schedule.title}</div>
                      {schedule.description && (
                        <div className="text-gray-500 text-xs mt-1 line-clamp-1">{schedule.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{schedule.clientName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">${schedule.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{schedule.frequency}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        schedule.isActive ? 'text-green-600 bg-green-50' : 'text-gray-600 bg-gray-50'
                      }`}>
                        {schedule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {schedule.nextExecution?.toDate?.()?.toLocaleDateString() || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleOpenEdit(schedule)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => executeNow(schedule)}
                          disabled={executing === schedule.id}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleActive(schedule.id, schedule.isActive)}
                        >
                          {schedule.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteSchedule(schedule.id)}
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
            {sortedScheduledInvoices.map((schedule) => (
              <Card key={schedule.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{schedule.title}</CardTitle>
                    {schedule.isActive ? (
                      <ToggleRight className="h-6 w-6 text-green-600" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1 text-sm">
                    <div><span className="font-semibold">Client:</span> {schedule.clientName}</div>
                    <div><span className="font-semibold">Amount:</span> ${schedule.amount.toLocaleString()}</div>
                    <div><span className="font-semibold">Frequency:</span> {schedule.frequency}</div>
                    <div><span className="font-semibold">Status:</span> {schedule.isActive ? 'Active' : 'Inactive'}</div>
                    {schedule.nextExecution && (
                      <div>
                        <span className="font-semibold">Next:</span>{' '}
                        {schedule.nextExecution.toDate?.()?.toLocaleDateString?.() || 'N/A'}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleOpenEdit(schedule)}>
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => executeNow(schedule)}
                      disabled={executing === schedule.id}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {executing === schedule.id ? 'Executing...' : 'Execute'}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => toggleActive(schedule.id, schedule.isActive)}
                    >
                      Toggle
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => deleteSchedule(schedule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && editingId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Edit Scheduled Invoice</h2>
                  <Button variant="outline" size="sm" onClick={resetEditForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6">
                <form onSubmit={handleUpdate} className="space-y-4">
                  <div>
                    <Label>Title *</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Description / Notes</Label>
                    <textarea
                      className="w-full border border-gray-300 rounded-md p-2 min-h-[80px]"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="General description or notes about this recurring invoice..."
                    />
                  </div>

                  {/* Line Items */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <Label>Line Items *</Label>
                      <Button type="button" size="sm" variant="outline" onClick={addLineItem}>
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
                                  type="button"
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
                  <div>
                    <Label>Frequency *</Label>
                    <select
                      className="w-full mt-1 p-2 border rounded"
                      value={formData.frequency}
                      onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  {formData.frequency !== 'weekly' && (
                    <div>
                      <Label>Day of Month (1-31)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.dayOfMonth}
                        onChange={(e) => setFormData({ ...formData, dayOfMonth: e.target.value })}
                      />
                    </div>
                  )}
                  <div className="flex gap-3 pt-4 border-t">
                    <Button type="submit" className="flex-1" disabled={submitting}>
                      <Save className="h-4 w-4 mr-2" />
                      {submitting ? 'Saving...' : 'Update Schedule'}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetEditForm} disabled={submitting}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
