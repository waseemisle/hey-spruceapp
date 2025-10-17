'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Play, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

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
  const [showCreateForm, setShowCreateForm] = useState(false);
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

        {/* Scheduled Invoices List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {scheduledInvoices.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No scheduled invoices</p>
              </CardContent>
            </Card>
          ) : (
            scheduledInvoices.map((schedule) => (
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
                    <Button size="sm" className="flex-1" onClick={() => executeNow(schedule)}>
                      <Play className="h-4 w-4 mr-2" />
                      Execute Now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleActive(schedule.id, schedule.isActive)}
                    >
                      Toggle
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
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
      </div>
    </AdminLayout>
  );
}
