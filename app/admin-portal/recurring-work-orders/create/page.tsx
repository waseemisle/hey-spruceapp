'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, getDocs, addDoc, doc, getDoc, serverTimestamp, orderBy } from 'firebase/firestore';
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
  companyId?: string;
  locationName: string;
  address: {
    street: string;
    city: string;
    state: string;
  };
}

interface Company {
  id: string;
  clientId?: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

export default function CreateRecurringWorkOrder() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvancedRecurrence, setShowAdvancedRecurrence] = useState(false);
  const [showAdvancedInvoice, setShowAdvancedInvoice] = useState(false);

  const RECURRENCE_PATTERN_OPTIONS = ['SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-MONTHLY', 'BI-WEEKLY'] as const;

  const [formData, setFormData] = useState({
    clientId: '',
  companyId: '',
    locationId: '',
    title: '',
    description: '',
    category: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    estimateBudget: '',
    recurrencePatternLabel: 'MONTHLY' as (typeof RECURRENCE_PATTERN_OPTIONS)[number],
    recurrenceType: 'monthly' as 'monthly' | 'weekly',
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: [] as number[],
    recurrenceDayOfMonth: 1,
    recurrenceMonthOfYear: 1,
    recurrenceCustomPattern: '',
    recurrenceEndDate: '',
    recurrenceMaxOccurrences: '',
    invoiceScheduleType: 'monthly' as 'monthly',
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
      companyId: doc.data().companyId,
      locationName: doc.data().locationName,
      address: doc.data().address,
    })) as Location[];
      setLocations(locationsData);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

const fetchCompanies = async () => {
  try {
    const companiesQuery = query(collection(db, 'companies'));
    const snapshot = await getDocs(companiesQuery);
    const companiesData = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      clientId: doc.data().clientId,
    })) as Company[];
    setCompanies(companiesData);
  } catch (error) {
    console.error('Error fetching companies:', error);
  }
};

