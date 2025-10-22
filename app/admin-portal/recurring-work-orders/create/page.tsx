'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ArrowLeft, Save, X, Calendar, Clock, RotateCcw, 
  ChevronDown, ChevronUp, Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { RecurringWorkOrder, RecurrencePattern, InvoiceSchedule } from '@/types';

interface Client {
  id: string;
  fullName: string;
  email: string;
}

interface Location {
  id: string;
  clientId: string;
  locationName: string;
  address: {
    street: string;
    city: string;
    state: string;
  };
}

export default function CreateRecurringWorkOrder() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvancedRecurrence, setShowAdvancedRecurrence] = useState(false);
  const [showAdvancedInvoice, setShowAdvancedInvoice] = useState(false);

  const [formData, setFormData] = useState({
    clientId: '',
    locationId: '',
    title: '',
    description: '',
    category: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    estimateBudget: '',
    recurrenceType: 'weekly' as 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom',
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: [] as number[],
    recurrenceDayOfMonth: 1,
    recurrenceMonthOfYear: 1,
    recurrenceCustomPattern: '',
    recurrenceEndDate: '',
    recurrenceMaxOccurrences: '',
    invoiceScheduleType: 'weekly' as 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom',
    invoiceScheduleInterval: 1,
    invoiceScheduleDaysOfWeek: [] as number[],
    invoiceScheduleDayOfMonth: 1,
    invoiceScheduleMonthOfYear: 1,
    invoiceScheduleCustomPattern: '',
    invoiceTime: '09:00',
    timezone: 'America/New_York',
  });

  const fetchClients = async () => {
    try {
      const clientsQuery = query(collection(db, 'clients'));
      const snapshot = await getDocs(clientsQuery);
      const clientsData = snapshot.docs.map(doc => ({
        id: doc.id,
        fullName: doc.data().fullName,
        email: doc.data().email,
      })) as Client[];
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const locationsQuery = query(collection(db, 'locations'));
      const snapshot = await getDocs(locationsQuery);
      const locationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        clientId: doc.data().clientId,
        locationName: doc.data().locationName,
        address: doc.data().address,
      })) as Location[];
      setLocations(locationsData);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchLocations();
    setLoading(false);
  }, []);

  const handleSubmit = async () => {
    if (!formData.clientId || !formData.locationId || !formData.title || !formData.description || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('You must be logged in to create a recurring work order');
        return;
      }

      const client = clients.find(c => c.id === formData.clientId);
      const location = locations.find(l => l.id === formData.locationId);

      if (!client || !location) {
        toast.error('Invalid client or location selected');
        return;
      }

      // Calculate next execution date
      const now = new Date();
      let nextExecution = new Date(now);
      
      if (formData.recurrenceType === 'daily') {
        nextExecution.setDate(now.getDate() + formData.recurrenceInterval);
      } else if (formData.recurrenceType === 'weekly') {
        nextExecution.setDate(now.getDate() + (7 * formData.recurrenceInterval));
      } else if (formData.recurrenceType === 'monthly') {
        nextExecution.setMonth(now.getMonth() + formData.recurrenceInterval);
      } else if (formData.recurrenceType === 'yearly') {
        nextExecution.setFullYear(now.getFullYear() + formData.recurrenceInterval);
      }

      const recurrencePattern: RecurrencePattern = {
        type: formData.recurrenceType,
        interval: formData.recurrenceInterval,
        ...(formData.recurrenceType === 'weekly' && formData.recurrenceDaysOfWeek.length > 0 && {
          daysOfWeek: formData.recurrenceDaysOfWeek,
        }),
        ...(formData.recurrenceType === 'monthly' && {
          dayOfMonth: formData.recurrenceDayOfMonth,
        }),
        ...(formData.recurrenceType === 'yearly' && {
          monthOfYear: formData.recurrenceMonthOfYear,
          dayOfMonth: formData.recurrenceDayOfMonth,
        }),
        ...(formData.recurrenceType === 'custom' && formData.recurrenceCustomPattern && {
          customPattern: formData.recurrenceCustomPattern,
        }),
        ...(formData.recurrenceEndDate && {
          endDate: new Date(formData.recurrenceEndDate),
        }),
        ...(formData.recurrenceMaxOccurrences && {
          maxOccurrences: parseInt(formData.recurrenceMaxOccurrences),
        }),
      } as RecurrencePattern;

      const invoiceSchedule: InvoiceSchedule = {
        type: formData.invoiceScheduleType,
        interval: formData.invoiceScheduleInterval,
        ...(formData.invoiceScheduleType === 'weekly' && formData.invoiceScheduleDaysOfWeek.length > 0 && {
          daysOfWeek: formData.invoiceScheduleDaysOfWeek,
        }),
        ...(formData.invoiceScheduleType === 'monthly' && {
          dayOfMonth: formData.invoiceScheduleDayOfMonth,
        }),
        ...(formData.invoiceScheduleType === 'yearly' && {
          monthOfYear: formData.invoiceScheduleMonthOfYear,
          dayOfMonth: formData.invoiceScheduleDayOfMonth,
        }),
        ...(formData.invoiceScheduleType === 'custom' && formData.invoiceScheduleCustomPattern && {
          customPattern: formData.invoiceScheduleCustomPattern,
        }),
        time: formData.invoiceTime,
        timezone: formData.timezone,
      } as InvoiceSchedule;

      const workOrderNumber = `RWO-${Date.now().toString().slice(-8).toUpperCase()}`;

      const recurringWorkOrderData = {
        workOrderNumber,
        clientId: formData.clientId,
        clientName: client.fullName,
        clientEmail: client.email,
        locationId: formData.locationId,
        locationName: location.locationName,
        locationAddress: `${location.address.street}, ${location.address.city}, ${location.address.state}`,
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        estimateBudget: formData.estimateBudget ? parseFloat(formData.estimateBudget) : null,
        status: 'active',
        recurrencePattern,
        invoiceSchedule,
        nextExecution: nextExecution,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'recurringWorkOrders'), recurringWorkOrderData);

      toast.success('Recurring work order created successfully');
      router.push('/admin-portal/recurring-work-orders');
    } catch (error: any) {
      console.error('Error creating recurring work order:', error);
      toast.error(error.message || 'Failed to create recurring work order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecurrenceTypeChange = (type: string) => {
    setFormData({ ...formData, recurrenceType: type as any });
  };

  const handleInvoiceScheduleTypeChange = (type: string) => {
    setFormData({ ...formData, invoiceScheduleType: type as any });
  };

  const toggleDayOfWeek = (day: number) => {
    const days = formData.recurrenceDaysOfWeek;
    if (days.includes(day)) {
      setFormData({ ...formData, recurrenceDaysOfWeek: days.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, recurrenceDaysOfWeek: [...days, day] });
    }
  };

  const toggleInvoiceDayOfWeek = (day: number) => {
    const days = formData.invoiceScheduleDaysOfWeek;
    if (days.includes(day)) {
      setFormData({ ...formData, invoiceScheduleDaysOfWeek: days.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, invoiceScheduleDaysOfWeek: [...days, day] });
    }
  };

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create Recurring Work Order</h1>
            <p className="text-gray-600 mt-2">Set up a work order that repeats automatically</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Client *</Label>
                <select
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value, locationId: '' })}
                  className="w-full border border-gray-300 rounded-md p-2"
                >
                  <option value="">Choose a client...</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.fullName} ({client.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Select Location *</Label>
                <select
                  value={formData.locationId}
                  onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2"
                  disabled={!formData.clientId}
                >
                  <option value="">Choose a location...</option>
                  {locations
                    .filter(loc => loc.clientId === formData.clientId)
                    .map(location => (
                      <option key={location.id} value={location.id}>
                        {location.locationName}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <Label>Work Order Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Monthly HVAC Maintenance"
                />
              </div>

              <div>
                <Label>Description *</Label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2 min-h-[100px]"
                  placeholder="Detailed description of the recurring work..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category *</Label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2"
                  >
                    <option value="">Select category...</option>
                    <option value="HVAC">HVAC</option>
                    <option value="Plumbing">Plumbing</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Carpentry">Carpentry</option>
                    <option value="Painting">Painting</option>
                    <option value="Roofing">Roofing</option>
                    <option value="Landscaping">Landscaping</option>
                    <option value="Cleaning">Cleaning</option>
                    <option value="Appliance Repair">Appliance Repair</option>
                    <option value="General Maintenance">General Maintenance</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <Label>Priority *</Label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full border border-gray-300 rounded-md p-2"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div>
                <Label>Estimate Budget (Optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.estimateBudget}
                  onChange={(e) => setFormData({ ...formData, estimateBudget: e.target.value })}
                  placeholder="e.g., 5000"
                />
                <p className="text-xs text-gray-500 mt-1">Estimated budget per occurrence in USD</p>
              </div>
            </CardContent>
          </Card>

          {/* Recurrence Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Recurrence Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Recurrence Pattern *</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['daily', 'weekly', 'monthly', 'yearly'].map((type) => (
                    <Button
                      key={type}
                      variant={formData.recurrenceType === type ? 'default' : 'outline'}
                      onClick={() => handleRecurrenceTypeChange(type)}
                      className="capitalize"
                      size="sm"
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Repeat Every</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={formData.recurrenceInterval}
                    onChange={(e) => setFormData({ ...formData, recurrenceInterval: parseInt(e.target.value) || 1 })}
                    className="w-20"
                  />
                  <span className="text-sm text-gray-600">
                    {formData.recurrenceType === 'daily' ? 'day(s)' :
                     formData.recurrenceType === 'weekly' ? 'week(s)' :
                     formData.recurrenceType === 'monthly' ? 'month(s)' :
                     formData.recurrenceType === 'yearly' ? 'year(s)' : ''}
                  </span>
                </div>
              </div>

              {formData.recurrenceType === 'weekly' && (
                <div>
                  <Label>Days of Week</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {daysOfWeek.map((day, index) => (
                      <Button
                        key={day}
                        variant={formData.recurrenceDaysOfWeek.includes(index) ? 'default' : 'outline'}
                        onClick={() => toggleDayOfWeek(index)}
                        size="sm"
                        className="text-xs"
                      >
                        {day.slice(0, 3)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {formData.recurrenceType === 'monthly' && (
                <div>
                  <Label>Day of Month</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.recurrenceDayOfMonth}
                    onChange={(e) => setFormData({ ...formData, recurrenceDayOfMonth: parseInt(e.target.value) || 1 })}
                  />
                </div>
              )}

              {formData.recurrenceType === 'yearly' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Month</Label>
                    <select
                      value={formData.recurrenceMonthOfYear}
                      onChange={(e) => setFormData({ ...formData, recurrenceMonthOfYear: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      {['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'].map((month, index) => (
                        <option key={month} value={index + 1}>{month}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Day</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.recurrenceDayOfMonth}
                      onChange={(e) => setFormData({ ...formData, recurrenceDayOfMonth: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowAdvancedRecurrence(!showAdvancedRecurrence)}
                  className="w-full"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Advanced Recurrence Options
                  {showAdvancedRecurrence ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
                </Button>
              </div>

              {showAdvancedRecurrence && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <Label>End Date (Optional)</Label>
                    <Input
                      type="date"
                      value={formData.recurrenceEndDate}
                      onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Maximum Occurrences (Optional)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.recurrenceMaxOccurrences}
                      onChange={(e) => setFormData({ ...formData, recurrenceMaxOccurrences: e.target.value })}
                      placeholder="e.g., 12"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Invoice Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Invoice Schedule Pattern *</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['daily', 'weekly', 'monthly', 'yearly'].map((type) => (
                    <Button
                      key={type}
                      variant={formData.invoiceScheduleType === type ? 'default' : 'outline'}
                      onClick={() => handleInvoiceScheduleTypeChange(type)}
                      className="capitalize"
                      size="sm"
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Send Invoice Every</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={formData.invoiceScheduleInterval}
                    onChange={(e) => setFormData({ ...formData, invoiceScheduleInterval: parseInt(e.target.value) || 1 })}
                    className="w-20"
                  />
                  <span className="text-sm text-gray-600">
                    {formData.invoiceScheduleType === 'daily' ? 'day(s)' :
                     formData.invoiceScheduleType === 'weekly' ? 'week(s)' :
                     formData.invoiceScheduleType === 'monthly' ? 'month(s)' :
                     formData.invoiceScheduleType === 'yearly' ? 'year(s)' : ''}
                  </span>
                </div>
              </div>

              {formData.invoiceScheduleType === 'weekly' && (
                <div>
                  <Label>Days of Week</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {daysOfWeek.map((day, index) => (
                      <Button
                        key={day}
                        variant={formData.invoiceScheduleDaysOfWeek.includes(index) ? 'default' : 'outline'}
                        onClick={() => toggleInvoiceDayOfWeek(index)}
                        size="sm"
                        className="text-xs"
                      >
                        {day.slice(0, 3)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {formData.invoiceScheduleType === 'monthly' && (
                <div>
                  <Label>Day of Month</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.invoiceScheduleDayOfMonth}
                    onChange={(e) => setFormData({ ...formData, invoiceScheduleDayOfMonth: parseInt(e.target.value) || 1 })}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Time of Day</Label>
                  <Input
                    type="time"
                    value={formData.invoiceTime}
                    onChange={(e) => setFormData({ ...formData, invoiceTime: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Timezone</Label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2"
                  >
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm">
                <span className="font-semibold">Title:</span> {formData.title || 'Not specified'}
              </div>
              <div className="text-sm">
                <span className="font-semibold">Client:</span> {clients.find(c => c.id === formData.clientId)?.fullName || 'Not selected'}
              </div>
              <div className="text-sm">
                <span className="font-semibold">Recurrence:</span> Every {formData.recurrenceInterval} {formData.recurrenceType}
              </div>
              <div className="text-sm">
                <span className="font-semibold">Invoice Schedule:</span> Every {formData.invoiceScheduleInterval} {formData.invoiceScheduleType}
              </div>
              <div className="text-sm">
                <span className="font-semibold">Invoice Time:</span> {formData.invoiceTime} {formData.timezone}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3 pt-6 border-t">
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Save className="h-4 w-4 mr-2" />
            {submitting ? 'Creating...' : 'Create Recurring Work Order'}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
