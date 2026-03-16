'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, getDocs, addDoc, doc, getDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Save, Calendar, Clock, RotateCcw,
  ChevronDown, ChevronUp, Settings, Search, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { RecurringWorkOrder, RecurrencePattern, InvoiceSchedule } from '@/types';

interface Client {
  id: string;
  fullName: string;
  email: string;
  companyId?: string;
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

interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

function SearchableSelect({ options, value, onChange, placeholder = 'Select...', disabled = false }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full flex items-center justify-between border border-gray-300 rounded-md p-2 bg-white text-left text-sm ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:border-gray-400 cursor-pointer'}`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1 border border-gray-200 rounded-md">
              <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 text-sm outline-none bg-transparent"
              />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">No results found</li>
            ) : (
              filtered.map(opt => (
                <li
                  key={opt.value}
                  onMouseDown={() => handleSelect(opt.value)}
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${opt.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                >
                  {opt.label}
                  {opt.value === value && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
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

  const RECURRENCE_PATTERN_OPTIONS = ['DAILY', 'SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-MONTHLY', 'BI-WEEKLY'] as const;

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
    recurrenceStartDate: '',
    recurrenceEndDate: '',
    recurrenceMaxOccurrences: '',
    invoiceScheduleType: 'monthly' as 'monthly' | 'bi-monthly',
    invoiceScheduleInterval: 1,
    invoiceScheduleDaysOfWeek: [] as number[],
    invoiceScheduleDayOfMonth: 1,
    invoiceScheduleSecondDayOfMonth: 15,
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
        companyId: doc.data().companyId,
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
    Promise.all([fetchClients(), fetchLocations(), fetchCompanies(), fetchCategories()])
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!formData.clientId || !formData.companyId || !formData.locationId || !formData.title || !formData.description || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.recurrencePatternLabel === 'DAILY' && formData.recurrenceDaysOfWeek.length === 0) {
      toast.error('Please select at least one day for the daily recurrence');
      return;
    }

    if (!formData.recurrenceStartDate) {
      toast.error('Please select a starting date for the recurrence');
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

      const now = new Date();

      // Compute nextExecution based on startDate and pattern
      let nextExecution: Date;
      if (formData.recurrencePatternLabel === 'DAILY' && formData.recurrenceStartDate && formData.recurrenceDaysOfWeek.length > 0) {
        const startDate = new Date(formData.recurrenceStartDate);
        startDate.setHours(9, 0, 0, 0);
        let candidate = new Date(startDate);
        for (let i = 0; i < 7; i++) {
          if (formData.recurrenceDaysOfWeek.includes(candidate.getDay())) {
            nextExecution = candidate;
            break;
          }
          candidate = new Date(candidate);
          candidate.setDate(candidate.getDate() + 1);
        }
        nextExecution = nextExecution! || startDate;
      } else if (formData.recurrenceStartDate) {
        const startDate = new Date(formData.recurrenceStartDate);
        startDate.setHours(9, 0, 0, 0);
        if (formData.recurrenceType === 'monthly') {
          nextExecution = new Date(startDate.getFullYear(), startDate.getMonth(), formData.recurrenceDayOfMonth, 9, 0, 0);
          if (nextExecution < startDate) {
            nextExecution.setMonth(nextExecution.getMonth() + formData.recurrenceInterval);
          }
        } else {
          nextExecution = new Date(startDate);
        }
      } else {
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
        ...(formData.recurrencePatternLabel === 'DAILY' && {
          daysOfWeek: formData.recurrenceDaysOfWeek,
        }),
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
        type: formData.invoiceScheduleType,
        interval: formData.invoiceScheduleType === 'bi-monthly' ? 1 : formData.invoiceScheduleInterval,
        dayOfMonth: formData.invoiceScheduleDayOfMonth,
        ...(formData.invoiceScheduleType === 'bi-monthly' && {
          secondDayOfMonth: formData.invoiceScheduleSecondDayOfMonth,
        }),
        time: formData.invoiceTime,
        timezone: formData.timezone,
      } as InvoiceSchedule;

      const workOrderNumber = `RWO-${Date.now().toString().slice(-8).toUpperCase()}`;

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const createdByName = adminDoc.exists() ? (adminDoc.data().fullName ?? 'Admin') : 'Admin';
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

  const handleClientSelect = (clientId: string) => {
    // Clients store companyId directly — use that as the primary link
    const client = clients.find(c => c.id === clientId);
    const autoCompanyId = client?.companyId || '';

    const clientLocations = autoCompanyId
      ? locations.filter(l => l.companyId === autoCompanyId)
      : locations.filter(l => l.clientId === clientId);
    const autoLocationId = clientLocations.length === 1 ? clientLocations[0].id : '';

    setFormData((prev) => ({
      ...prev,
      clientId,
      companyId: autoCompanyId,
      locationId: autoLocationId,
    }));
  };

  const handleCompanySelect = (companyId: string) => {
    const companyLocations = locations.filter(l => l.companyId === companyId);
    const autoLocationId = companyLocations.length === 1 ? companyLocations[0].id : '';

    setFormData((prev) => ({
      ...prev,
      companyId,
      locationId: autoLocationId,
    }));
  };

  const handleLocationSelect = (locationId: string) => {
    setFormData((prev) => ({
      ...prev,
      locationId,
    }));
  };

  const handleRecurrencePatternChange = (label: (typeof RECURRENCE_PATTERN_OPTIONS)[number]) => {
    let type: 'monthly' | 'weekly' = 'monthly';
    let interval = 1;
    if (label === 'DAILY') { type = 'weekly'; interval = 1; }
    else if (label === 'SEMIANNUALLY') { type = 'monthly'; interval = 6; }
    else if (label === 'QUARTERLY') { type = 'monthly'; interval = 3; }
    else if (label === 'MONTHLY') { type = 'monthly'; interval = 1; }
    else if (label === 'BI-MONTHLY') { type = 'monthly'; interval = 2; }
    else if (label === 'BI-WEEKLY') { type = 'weekly'; interval = 2; }
    setFormData({
      ...formData,
      recurrencePatternLabel: label,
      recurrenceType: type,
      recurrenceInterval: interval,
      recurrenceDaysOfWeek: label === 'DAILY' ? formData.recurrenceDaysOfWeek : [],
    });
  };

  const toggleDayOfWeek = (day: number) => {
    const days = formData.recurrenceDaysOfWeek;
    if (days.includes(day)) {
      setFormData({ ...formData, recurrenceDaysOfWeek: days.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, recurrenceDaysOfWeek: [...days, day].sort((a, b) => a - b) });
    }
  };

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // SearchableSelect option arrays
  const clientOptions: SearchableSelectOption[] = clients.map(c => ({
    value: c.id,
    label: `${c.fullName} (${c.email})`,
  }));

  const filteredCompanies = (() => {
    if (!formData.clientId) return companies;
    const client = clients.find(c => c.id === formData.clientId);
    if (client?.companyId) {
      const matched = companies.filter(c => c.id === client.companyId);
      return matched.length > 0 ? matched : companies;
    }
    return companies;
  })();

  const filteredLocations = (() => {
    if (formData.companyId) {
      const matched = locations.filter(l => l.companyId === formData.companyId);
      return matched.length > 0 ? matched : locations;
    }
    if (formData.clientId) {
      const matched = locations.filter(l => l.clientId === formData.clientId);
      return matched.length > 0 ? matched : locations;
    }
    return locations;
  })();

  const companyOptions: SearchableSelectOption[] = filteredCompanies.map(c => ({
    value: c.id,
    label: c.name,
  }));

  const locationOptions: SearchableSelectOption[] = filteredLocations.map(l => ({
    value: l.id,
    label: l.locationName,
  }));

  const categoryOptions: SearchableSelectOption[] = categories.map(c => ({
    value: c.name,
    label: c.name,
  }));

  const priorityOptions: SearchableSelectOption[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  const timezoneOptions: SearchableSelectOption[] = [
    { value: 'America/New_York', label: 'Eastern Time' },
    { value: 'America/Chicago', label: 'Central Time' },
    { value: 'America/Denver', label: 'Mountain Time' },
    { value: 'America/Los_Angeles', label: 'Pacific Time' },
    { value: 'UTC', label: 'UTC' },
  ];

  const recurrencePatternOptions: SearchableSelectOption[] = RECURRENCE_PATTERN_OPTIONS.map(opt => ({
    value: opt,
    label: opt,
  }));

  const invoiceScheduleTypeOptions: SearchableSelectOption[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'bi-monthly', label: 'Bi-Monthly (twice per month)' },
  ];

  const getOrdinalSuffix = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
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
                <div className="mt-1">
                  <SearchableSelect
                    options={clientOptions}
                    value={formData.clientId}
                    onChange={handleClientSelect}
                    placeholder="Choose a client..."
                  />
                </div>
              </div>

              <div>
                <Label>Company *</Label>
                <div className="mt-1">
                  <SearchableSelect
                    options={companyOptions}
                    value={formData.companyId}
                    onChange={handleCompanySelect}
                    placeholder="Choose a company..."
                  />
                </div>
              </div>

              <div>
                <Label>Select Location *</Label>
                <div className="mt-1">
                  <SearchableSelect
                    options={locationOptions}
                    value={formData.locationId}
                    onChange={handleLocationSelect}
                    placeholder="Choose a location..."
                  />
                </div>
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
                  <div className="mt-1">
                    <SearchableSelect
                      options={categoryOptions}
                      value={formData.category}
                      onChange={(val) => setFormData({ ...formData, category: val })}
                      placeholder="Select category..."
                    />
                  </div>
                </div>

                <div>
                  <Label>Priority *</Label>
                  <div className="mt-1">
                    <SearchableSelect
                      options={priorityOptions}
                      value={formData.priority}
                      onChange={(val) => setFormData({ ...formData, priority: val as any })}
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
                <div className="mt-2">
                  <SearchableSelect
                    options={recurrencePatternOptions}
                    value={formData.recurrencePatternLabel}
                    onChange={(val) => handleRecurrencePatternChange(val as (typeof RECURRENCE_PATTERN_OPTIONS)[number])}
                    placeholder="Select pattern..."
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  This work order will repeat <strong>{formData.recurrencePatternLabel}</strong>
                  {formData.recurrencePatternLabel !== 'DAILY' && formData.recurrenceType === 'weekly' && ` (every ${formData.recurrenceInterval} week(s))`}
                  {formData.recurrencePatternLabel !== 'DAILY' && formData.recurrenceType === 'monthly' && ` (every ${formData.recurrenceInterval} month(s))`}.
                </p>
              </div>

              {/* DAILY only: day-of-week checkboxes */}
              {formData.recurrencePatternLabel === 'DAILY' && (
                <div>
                  <Label>Select Days *</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {daysOfWeek.map((day, index) => (
                      <label
                        key={day}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                          formData.recurrenceDaysOfWeek.includes(index)
                            ? 'bg-blue-50 border-blue-400 text-blue-700'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.recurrenceDaysOfWeek.includes(index)}
                          onChange={() => toggleDayOfWeek(index)}
                          className="accent-blue-600"
                        />
                        <span className="text-sm font-medium">{day}</span>
                      </label>
                    ))}
                  </div>
                  {formData.recurrenceDaysOfWeek.length === 0 && (
                    <p className="text-xs text-yellow-600 mt-1">Select at least one day.</p>
                  )}
                </div>
              )}

              {/* Starting Date — all patterns */}
              <div>
                <Label>Starting Date *</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={formData.recurrenceStartDate}
                  onChange={(e) => setFormData({ ...formData, recurrenceStartDate: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  The first date occurrences will begin. Events will appear on the calendar from this date onward.
                </p>
                {formData.recurrencePatternLabel === 'DAILY' && formData.recurrenceDaysOfWeek.length > 0 && formData.recurrenceStartDate && (() => {
                  const start = new Date(formData.recurrenceStartDate);
                  const upcoming: string[] = [];
                  let d = new Date(start);
                  let count = 0;
                  while (upcoming.length < 5 && count < 14) {
                    if (formData.recurrenceDaysOfWeek.includes(d.getDay())) {
                      upcoming.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
                    }
                    d.setDate(d.getDate() + 1);
                    count++;
                  }
                  return upcoming.length > 0 ? (
                    <div className="mt-2 p-2 bg-blue-50 rounded-md">
                      <p className="text-xs font-semibold text-blue-700 mb-1">First 5 upcoming occurrences:</p>
                      <ul className="text-xs text-blue-600 space-y-0.5">
                        {upcoming.map((d, i) => <li key={i}>• {d}</li>)}
                      </ul>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Ending Date — all patterns */}
              <div>
                <Label>Ending Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={formData.recurrenceEndDate}
                  onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  The last date occurrences will run. Calendar events will be generated up to this date.
                </p>
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
                <div className="mt-1">
                  <SearchableSelect
                    options={invoiceScheduleTypeOptions}
                    value={formData.invoiceScheduleType}
                    onChange={(val) => setFormData({ ...formData, invoiceScheduleType: val as 'monthly' | 'bi-monthly' })}
                    placeholder="Select schedule..."
                  />
                </div>
              </div>

              {formData.invoiceScheduleType === 'monthly' && (
                <>
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

                </>
              )}

              {formData.invoiceScheduleType === 'bi-monthly' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">Two invoices will be sent each month — one on the 1st date and one on the 2nd date.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>1st Invoice Day</Label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.invoiceScheduleDayOfMonth}
                        onChange={(e) => setFormData({ ...formData, invoiceScheduleDayOfMonth: parseInt(e.target.value) || 1 })}
                      />
                      <p className="text-xs text-gray-500 mt-1">e.g., 1 = 1st of month</p>
                    </div>
                    <div>
                      <Label>2nd Invoice Day</Label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.invoiceScheduleSecondDayOfMonth}
                        onChange={(e) => setFormData({ ...formData, invoiceScheduleSecondDayOfMonth: parseInt(e.target.value) || 15 })}
                      />
                      <p className="text-xs text-gray-500 mt-1">e.g., 15 = 15th of month</p>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-md text-sm text-blue-700">
                    Invoices will be sent on the <strong>{formData.invoiceScheduleDayOfMonth}{getOrdinalSuffix(formData.invoiceScheduleDayOfMonth)}</strong> and <strong>{formData.invoiceScheduleSecondDayOfMonth}{getOrdinalSuffix(formData.invoiceScheduleSecondDayOfMonth)}</strong> of each month.
                  </div>
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
                  <div className="mt-1">
                    <SearchableSelect
                      options={timezoneOptions}
                      value={formData.timezone}
                      onChange={(val) => setFormData({ ...formData, timezone: val })}
                      placeholder="Select timezone..."
                    />
                  </div>
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
                <span className="font-semibold">Recurrence:</span>{' '}
                {formData.recurrencePatternLabel === 'DAILY'
                  ? `Daily — ${formData.recurrenceDaysOfWeek.length > 0 ? formData.recurrenceDaysOfWeek.map(d => daysOfWeek[d]).join(', ') : 'No days selected'}${formData.recurrenceStartDate ? ` from ${new Date(formData.recurrenceStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`
                  : `Every ${formData.recurrenceInterval} ${formData.recurrenceType}`}
              </div>
              <div className="text-sm">
                <span className="font-semibold">Invoice Schedule:</span>{' '}
                {formData.invoiceScheduleType === 'bi-monthly'
                  ? `Bi-Monthly — ${formData.invoiceScheduleDayOfMonth}${getOrdinalSuffix(formData.invoiceScheduleDayOfMonth)} & ${formData.invoiceScheduleSecondDayOfMonth}${getOrdinalSuffix(formData.invoiceScheduleSecondDayOfMonth)} of each month`
                  : `Every ${formData.invoiceScheduleInterval} month(s) on the ${formData.invoiceScheduleDayOfMonth}${getOrdinalSuffix(formData.invoiceScheduleDayOfMonth)}`}
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