const fetchCategories = async () => {
  try {
    const categoriesQuery = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const snapshot = await getDocs(categoriesQuery);
    const categoriesData = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
    })) as Category[];
    setCategories(categoriesData);
  } catch (error) {
    console.error('Error fetching categories:', error);
  }
};

  useEffect(() => {
    fetchClients();
    fetchLocations();
    fetchCompanies();
    fetchCategories();
    setLoading(false);
  }, []);

  const handleSubmit = async () => {
    if (!formData.clientId || !formData.companyId || !formData.locationId || !formData.title || !formData.description || !formData.category) {
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
      const company = companies.find(c => c.id === formData.companyId);

      if (!client || !location || !company) {
        toast.error('Invalid client, company, or location selected');
        return;
      }

      if (location.companyId && location.companyId !== company.id) {
        toast.error('Selected location does not belong to the chosen company');
        return;
      }

      // Calculate next execution date from pattern
      const now = new Date();
      const nextExecution = new Date(now);
      if (formData.recurrenceType === 'weekly') {
        nextExecution.setDate(now.getDate() + formData.recurrenceInterval * 7);
      } else {
        nextExecution.setMonth(now.getMonth() + formData.recurrenceInterval);
      }

      const recurrencePattern: RecurrencePattern = {
        type: formData.recurrenceType,
        interval: formData.recurrenceInterval,
        ...(formData.recurrenceType === 'monthly' && { dayOfMonth: formData.recurrenceDayOfMonth }),
        ...(formData.recurrenceEndDate && {
          endDate: new Date(formData.recurrenceEndDate),
        }),
        ...(formData.recurrenceMaxOccurrences && {
          maxOccurrences: parseInt(formData.recurrenceMaxOccurrences),
        }),
      } as RecurrencePattern;

      const invoiceSchedule: InvoiceSchedule = {
        type: 'monthly',
        interval: formData.invoiceScheduleInterval,
        dayOfMonth: formData.invoiceScheduleDayOfMonth,
        time: formData.invoiceTime,
        timezone: formData.timezone,
      } as InvoiceSchedule;

      const workOrderNumber = `RWO-${Date.now().toString().slice(-8).toUpperCase()}`;

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const createdByName = adminDoc.exists() ? (adminDoc.data().fullName ?? 'Admin') : 'Admin';
      const now = new Date();
      const systemInformation = {
        createdBy: {
          id: currentUser.uid,
          name: createdByName,
          role: 'admin',
          timestamp: now,
        },
      };
      const timeline = [
        {
          id: `created_${Date.now()}`,
          timestamp: now,
          type: 'created',
          userId: currentUser.uid,
          userName: createdByName,
          userRole: 'admin',
          details: `Recurring work order created by ${createdByName} via Admin Portal`,
          metadata: {
            source: 'admin_portal_ui',
            workOrderNumber,
            priority: formData.priority,
            clientName: client.fullName,
            locationName: location.locationName,
          },
        },
      ];

      const recurringWorkOrderData = {
        workOrderNumber,
        clientId: formData.clientId,
        clientName: client.fullName,
        clientEmail: client.email,
        locationId: formData.locationId,
        companyId: company.id,
        companyName: company.name,
        locationName: location.locationName,
        locationAddress: location.address && typeof location.address === 'object' 
          ? `${location.address.street || ''}, ${location.address.city || ''}, ${location.address.state || ''}`.replace(/^,\s*|,\s*$/g, '').trim()
          : (location.address || 'N/A'),
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        estimateBudget: formData.estimateBudget ? parseFloat(formData.estimateBudget) : null,
        status: 'active',
        recurrencePattern,
        recurrencePatternLabel: formData.recurrencePatternLabel,
        invoiceSchedule,
        nextExecution: nextExecution,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        createdBy: currentUser.uid,
        createdByName,
        creationSource: 'admin_portal_ui',
        systemInformation,
        timeline,
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

const handleCompanySelect = (companyId: string) => {
  setFormData((prev) => ({
    ...prev,
    companyId,
    locationId: '',
  }));
};

const handleLocationSelect = (locationId: string) => {
  setFormData((prev) => ({
    ...prev,
    locationId,
  }));
};

  const handleRecurrenceTypeChange = (type: string) => {
    setFormData({ ...formData, recurrenceType: type as any });
  };

  const handleRecurrencePatternChange = (label: (typeof RECURRENCE_PATTERN_OPTIONS)[number]) => {
    let type: 'monthly' | 'weekly' = 'monthly';
    let interval = 1;
    if (label === 'SEMIANNUALLY') { type = 'monthly'; interval = 6; }
    else if (label === 'QUARTERLY') { type = 'monthly'; interval = 3; }
    else if (label === 'MONTHLY') { type = 'monthly'; interval = 1; }
    else if (label === 'BI-MONTHLY') { type = 'monthly'; interval = 2; }
    else if (label === 'BI-WEEKLY') { type = 'weekly'; interval = 2; }
    setFormData({
      ...formData,
      recurrencePatternLabel: label,
      recurrenceType: type,
      recurrenceInterval: interval,
    });
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

  // Show all companies (companies are not filtered by client)
  const filteredCompanies = companies;

  const filteredLocations = locations.filter((location) => {
    if (formData.companyId) {
      return location.companyId === formData.companyId;
    }
    if (formData.clientId) {
      return location.clientId === formData.clientId;
    }
    return true;
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
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
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
                <Label>Company *</Label>
                <select
                  value={formData.companyId}
                  onChange={(e) => handleCompanySelect(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2"
                >
                  <option value="">Choose a company...</option>
                  {filteredCompanies.map(company => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Select Location *</Label>
                <select
                  value={formData.locationId}
                  onChange={(e) => handleLocationSelect(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2"
                  disabled={!formData.companyId}
                >
                  <option value="">Choose a location...</option>
                  {filteredLocations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.locationName}
                    </option>
                  ))}
                </select>
                {formData.companyId && filteredLocations.length === 0 && (
                  <p className="text-xs text-yellow-600 mt-1">
                    No locations found for the selected company.
                  </p>
                )}
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
                    {categories.map((category) => (
                      <option key={category.id} value={category.name}>
                        {category.name}
                      </option>
                    ))}
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
                  inputMode="decimal"
                  value={formData.estimateBudget}
                  onChange={(e) => setFormData({ ...formData, estimateBudget: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
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
                <Label>Recurrence Pattern</Label>
                <select
                  className="w-full mt-2 p-2 border rounded-md bg-white"
                  value={formData.recurrencePatternLabel}
                  onChange={(e) => handleRecurrencePatternChange(e.target.value as (typeof RECURRENCE_PATTERN_OPTIONS)[number])}
                >
                  {RECURRENCE_PATTERN_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  This work order will repeat <strong>{formData.recurrencePatternLabel}</strong>
                  {formData.recurrenceType === 'weekly' && ` (every ${formData.recurrenceInterval} week(s))`}
                  {formData.recurrenceType === 'monthly' && ` (every ${formData.recurrenceInterval} month(s))`}.
                </p>
              </div>

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
                  <p className="text-xs text-gray-500 mt-1">Day of the month when work order should be created (1-31)</p>
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
                <Label>Invoice Schedule Pattern</Label>
                <div className="text-sm text-gray-600 mt-2 p-3 bg-blue-50 rounded-md">
                  Invoices will be sent <strong>Monthly</strong>
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
                  <span className="text-sm text-gray-600">month(s)</span>
                </div>
              </div>

              <div>
                <Label>Day of Month</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={formData.invoiceScheduleDayOfMonth}
                  onChange={(e) => setFormData({ ...formData, invoiceScheduleDayOfMonth: parseInt(e.target.value) || 1 })}
                />
                <p className="text-xs text-gray-500 mt-1">Day of the month when invoice should be sent (1-31)</p>
              </div>

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
