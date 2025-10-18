'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Play, Trash2, ToggleLeft, ToggleRight, Edit2, Save, X, Search } from 'lucide-react';

interface ScheduledInvoice {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  title: string;
  description: string;
  amount: number;
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
  const [formData, setFormData] = useState({
    clientId: '',
    title: '',
    description: '',
    amount: '',
    frequency: 'monthly' as 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    dayOfMonth: '1',
  });

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const selectedClient = clients.find(c => c.id === formData.clientId);
      if (!selectedClient) {
        alert('Please select a client');
        return;
      }

      const nextExecution = calculateNextExecution(formData.frequency, parseInt(formData.dayOfMonth));

      await addDoc(collection(db, 'scheduled_invoices'), {
        clientId: formData.clientId,
        clientName: selectedClient.fullName,
        clientEmail: selectedClient.email,
        title: formData.title,
        description: formData.description,
        amount: parseFloat(formData.amount),
        frequency: formData.frequency,
        dayOfMonth: parseInt(formData.dayOfMonth),
        isActive: true,
        nextExecution: nextExecution,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });

      alert('Scheduled invoice created successfully');
      setShowCreateForm(false);
      setFormData({
        clientId: '',
        title: '',
        description: '',
        amount: '',
        frequency: 'monthly',
        dayOfMonth: '1',
      });
      fetchScheduledInvoices();
    } catch (error) {
      console.error('Error creating scheduled invoice:', error);
      alert('Failed to create scheduled invoice');
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
      alert('Failed to update status');
    }
  };

  const executeNow = async (schedule: ScheduledInvoice) => {
    try {
      // Create invoice
      const invoiceNumber = `SPRUCE-${Date.now().toString().slice(-8).toUpperCase()}`;
      await addDoc(collection(db, 'invoices'), {
        invoiceNumber,
        scheduledInvoiceId: schedule.id,
        clientId: schedule.clientId,
        clientName: schedule.clientName,
        clientEmail: schedule.clientEmail,
        workOrderTitle: schedule.title,
        totalAmount: schedule.amount,
        status: 'draft',
        lineItems: [{
          description: schedule.description,
          quantity: 1,
          unitPrice: schedule.amount,
          amount: schedule.amount,
        }],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: serverTimestamp(),
      });

      // Update last execution
      const nextExecution = calculateNextExecution(schedule.frequency, schedule.dayOfMonth || 1);
      await updateDoc(doc(db, 'scheduled_invoices', schedule.id), {
        lastExecution: serverTimestamp(),
        nextExecution: nextExecution,
      });

      alert('Invoice created successfully');
      fetchScheduledInvoices();
    } catch (error) {
      console.error('Error executing schedule:', error);
      alert('Failed to execute scheduled invoice');
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled invoice?')) return;

    try {
      await deleteDoc(doc(db, 'scheduled_invoices', id));
      alert('Scheduled invoice deleted');
      fetchScheduledInvoices();
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Failed to delete');
    }
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
    setEditingId(null);
    setShowEditModal(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    setSubmitting(true);

    try {
      const nextExecution = calculateNextExecution(formData.frequency, parseInt(formData.dayOfMonth));

      await updateDoc(doc(db, 'scheduled_invoices', editingId), {
        title: formData.title,
        description: formData.description,
        amount: parseFloat(formData.amount),
        frequency: formData.frequency,
        dayOfMonth: parseInt(formData.dayOfMonth),
        nextExecution: nextExecution,
        updatedAt: serverTimestamp(),
      });

      alert('Scheduled invoice updated successfully');
      resetEditForm();
      fetchScheduledInvoices();
    } catch (error) {
      console.error('Error updating scheduled invoice:', error);
      alert('Failed to update scheduled invoice');
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
                  <Label>Description</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                  />
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

        {/* Scheduled Invoices List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredScheduledInvoices.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No scheduled invoices found</p>
              </CardContent>
            </Card>
          ) : (
            filteredScheduledInvoices.map((schedule) => (
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
                    <Button size="sm" className="flex-1" onClick={() => executeNow(schedule)}>
                      <Play className="h-4 w-4 mr-2" />
                      Execute
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
            ))
          )}
        </div>

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
                    <Label>Description *</Label>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Amount ($) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      required
                    />
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
