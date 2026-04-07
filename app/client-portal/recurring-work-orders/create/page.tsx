'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, getDocs, addDoc, doc, getDoc, serverTimestamp, orderBy, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ArrowLeft, Save, RotateCcw, Calendar } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { RecurrencePattern, InvoiceSchedule } from '@/types';

interface Location {
  id: string;
  name?: string;
  locationName?: string;
  companyId?: string;
  address?: any;
}

interface Category {
  id: string;
  name: string;
}

const RECURRENCE_PATTERN_OPTIONS = ['DAILY', 'SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-MONTHLY', 'BI-WEEKLY'] as const;

export default function ClientCreateRecurringWorkOrder() {
  const { auth, db } = useFirebaseInstance();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');

  const [formData, setFormData] = useState({
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
    recurrenceDaysOfMonth: [] as number[],
    recurrenceStartDate: '',
    invoiceScheduleType: 'monthly' as 'monthly' | 'bi-monthly' | 'quarterly' | 'semiannually',
    invoiceScheduleDayOfMonth: 1,
    invoiceScheduleSecondDayOfMonth: 15,
    invoiceTime: '09:00',
    timezone: 'America/New_York',
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/portal-login'); return; }

      try {
        const clientDoc = await getDoc(doc(db, 'clients', user.uid));
        if (!clientDoc.exists() || clientDoc.data().status !== 'approved') {
          router.push('/portal-login');
          return;
        }

        const clientData = clientDoc.data();
        const permissions = clientData.permissions || {};
        if (!permissions.createRecurringWorkOrders) {
          router.push('/client-portal/recurring-work-orders');
          return;
        }

        setClientId(user.uid);
        setClientName(clientData.fullName || '');
        setClientEmail(clientData.email || '');

        const cId = clientData.companyId || '';
        setCompanyId(cId);

        if (cId) {
          const companyDoc = await getDoc(doc(db, 'companies', cId));
          if (companyDoc.exists()) {
            setCompanyName(companyDoc.data().name || '');
          }
        }

        // Load categories and locations in parallel
        const [categoriesSnap, locationsSnap] = await Promise.all([
          getDocs(query(collection(db, 'categories'), orderBy('name', 'asc'))),
          cId
            ? getDocs(query(collection(db, 'locations'), where('companyId', '==', cId)))
            : getDocs(query(collection(db, 'locations'), where('clientId', '==', user.uid))),
        ]);

        setCategories(categoriesSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
        const locs = locationsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Location[];
        setLocations(locs);

        if (locs.length === 1) {
          setFormData(prev => ({ ...prev, locationId: locs[0].id }));
        }
      } catch (error: any) {
        console.error('Error loading data', error);
        toast.error('Failed to load form data');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db, router]);

  const handleRecurrencePatternChange = (label: (typeof RECURRENCE_PATTERN_OPTIONS)[number]) => {
    let type: 'monthly' | 'weekly' = 'monthly';
    let interval = 1;
    let invoiceScheduleType = formData.invoiceScheduleType;
    if (label === 'DAILY') { type = 'weekly'; interval = 1; }
    else if (label === 'SEMIANNUALLY') { type = 'monthly'; interval = 6; invoiceScheduleType = 'semiannually'; }
    else if (label === 'QUARTERLY') { type = 'monthly'; interval = 3; invoiceScheduleType = 'quarterly'; }
    else if (label === 'MONTHLY') { type = 'monthly'; interval = 1; invoiceScheduleType = 'monthly'; }
    else if (label === 'BI-MONTHLY') { type = 'monthly'; interval = 1; }
    else if (label === 'BI-WEEKLY') { type = 'weekly'; interval = 1; }
    setFormData(prev => ({
      ...prev,
      recurrencePatternLabel: label,
      recurrenceType: type,
      recurrenceInterval: interval,
      recurrenceDaysOfWeek: (label === 'DAILY' || label === 'BI-WEEKLY') ? prev.recurrenceDaysOfWeek : [],
      recurrenceDaysOfMonth: ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label) ? prev.recurrenceDaysOfMonth : [],
      invoiceScheduleType,
    }));
  };

  const toggleDayOfWeek = (day: number) => {
    const days = formData.recurrenceDaysOfWeek;
    setFormData(prev => ({
      ...prev,
      recurrenceDaysOfWeek: days.includes(day)
        ? days.filter(d => d !== day)
        : [...days, day].sort((a, b) => a - b),
    }));
  };

  const toggleDayOfMonth = (day: number) => {
    const days = formData.recurrenceDaysOfMonth;
    setFormData(prev => ({
      ...prev,
      recurrenceDaysOfMonth: days.includes(day)
        ? days.filter(d => d !== day)
        : [...days, day].sort((a, b) => a - b),
    }));
  };

  const needsDayOfMonthPicker = ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(formData.recurrencePatternLabel);
  const isBiMonthly = formData.recurrencePatternLabel === 'BI-MONTHLY';

  const handleSubmit = async () => {
    if (!formData.locationId || !formData.title || !formData.description || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (formData.recurrencePatternLabel === 'DAILY' && formData.recurrenceDaysOfWeek.length === 0) {
      toast.error('Please select at least one day for the daily recurrence');
      return;
    }
    if (formData.recurrencePatternLabel === 'BI-WEEKLY' && formData.recurrenceDaysOfWeek.length !== 2) {
      toast.error('Please select exactly 2 days for the bi-weekly (twice a week) recurrence');
      return;
    }
    if (formData.recurrencePatternLabel === 'BI-MONTHLY' && formData.recurrenceDaysOfMonth.length !== 2) {
      toast.error('Please select exactly 2 days of the month for the bi-monthly (twice a month) recurrence');
      return;
    }
    if (['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(formData.recurrencePatternLabel) && formData.recurrenceDaysOfMonth.length !== 1) {
      toast.error('Please select a day of the month for the recurrence');
      return;
    }
    if (!formData.recurrenceStartDate) {
      toast.error('Please select a starting date');
      return;
    }

    setSubmitting(true);
    try {
      const location = locations.find(l => l.id === formData.locationId);
      if (!location) { toast.error('Invalid location selected'); return; }

      const locationName = location.name || location.locationName || '';
      const locationAddress = location.address && typeof location.address === 'object'
        ? `${location.address.street || ''}, ${location.address.city || ''}, ${location.address.state || ''}`.replace(/^,\s*|,\s*$/g, '').trim()
        : (location.address || 'N/A');

      const now = new Date();
      const startDate = new Date(formData.recurrenceStartDate);
      startDate.setHours(9, 0, 0, 0);

      let nextExecution: Date = startDate;
      if ((formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY') && formData.recurrenceDaysOfWeek.length > 0) {
        let candidate = new Date(startDate);
        for (let i = 0; i < 7; i++) {
          if (formData.recurrenceDaysOfWeek.includes(candidate.getDay())) {
            nextExecution = candidate;
            break;
          }
          candidate = new Date(candidate);
          candidate.setDate(candidate.getDate() + 1);
        }
      } else if (needsDayOfMonthPicker && formData.recurrenceDaysOfMonth.length > 0) {
        const sorted = [...formData.recurrenceDaysOfMonth].sort((a, b) => a - b);
        let found = false;
        for (const dom of sorted) {
          const lastDay = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
          const actualDay = Math.min(dom, lastDay);
          if (actualDay >= startDate.getDate()) {
            nextExecution = new Date(startDate.getFullYear(), startDate.getMonth(), actualDay, 9, 0, 0);
            found = true;
            break;
          }
        }
        if (!found) {
          const monthInterval = formData.recurrencePatternLabel === 'QUARTERLY' ? 3
            : formData.recurrencePatternLabel === 'SEMIANNUALLY' ? 6 : 1;
          const nextMonth = new Date(startDate);
          nextMonth.setMonth(nextMonth.getMonth() + monthInterval);
          const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
          nextExecution = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(sorted[0], lastDay), 9, 0, 0);
        }
      }

      const recurrencePattern: RecurrencePattern = {
        type: formData.recurrenceType,
        interval: formData.recurrenceInterval,
        ...((formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY') && { daysOfWeek: formData.recurrenceDaysOfWeek }),
        ...(needsDayOfMonthPicker && formData.recurrenceDaysOfMonth.length > 0 && {
          daysOfMonth: formData.recurrenceDaysOfMonth,
          dayOfMonth: formData.recurrenceDaysOfMonth[0],
        }),
        startDate,
      } as RecurrencePattern;

      const invoiceSchedule: InvoiceSchedule = {
        type: formData.invoiceScheduleType,
        interval: formData.invoiceScheduleType === 'bi-monthly' ? 1
          : formData.invoiceScheduleType === 'quarterly' ? 3
          : formData.invoiceScheduleType === 'semiannually' ? 6
          : 1,
        dayOfMonth: formData.invoiceScheduleDayOfMonth,
        ...(formData.invoiceScheduleType === 'bi-monthly' && {
          secondDayOfMonth: formData.invoiceScheduleSecondDayOfMonth,
        }),
        time: formData.invoiceTime,
        timezone: formData.timezone,
      } as InvoiceSchedule;

      const workOrderNumber = `RWO-${Date.now().toString().slice(-8).toUpperCase()}`;
      const timeline = [
        {
          id: `created_${Date.now()}`,
          timestamp: now,
          type: 'created',
          userId: clientId,
          userName: clientName,
          userRole: 'client',
          details: `Recurring work order created by ${clientName} via Client Portal`,
          metadata: { source: 'client_portal_ui', workOrderNumber, priority: formData.priority, locationName },
        },
      ];

      await addDoc(collection(db, 'recurringWorkOrders'), {
        workOrderNumber,
        clientId,
        clientName,
        clientEmail,
        locationId: formData.locationId,
        companyId,
        companyName,
        locationName,
        locationAddress,
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        estimateBudget: formData.estimateBudget ? parseFloat(formData.estimateBudget) : null,
        status: 'active',
        recurrencePattern,
        recurrencePatternLabel: formData.recurrencePatternLabel,
        invoiceSchedule,
        nextExecution,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        createdBy: clientId,
        createdByName: clientName,
        creationSource: 'client_portal_ui',
        timeline,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success('Recurring work order created successfully');
      router.push('/client-portal/recurring-work-orders');
    } catch (error: any) {
      console.error('Error creating recurring work order', error);
      toast.error(error.message || 'Failed to create recurring work order');
    } finally {
      setSubmitting(false);
    }
  };

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const locationOptions = locations.map(l => ({
    value: l.id,
    label: l.name || l.locationName || l.id,
  }));

  const categoryOptions = categories.map(c => ({ value: c.name, label: c.name }));

  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  const recurrencePatternOptions = RECURRENCE_PATTERN_OPTIONS.map(opt => ({ value: opt, label: opt }));

  const invoiceScheduleTypeOptions = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'bi-monthly', label: 'Bi-Monthly (twice per month)' },
    { value: 'quarterly', label: 'Quarterly (every 3 months)' },
    { value: 'semiannually', label: 'Semi-Annually (every 6 months)' },
  ];

  const timezoneOptions = [
    { value: 'America/New_York', label: 'Eastern Time' },
    { value: 'America/Chicago', label: 'Central Time' },
    { value: 'America/Denver', label: 'Mountain Time' },
    { value: 'America/Los_Angeles', label: 'Pacific Time' },
    { value: 'UTC', label: 'UTC' },
  ];

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/client-portal/recurring-work-orders">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">New Recurring Work Order</h1>
            <p className="text-muted-foreground mt-1 text-sm">Set up a work order that repeats automatically</p>
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
                <Label>Location <span className="text-red-500">*</span></Label>
                <div className="mt-1">
                  <SearchableSelect
                    options={locationOptions}
                    value={formData.locationId}
                    onValueChange={(val) => setFormData(prev => ({ ...prev, locationId: val }))}
                    placeholder="Choose a location..."
                  />
                </div>
                {locations.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No locations found. Please add a location first.</p>
                )}
              </div>

              <div>
                <Label>Work Order Title <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Monthly HVAC Maintenance"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Description <span className="text-red-500">*</span></Label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-input rounded-md p-2 min-h-[100px] text-sm bg-background mt-1"
                  placeholder="Detailed description of the recurring work..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category <span className="text-red-500">*</span></Label>
                  <div className="mt-1">
                    <SearchableSelect
                      options={categoryOptions}
                      value={formData.category}
                      onValueChange={(val) => setFormData(prev => ({ ...prev, category: val }))}
                      placeholder="Select category..."
                    />
                  </div>
                </div>
                <div>
                  <Label>Priority <span className="text-red-500">*</span></Label>
                  <div className="mt-1">
                    <SearchableSelect
                      options={priorityOptions}
                      value={formData.priority}
                      onValueChange={(val) => setFormData(prev => ({ ...prev, priority: val as 'low' | 'medium' | 'high' }))}
                      placeholder="Select priority..."
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Estimate Budget (Optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.estimateBudget}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimateBudget: e.target.value }))}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="e.g., 5000"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Estimated budget per occurrence in USD</p>
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
                <div className="mt-1">
                  <SearchableSelect
                    options={recurrencePatternOptions}
                    value={formData.recurrencePatternLabel}
                    onValueChange={(val) => handleRecurrencePatternChange(val as (typeof RECURRENCE_PATTERN_OPTIONS)[number])}
                    placeholder="Select pattern..."
                  />
                </div>
              </div>

              {/* Day-of-month picker for MONTHLY, BI-MONTHLY, QUARTERLY, SEMIANNUALLY */}
              {needsDayOfMonthPicker && (
                <div>
                  <Label>{isBiMonthly ? 'Select 2 Days of the Month' : 'Select Day of the Month'} <span className="text-red-500">*</span></Label>
                  <div className="grid grid-cols-7 gap-1 mt-2">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                      const isSelected = formData.recurrenceDaysOfMonth.includes(day);
                      const isDisabled = !isBiMonthly && !isSelected && formData.recurrenceDaysOfMonth.length >= 1
                        || isBiMonthly && !isSelected && formData.recurrenceDaysOfMonth.length >= 2;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => !isDisabled && toggleDayOfMonth(day)}
                          disabled={isDisabled}
                          className={`h-8 rounded-md text-xs font-medium border transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : isDisabled
                              ? 'border-border bg-muted/50 text-muted-foreground cursor-not-allowed opacity-40'
                              : 'border-border hover:bg-muted text-foreground'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  {isBiMonthly && formData.recurrenceDaysOfMonth.length !== 2 && (
                    <p className="text-xs text-yellow-600 mt-1">Select exactly 2 days of the month.</p>
                  )}
                  {!isBiMonthly && formData.recurrenceDaysOfMonth.length === 0 && (
                    <p className="text-xs text-yellow-600 mt-1">Select a day of the month.</p>
                  )}
                </div>
              )}

              {(formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY') && (
                <div>
                  <Label>{formData.recurrencePatternLabel === 'BI-WEEKLY' ? 'Select 2 Days Per Week' : 'Days of Week'} <span className="text-red-500">*</span></Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {daysOfWeek.map((day, idx) => {
                      const isSelected = formData.recurrenceDaysOfWeek.includes(idx);
                      const isDisabled = formData.recurrencePatternLabel === 'BI-WEEKLY' && !isSelected && formData.recurrenceDaysOfWeek.length >= 2;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => !isDisabled && toggleDayOfWeek(idx)}
                          disabled={isDisabled}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : isDisabled
                              ? 'bg-muted/50 text-muted-foreground border-border cursor-not-allowed opacity-50'
                              : 'bg-card text-foreground border-border hover:bg-muted'
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                  {formData.recurrencePatternLabel === 'BI-WEEKLY' && formData.recurrenceDaysOfWeek.length !== 2 && (
                    <p className="text-xs text-yellow-600 mt-1">Select exactly 2 days per week.</p>
                  )}
                </div>
              )}

              <div>
                <Label>Starting Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={formData.recurrenceStartDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, recurrenceStartDate: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Invoice Schedule</h4>
                <div className="space-y-3">
                  <div>
                    <Label>Invoice Frequency</Label>
                    <div className="mt-1">
                      <SearchableSelect
                        options={invoiceScheduleTypeOptions}
                        value={formData.invoiceScheduleType}
                        onValueChange={(val) => setFormData(prev => ({ ...prev, invoiceScheduleType: val as any }))}
                        placeholder="Select frequency..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Invoice Day of Month</Label>
                      <Input
                        type="number"
                        min="1"
                        max="28"
                        value={formData.invoiceScheduleDayOfMonth}
                        onChange={(e) => setFormData(prev => ({ ...prev, invoiceScheduleDayOfMonth: parseInt(e.target.value) || 1 }))}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Invoice Time</Label>
                      <Input
                        type="time"
                        value={formData.invoiceTime}
                        onChange={(e) => setFormData(prev => ({ ...prev, invoiceTime: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Timezone</Label>
                    <div className="mt-1">
                      <SearchableSelect
                        options={timezoneOptions}
                        value={formData.timezone}
                        onValueChange={(val) => setFormData(prev => ({ ...prev, timezone: val }))}
                        placeholder="Select timezone..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/client-portal/recurring-work-orders">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            <Save className="h-4 w-4" />
            {submitting ? 'Creating...' : 'Create Recurring Work Order'}
          </Button>
        </div>
      </div>
    </ClientLayout>
  );
}
