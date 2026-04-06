'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, getDocs, doc, getDoc, updateDoc, serverTimestamp, orderBy, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { 
  ArrowLeft, Save, X, Calendar, Clock, RotateCcw, 
  ChevronDown, ChevronUp, Settings, AlertCircle
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

interface Subcontractor {
  id: string;
  fullName: string;
  email: string;
}

export default function EditRecurringWorkOrder({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvancedRecurrence, setShowAdvancedRecurrence] = useState(false);
  const [showAdvancedInvoice, setShowAdvancedInvoice] = useState(false);
  const [recurringWorkOrder, setRecurringWorkOrder] = useState<RecurringWorkOrder | null>(null);

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
    subcontractorId: '',
    nextExecution: '',
    recurrencePatternLabel: 'MONTHLY' as (typeof RECURRENCE_PATTERN_OPTIONS)[number],
    recurrenceType: 'monthly' as 'monthly' | 'weekly',
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: [] as number[],
    recurrenceDayOfMonth: 1,
    recurrenceMonthOfYear: 1,
    recurrenceCustomPattern: '',
    recurrenceStartDate: '',
    recurrenceEndDate: '',
    recurrenceMaxOccurrences: '',
    invoiceScheduleType: 'monthly' as 'monthly' | 'bi-monthly' | 'quarterly' | 'semiannually',
    invoiceScheduleInterval: 1,
    invoiceScheduleDaysOfWeek: [] as number[],
    invoiceScheduleDayOfMonth: 1,
    invoiceScheduleMonthOfYear: 1,
    invoiceScheduleCustomPattern: '',
    invoiceTime: '09:00',
    timezone: 'America/New_York',
  });

  const fetchRecurringWorkOrder = async () => {
    try {
      const docRef = doc(db, 'recurringWorkOrders', params.id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        const recurringWorkOrderData = {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
          nextExecution: data.nextExecution?.toDate(),
          lastExecution: data.lastExecution?.toDate(),
          lastServiced: data.lastServiced?.toDate(),
        } as RecurringWorkOrder;
        
        setRecurringWorkOrder(recurringWorkOrderData);

        // Safely convert any date value to a YYYY-MM-DD string
        const toDateStr = (v: any): string => {
          if (!v) return '';
          try {
            const d = v?.toDate ? v.toDate() : new Date(v);
            return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
          } catch { return ''; }
        };

        // Populate form with existing data
        const pattern = recurringWorkOrderData.recurrencePattern;
        const invoice = recurringWorkOrderData.invoiceSchedule;
        const storedLabel = (recurringWorkOrderData as any).recurrencePatternLabel;
        let recurrencePatternLabel: (typeof RECURRENCE_PATTERN_OPTIONS)[number] = 'MONTHLY';
        if (storedLabel && RECURRENCE_PATTERN_OPTIONS.includes(storedLabel as any)) {
          recurrencePatternLabel = storedLabel as (typeof RECURRENCE_PATTERN_OPTIONS)[number];
        } else if (pattern) {
          if (pattern.type === 'weekly' && pattern.interval === 2) recurrencePatternLabel = 'BI-WEEKLY';
          else if (pattern.type === 'monthly' && pattern.interval === 6) recurrencePatternLabel = 'SEMIANNUALLY';
          else if (pattern.type === 'monthly' && pattern.interval === 3) recurrencePatternLabel = 'QUARTERLY';
          else if (pattern.type === 'monthly' && pattern.interval === 2) recurrencePatternLabel = 'BI-MONTHLY';
          else if (pattern.type === 'monthly' && pattern.interval === 1) recurrencePatternLabel = 'MONTHLY';
        }

        setFormData({
          clientId: recurringWorkOrderData.clientId || '',
          companyId: (recurringWorkOrderData as any).companyId || '',
          locationId: recurringWorkOrderData.locationId || '',
          title: recurringWorkOrderData.title || '',
          description: recurringWorkOrderData.description || '',
          category: recurringWorkOrderData.category || '',
          priority: recurringWorkOrderData.priority || 'medium',
          estimateBudget: recurringWorkOrderData.estimateBudget?.toString() || '',
          subcontractorId: (recurringWorkOrderData as any).subcontractorId || '',
          nextExecution: toDateStr(recurringWorkOrderData.nextExecution),
          recurrencePatternLabel,
          recurrenceType: pattern?.type || 'monthly',
          recurrenceInterval: pattern?.interval ?? 1,
          recurrenceDaysOfWeek: [],
          recurrenceDayOfMonth: pattern?.dayOfMonth || 1,
          recurrenceMonthOfYear: 1,
          recurrenceCustomPattern: '',
          recurrenceStartDate: toDateStr(pattern?.startDate),
          recurrenceEndDate: toDateStr(pattern?.endDate),
          recurrenceMaxOccurrences: pattern?.maxOccurrences?.toString() || '',
          invoiceScheduleType: invoice?.type || 'monthly',
          invoiceScheduleInterval: invoice?.interval || 1,
          invoiceScheduleDaysOfWeek: [],
          invoiceScheduleDayOfMonth: invoice?.dayOfMonth || 1,
          invoiceScheduleMonthOfYear: 1,
          invoiceScheduleCustomPattern: '',
          invoiceTime: invoice?.time || '09:00',
          timezone: invoice?.timezone || 'America/New_York',
        });
      } else {
        toast.error('Recurring work order not found');
        router.push('/admin-portal/recurring-work-orders');
      }
    } catch (error) {
      console.error('Error fetching recurring work order:', error);
      toast.error('Failed to load recurring work order');
    }
  };

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

  const fetchSubcontractors = async () => {
    try {
      const subsQuery = query(
        collection(db, 'subcontractors'),
        where('status', '==', 'approved')
      );
      const snapshot = await getDocs(subsQuery);
      const subsData = snapshot.docs.map(doc => ({
        id: doc.id,
        fullName: doc.data().fullName,
        email: doc.data().email,
      })) as Subcontractor[];
      setSubcontractors(subsData);
    } catch (error) {
      console.error('Error fetching subcontractors:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        fetchClients(),
        fetchLocations(),
        fetchCompanies(),
        fetchCategories(),
        fetchSubcontractors(),
        fetchRecurringWorkOrder(),
      ]);
      setLoading(false);
    };
    loadData();
  }, [params.id]);

  const handleSubmit = async () => {
    if (!formData.clientId || !formData.companyId || !formData.locationId || !formData.title || !formData.description || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('You must be logged in to update a recurring work order');
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

      // Use the nextExecution from form if provided, otherwise calculate it
      let nextExecution: Date;
      if (formData.nextExecution) {
        nextExecution = new Date(formData.nextExecution);
      } else {
        const now = new Date();
        nextExecution = new Date(now);
        if (formData.recurrenceType === 'weekly') {
          nextExecution.setDate(now.getDate() + formData.recurrenceInterval * 7);
        } else {
          nextExecution.setMonth(now.getMonth() + formData.recurrenceInterval);
        }
      }

      const recurrencePattern: RecurrencePattern = {
        type: formData.recurrenceType,
        interval: formData.recurrenceInterval,
        ...(formData.recurrenceStartDate && {
          startDate: new Date(formData.recurrenceStartDate),
        }),
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

      const updateData: any = {
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
        recurrencePattern,
        recurrencePatternLabel: formData.recurrencePatternLabel,
        invoiceSchedule,
        nextExecution: nextExecution,
        updatedAt: serverTimestamp(),
      };

      // Add subcontractor info if selected
      if (formData.subcontractorId) {
        const subcontractor = subcontractors.find(s => s.id === formData.subcontractorId);
        if (subcontractor) {
          updateData.subcontractorId = formData.subcontractorId;
          updateData.subcontractorName = subcontractor.fullName;
        }
      } else {
        // Remove subcontractor if deselected
        updateData.subcontractorId = null;
        updateData.subcontractorName = null;
      }

      await updateDoc(doc(db, 'recurringWorkOrders', params.id), updateData);

      toast.success('Recurring work order updated successfully');
      router.push(`/admin-portal/recurring-work-orders/${params.id}`);
    } catch (error: any) {
      console.error('Error updating recurring work order:', error);
      toast.error(error.message || 'Failed to update recurring work order');
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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!recurringWorkOrder) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Recurring work order not found</p>
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
            <h1 className="text-3xl font-bold text-foreground">Edit Recurring Work Order</h1>
            <p className="text-muted-foreground mt-2">Update recurring work order settings</p>
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

              <div>
                <Label>Company *</Label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={formData.companyId}
                  onValueChange={handleCompanySelect}
                  options={[
                    { value: '', label: 'Choose a company...' },
                    ...filteredCompanies.map((company) => ({ value: company.id, label: company.name })),
                  ]}
                  placeholder="Choose a company..."
                  aria-label="Company"
                />
              </div>

              <div>
                <Label>Select Location *</Label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={formData.locationId}
                  onValueChange={handleLocationSelect}
                  options={[
                    { value: '', label: 'Choose a location...' },
                    ...filteredLocations.map((location) => ({
                      value: location.id,
                      label: location.locationName,
                    })),
                  ]}
                  placeholder="Choose a location..."
                  aria-label="Location"
                  disabled={!formData.companyId}
                />
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
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={formData.category}
                    onValueChange={(v) => setFormData({ ...formData, category: v })}
                    options={[
                      { value: '', label: 'Select category...' },
                      ...categories.map((category) => ({ value: category.name, label: category.name })),
                    ]}
                    placeholder="Select category..."
                    aria-label="Category"
                  />
                </div>

                <div>
                  <Label>Priority *</Label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={formData.priority}
                    onValueChange={(v) => setFormData({ ...formData, priority: v as typeof formData.priority })}
                    options={[
                      { value: 'low', label: 'Low' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high', label: 'High' },
                    ]}
                    placeholder="Priority"
                    aria-label="Priority"
                  />
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
                <p className="text-xs text-muted-foreground mt-1">Estimated budget per occurrence in USD</p>
              </div>

              <div>
                <Label>Assigned Subcontractor</Label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={formData.subcontractorId}
                  onValueChange={(v) => setFormData({ ...formData, subcontractorId: v })}
                  options={[
                    { value: '', label: 'Select subcontractor...' },
                    ...subcontractors.map((sub) => ({
                      value: sub.id,
                      label: `${sub.fullName} (${sub.email})`,
                    })),
                  ]}
                  placeholder="Select subcontractor..."
                  aria-label="Assigned subcontractor"
                />
                <p className="text-xs text-muted-foreground mt-1">Pre-select a subcontractor for this recurring work order</p>
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
                <SearchableSelect
                  className="mt-2 w-full"
                  value={formData.recurrencePatternLabel}
                  onValueChange={(v) =>
                    handleRecurrencePatternChange(v as (typeof RECURRENCE_PATTERN_OPTIONS)[number])
                  }
                  options={RECURRENCE_PATTERN_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                  placeholder="Recurrence pattern"
                  aria-label="Recurrence pattern"
                />
                <p className="text-xs text-muted-foreground mt-1">
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
                  <p className="text-xs text-muted-foreground mt-1">Day of the month when work order should be created (1-31)</p>
                </div>
              )}

              <div>
                <Label>Starting Date</Label>
                <Input
                  type="date"
                  value={formData.recurrenceStartDate}
                  onChange={(e) => setFormData({ ...formData, recurrenceStartDate: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">The first date occurrences will begin. Events will appear on the calendar from this date onward.</p>
              </div>

              <div>
                <Label>Ending Date</Label>
                <Input
                  type="date"
                  value={formData.recurrenceEndDate}
                  onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">The last date occurrences will run. Calendar events will be generated up to this date.</p>
              </div>

              <div>
                <Label>Next Execution Date</Label>
                <Input
                  type="date"
                  value={formData.nextExecution}
                  onChange={(e) => setFormData({ ...formData, nextExecution: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Date when the next work order will be created</p>
              </div>

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
                <div className="text-sm text-muted-foreground mt-2 p-3 bg-blue-50 rounded-md">
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
                  <span className="text-sm text-muted-foreground">month(s)</span>
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
                <p className="text-xs text-muted-foreground mt-1">Day of the month when invoice should be sent (1-31)</p>
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
                  <SearchableSelect
                    className="mt-1 w-full"
                    value={formData.timezone}
                    onValueChange={(v) => setFormData({ ...formData, timezone: v })}
                    options={[
                      { value: 'America/New_York', label: 'Eastern Time' },
                      { value: 'America/Chicago', label: 'Central Time' },
                      { value: 'America/Denver', label: 'Mountain Time' },
                      { value: 'America/Los_Angeles', label: 'Pacific Time' },
                      { value: 'UTC', label: 'UTC' },
                    ]}
                    placeholder="Timezone"
                    aria-label="Timezone"
                  />
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
                <span className="font-semibold">Recurrence:</span> {formData.recurrencePatternLabel}
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
            loading={submitting} disabled={submitting}
          >
            <Save className="h-4 w-4 mr-2" />
            {submitting ? 'Updating...' : 'Update Recurring Work Order'}
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