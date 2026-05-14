'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, getDocs, addDoc, doc, getDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Save, Calendar, Clock, RotateCcw,
  ChevronDown, ChevronUp, Settings, Search, Check, Layers, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { RecurringWorkOrder, RecurrencePattern, InvoiceSchedule } from '@/types';
import {
  RECURRENCE_PATTERN_LABELS,
  type RecurrencePatternLabel,
  buildRecurrencePattern,
  generateAllScheduledDates,
} from '@/lib/recurrence';

import { PageContainer } from '@/components/ui/page-container';
import { PortalListPage } from '@/components/ui/portal-list-page';
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
  invoiceConsolidationEnabled?: boolean;
}

interface PaymentMethodLite {
  id: string;
  type?: 'card' | 'us_bank_account';
  last4?: string;
  brand?: string;
  bankName?: string;
  verificationStatus?: 'pending' | 'verified';
  isDefault?: boolean;
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
        className={`w-full flex items-center justify-between border border-border rounded-md p-2 bg-card text-left text-sm ${disabled ? 'opacity-50 cursor-not-allowed bg-muted' : 'hover:border-gray-400 cursor-pointer'}`}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 border border-border rounded-md">
              <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
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
              <li className="px-3 py-2 text-sm text-muted-foreground">No results found</li>
            ) : (
              filtered.map(opt => (
                <li
                  key={opt.value}
                  onMouseDown={() => handleSelect(opt.value)}
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 ${opt.value === value ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
                >
                  {opt.label}
                  {opt.value === value && <Check className="h-3.5 w-3.5 text-primary" />}
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

  // Invoice-schedule-specific state
  const [selectedClientPMs, setSelectedClientPMs] = useState<PaymentMethodLite[]>([]);
  const [selectedClientDefaultPMId, setSelectedClientDefaultPMId] = useState('');
  const [invoiceCompanyHasConsolidation, setInvoiceCompanyHasConsolidation] = useState(false);

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
    recurrenceDaysOfMonth: [] as number[],
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
    invoiceScheduleSecondDayOfMonth: 15,
    invoiceScheduleMonthOfYear: 1,
    invoiceScheduleCustomPattern: '',
    invoiceTime: '09:00',
    timezone: 'America/New_York',
    // Extended invoice schedule fields (new full-featured UI)
    invoiceRecurrencePatternLabel: 'MONTHLY' as RecurrencePatternLabel,
    invoiceDaysOfWeek: [] as number[],
    invoiceDaysOfMonth: [1] as number[],
    invoiceStartDate: '',
    invoiceEndDate: '',
    invoiceAutoCharge: false,
    invoiceAutoChargePaymentMethodId: '',
    invoiceConsolidationEnabled: false,
    invoiceConsolidationPeriod: 'weekly' as 'weekly' | 'bi-weekly' | 'monthly',
    invoiceConsolidationEndDayOfWeek: 0,
    invoiceConsolidationAutoCharge: false,
    invoiceConsolidationAutoChargePaymentMethodId: '',
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

    if (formData.recurrencePatternLabel === 'BI-WEEKLY' && formData.recurrenceDaysOfWeek.length !== 1) {
      toast.error('Please select exactly 1 day of the week for the bi-weekly (every 2 weeks) recurrence');
      return;
    }

    if (formData.recurrencePatternLabel === 'BI-MONTHLY' && formData.recurrenceDaysOfMonth.length !== 1) {
      toast.error('Please select exactly 1 day of the month for the bi-monthly (every 2 months) recurrence');
      return;
    }

    if (['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(formData.recurrencePatternLabel) && formData.recurrenceDaysOfMonth.length !== 1) {
      toast.error('Please select a day of the month for the recurrence');
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
      let nextExecution: Date = new Date();
      if ((formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY') && formData.recurrenceStartDate && formData.recurrenceDaysOfWeek.length > 0) {
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
      } else if (needsDayOfMonthPicker && formData.recurrenceDaysOfMonth.length > 0 && formData.recurrenceStartDate) {
        // For monthly-based patterns, find the first occurrence on or after start date
        const startDate = new Date(formData.recurrenceStartDate);
        startDate.setHours(9, 0, 0, 0);
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
          // Move to next month interval
          const monthInterval = formData.recurrencePatternLabel === 'QUARTERLY' ? 3
            : formData.recurrencePatternLabel === 'SEMIANNUALLY' ? 6
            : formData.recurrencePatternLabel === 'BI-MONTHLY' ? 2 : 1;
          const nextMonth = new Date(startDate);
          nextMonth.setMonth(nextMonth.getMonth() + monthInterval);
          const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
          nextExecution = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(sorted[0], lastDay), 9, 0, 0);
        }
      } else if (formData.recurrenceStartDate) {
        const startDate = new Date(formData.recurrenceStartDate);
        startDate.setHours(9, 0, 0, 0);
        nextExecution = new Date(startDate);
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
        ...((formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY') && {
          daysOfWeek: formData.recurrenceDaysOfWeek,
        }),
        ...(needsDayOfMonthPicker && formData.recurrenceDaysOfMonth.length > 0 && {
          daysOfMonth: formData.recurrenceDaysOfMonth,
          dayOfMonth: formData.recurrenceDaysOfMonth[0],
        }),
        ...(formData.recurrenceStartDate && {
          startDate: new Date(formData.recurrenceStartDate),
        }),
        ...(formData.recurrenceEndDate && {
          endDate: new Date(formData.recurrenceEndDate),
        }),
        ...(formData.recurrenceMaxOccurrences && {
          maxOccurrences: parseInt(formData.recurrenceMaxOccurrences),
        }),
      } as RecurrencePattern;

      const invoiceIntervalMap: Record<RecurrencePatternLabel, number> = {
        DAILY: 1, WEEKLY: 1, 'BI-WEEKLY': 2, MONTHLY: 1, 'BI-MONTHLY': 2, QUARTERLY: 3, SEMIANNUALLY: 6,
      };
      const invoiceType = formData.invoiceRecurrencePatternLabel.toLowerCase().replace('bi_', 'bi-') as InvoiceSchedule['type'];
      const invoiceSchedule: InvoiceSchedule = {
        type: invoiceType,
        interval: invoiceIntervalMap[formData.invoiceRecurrencePatternLabel],
        daysOfMonth: formData.invoiceDaysOfMonth,
        dayOfMonth: formData.invoiceDaysOfMonth[0] ?? 1,
        daysOfWeek: formData.invoiceDaysOfWeek,
        ...(formData.invoiceStartDate ? { startDate: new Date(formData.invoiceStartDate) } : {}),
        ...(formData.invoiceEndDate ? { endDate: new Date(formData.invoiceEndDate) } : { endDate: null }),
        time: formData.invoiceTime,
        timezone: formData.timezone,
        autoCharge: formData.invoiceAutoCharge,
        ...(formData.invoiceAutoCharge && formData.invoiceAutoChargePaymentMethodId
          ? { autoChargePaymentMethodId: formData.invoiceAutoChargePaymentMethodId }
          : {}),
        ...(formData.invoiceRecurrencePatternLabel === 'DAILY' && formData.invoiceConsolidationEnabled
          ? {
              consolidationEnabled: true,
              consolidationPeriod: formData.invoiceConsolidationPeriod,
              consolidationEndDayOfWeek: formData.invoiceConsolidationEndDayOfWeek,
              consolidationAutoCharge: formData.invoiceConsolidationAutoCharge,
              ...(formData.invoiceConsolidationAutoCharge && formData.invoiceConsolidationAutoChargePaymentMethodId
                ? { consolidationAutoChargePaymentMethodId: formData.invoiceConsolidationAutoChargePaymentMethodId }
                : {}),
            }
          : {}),
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

  const handleClientSelect = async (clientId: string) => {
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
      invoiceConsolidationEnabled: false,
    }));

    // Load client PMs for auto-charge picker
    setSelectedClientPMs([]);
    setSelectedClientDefaultPMId('');
    setInvoiceCompanyHasConsolidation(false);

    try {
      const { getDoc: gd, doc: d } = await import('firebase/firestore');
      const clientSnap = await gd(d(db, 'clients', clientId));
      if (clientSnap.exists()) {
        const data = clientSnap.data() as any;
        const pms: PaymentMethodLite[] = Array.isArray(data.paymentMethods)
          ? data.paymentMethods.filter((m: any) => m?.id && m?.verificationStatus !== 'pending')
          : [];
        setSelectedClientPMs(pms);
        setSelectedClientDefaultPMId(data.defaultPaymentMethodId || pms[0]?.id || '');
      }
    } catch { /* non-fatal */ }

    if (autoCompanyId) {
      try {
        const { getDoc: gd, doc: d } = await import('firebase/firestore');
        const compSnap = await gd(d(db, 'companies', autoCompanyId));
        if (compSnap.exists()) {
          const compData = compSnap.data() as any;
          setInvoiceCompanyHasConsolidation(compData.invoiceConsolidationEnabled === true);
        }
      } catch { /* non-fatal */ }
    }
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
    let invoiceScheduleType = formData.invoiceScheduleType;
    if (label === 'DAILY') { type = 'weekly'; interval = 1; }
    else if (label === 'SEMIANNUALLY') { type = 'monthly'; interval = 6; invoiceScheduleType = 'semiannually'; }
    else if (label === 'QUARTERLY') { type = 'monthly'; interval = 3; invoiceScheduleType = 'quarterly'; }
    else if (label === 'MONTHLY') { type = 'monthly'; interval = 1; invoiceScheduleType = 'monthly'; }
    else if (label === 'BI-MONTHLY') { type = 'monthly'; interval = 2; invoiceScheduleType = 'monthly'; }
    else if (label === 'BI-WEEKLY') { type = 'weekly'; interval = 2; }
    setFormData({
      ...formData,
      recurrencePatternLabel: label,
      recurrenceType: type,
      recurrenceInterval: interval,
      recurrenceDaysOfWeek: (label === 'DAILY' || label === 'BI-WEEKLY') ? formData.recurrenceDaysOfWeek : [],
      recurrenceDaysOfMonth: ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label) ? formData.recurrenceDaysOfMonth : [],
      invoiceScheduleType,
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

  const toggleDayOfMonth = (day: number) => {
    const days = formData.recurrenceDaysOfMonth;
    if (days.includes(day)) {
      setFormData({ ...formData, recurrenceDaysOfMonth: days.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, recurrenceDaysOfMonth: [...days, day].sort((a, b) => a - b) });
    }
  };

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handleInvoicePatternChange = (label: RecurrencePatternLabel) => {
    setFormData(prev => {
      const next = { ...prev, invoiceRecurrencePatternLabel: label };
      const isWeekday = label === 'DAILY' || label === 'BI-WEEKLY';
      const isMonthly = ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label);
      if (!isWeekday) next.invoiceDaysOfWeek = [];
      if (!isMonthly) next.invoiceDaysOfMonth = [];
      if (isMonthly && prev.invoiceDaysOfMonth.length === 0) next.invoiceDaysOfMonth = [1];
      if (label === 'BI-MONTHLY') {
        next.invoiceDaysOfMonth = prev.invoiceDaysOfMonth.length === 2 ? prev.invoiceDaysOfMonth : [1, 15];
      } else if (isMonthly) {
        next.invoiceDaysOfMonth = prev.invoiceDaysOfMonth.length >= 1 ? [prev.invoiceDaysOfMonth[0]] : [1];
      }
      if (label === 'BI-WEEKLY') {
        next.invoiceDaysOfWeek = prev.invoiceDaysOfWeek.length === 1 ? prev.invoiceDaysOfWeek : [1];
      }
      if (label !== 'DAILY') next.invoiceConsolidationEnabled = false;
      return next;
    });
  };

  const toggleInvoiceDayOfWeek = (idx: number) => {
    setFormData(prev => {
      const has = prev.invoiceDaysOfWeek.includes(idx);
      if (prev.invoiceRecurrencePatternLabel === 'BI-WEEKLY') {
        return { ...prev, invoiceDaysOfWeek: has ? [] : [idx] };
      }
      return {
        ...prev,
        invoiceDaysOfWeek: has
          ? prev.invoiceDaysOfWeek.filter(d => d !== idx)
          : [...prev.invoiceDaysOfWeek, idx],
      };
    });
  };

  const toggleInvoiceDayOfMonth = (day: number) => {
    setFormData(prev => {
      const has = prev.invoiceDaysOfMonth.includes(day);
      if (prev.invoiceRecurrencePatternLabel === 'BI-MONTHLY') {
        if (has) return { ...prev, invoiceDaysOfMonth: prev.invoiceDaysOfMonth.filter(d => d !== day) };
        if (prev.invoiceDaysOfMonth.length >= 2) return { ...prev, invoiceDaysOfMonth: [...prev.invoiceDaysOfMonth.slice(1), day] };
        return { ...prev, invoiceDaysOfMonth: [...prev.invoiceDaysOfMonth, day] };
      }
      return { ...prev, invoiceDaysOfMonth: [day] };
    });
  };

  const labelForPm = (pm: PaymentMethodLite): string => {
    if (pm.type === 'us_bank_account') return `${pm.bankName || pm.brand || 'Bank'} ••${pm.last4 || ''}`;
    const brand = pm.brand ? pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1) : 'Card';
    return `${brand} ••${pm.last4 || ''}`;
  };

  const invoicePreviewDates = (() => {
    if (!formData.invoiceStartDate) return [] as Date[];
    const label = formData.invoiceRecurrencePatternLabel;
    const isWeekday = label === 'DAILY' || label === 'BI-WEEKLY';
    const isMonthly = ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label);
    if (isWeekday && formData.invoiceDaysOfWeek.length === 0) return [] as Date[];
    if (isMonthly && formData.invoiceDaysOfMonth.length === 0) return [] as Date[];
    if (label === 'BI-WEEKLY' && formData.invoiceDaysOfWeek.length !== 1) return [] as Date[];
    if (label === 'BI-MONTHLY' && formData.invoiceDaysOfMonth.length !== 2) return [] as Date[];
    if (['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label) && formData.invoiceDaysOfMonth.length !== 1) return [] as Date[];
    try {
      const pattern = buildRecurrencePattern({
        label,
        startDate: formData.invoiceStartDate,
        endDate: formData.invoiceEndDate || null,
        daysOfWeek: formData.invoiceDaysOfWeek,
        daysOfMonth: formData.invoiceDaysOfMonth,
      });
      return generateAllScheduledDates({ recurrencePattern: pattern, recurrencePatternLabel: label }, 5);
    } catch {
      return [] as Date[];
    }
  })();

  const getOrdinalSuffixShort = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Whether this pattern needs a day-of-month picker
  const needsDayOfMonthPicker = ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(formData.recurrencePatternLabel);
  const isBiMonthly = false; // BI-MONTHLY now means every 2 months (single day pick, like MONTHLY)

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
      // Strict companyId match, with forgiving fallback for legacy
      // locations missing companyId but tied to the same client.
      const matched = locations.filter((l) => {
        if (l.companyId) return l.companyId === formData.companyId;
        return formData.clientId ? l.clientId === formData.clientId : false;
      });
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
    { value: 'bi-monthly', label: 'Bi-Monthly (every 2 months)' },
    { value: 'quarterly', label: 'Quarterly (every 3 months)' },
    { value: 'semiannually', label: 'Semi-Annually (every 6 months)' },
  ];

  const getOrdinalSuffix = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  if (loading) {
    return (
      <>
        <PageContainer>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
          </div>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <PortalListPage
        title="Create Recurring Work Order"
        subtitle="Set up a work order that repeats automatically"
        icon={RotateCcw}
        heroAction={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        }
      >

        <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-4">
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
                  className="w-full border border-border rounded-md p-2 min-h-[100px]"
                  placeholder="Detailed description of the recurring work..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="mt-2">
                  <SearchableSelect
                    options={recurrencePatternOptions}
                    value={formData.recurrencePatternLabel}
                    onChange={(val) => handleRecurrencePatternChange(val as (typeof RECURRENCE_PATTERN_OPTIONS)[number])}
                    placeholder="Select pattern..."
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  This work order will repeat{' '}
                  <strong>
                    {formData.recurrencePatternLabel === 'BI-WEEKLY' ? 'EVERY 2 WEEKS'
                      : formData.recurrencePatternLabel === 'BI-MONTHLY' ? 'EVERY 2 MONTHS'
                      : formData.recurrencePatternLabel === 'MONTHLY' ? 'MONTHLY'
                      : formData.recurrencePatternLabel === 'QUARTERLY' ? 'QUARTERLY (every 3 months)'
                      : formData.recurrencePatternLabel === 'SEMIANNUALLY' ? 'SEMIANNUALLY (every 6 months)'
                      : formData.recurrencePatternLabel}
                  </strong>
                  {formData.recurrenceDaysOfMonth.length > 0 && needsDayOfMonthPicker && (
                    <> on the {formData.recurrenceDaysOfMonth.map(d => getOrdinalSuffixShort(d)).join(' & ')}</>
                  )}.
                </p>
              </div>

              {/* Day-of-month picker for MONTHLY, BI-MONTHLY, QUARTERLY, SEMIANNUALLY */}
              {needsDayOfMonthPicker && (
                <div>
                  <Label>{isBiMonthly ? 'Select 2 Days of the Month *' : 'Select Day of the Month *'}</Label>
                  <div className="mt-2 grid grid-cols-7 gap-1">
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
                          className={`h-9 w-full rounded-md text-sm font-medium border transition-colors ${
                            isSelected
                              ? 'bg-primary text-white border-primary'
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
                  {formData.recurrenceDaysOfMonth.some(d => d > 28) && (
                    <p className="text-xs text-muted-foreground mt-1">Note: months with fewer days will use the last day of the month.</p>
                  )}
                </div>
              )}

              {/* DAILY / BI-WEEKLY: day-of-week checkboxes */}
              {(formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY') && (
                <div>
                  <Label>{formData.recurrencePatternLabel === 'BI-WEEKLY' ? 'Select Day of the Week *' : 'Select Days *'}</Label>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {daysOfWeek.map((day, index) => {
                      const isSelected = formData.recurrenceDaysOfWeek.includes(index);
                      const isDisabled = formData.recurrencePatternLabel === 'BI-WEEKLY' && !isSelected && formData.recurrenceDaysOfWeek.length >= 1;
                      return (
                        <label
                          key={day}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-primary/10 border-primary/40 text-primary'
                              : isDisabled
                              ? 'border-border bg-muted/50 text-muted-foreground cursor-not-allowed opacity-50'
                              : 'border-border hover:bg-muted text-foreground'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => !isDisabled && toggleDayOfWeek(index)}
                            disabled={isDisabled}
                            className="accent-primary"
                          />
                          <span className="text-sm font-medium">{day}</span>
                        </label>
                      );
                    })}
                  </div>
                  {formData.recurrencePatternLabel === 'BI-WEEKLY' && formData.recurrenceDaysOfWeek.length !== 1 && (
                    <p className="text-xs text-yellow-600 mt-1">Select exactly 1 day of the week.</p>
                  )}
                  {formData.recurrencePatternLabel === 'DAILY' && formData.recurrenceDaysOfWeek.length === 0 && (
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
                <p className="text-xs text-muted-foreground mt-1">
                  The first date occurrences will begin. Events will appear on the calendar from this date onward.
                </p>
                {(formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY') && formData.recurrenceDaysOfWeek.length > 0 && formData.recurrenceStartDate && (() => {
                  const start = new Date(formData.recurrenceStartDate);
                  const upcoming: string[] = [];
                  let d = new Date(start);
                  let count = 0;
                  if (formData.recurrencePatternLabel === 'BI-WEEKLY') {
                    // Every 2 weeks on the selected day
                    while (upcoming.length < 5 && count < 365) {
                      if (formData.recurrenceDaysOfWeek.includes(d.getDay())) {
                        upcoming.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
                        d.setDate(d.getDate() + 14); // skip 2 weeks
                        count += 14;
                        continue;
                      }
                      d.setDate(d.getDate() + 1);
                      count++;
                    }
                  } else {
                    while (upcoming.length < 5 && count < 14) {
                      if (formData.recurrenceDaysOfWeek.includes(d.getDay())) {
                        upcoming.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
                      }
                      d.setDate(d.getDate() + 1);
                      count++;
                    }
                  }
                  return upcoming.length > 0 ? (
                    <div className="mt-2 p-2 bg-primary/10 rounded-md">
                      <p className="text-xs font-semibold text-primary mb-1">First 5 upcoming occurrences:</p>
                      <ul className="text-xs text-primary space-y-0.5">
                        {upcoming.map((d, i) => <li key={i}>• {d}</li>)}
                      </ul>
                    </div>
                  ) : null;
                })()}
                {needsDayOfMonthPicker && formData.recurrenceDaysOfMonth.length > 0 && formData.recurrenceStartDate && (() => {
                  const start = new Date(formData.recurrenceStartDate);
                  start.setHours(9, 0, 0, 0);
                  const upcoming: string[] = [];
                  const cursor = new Date(start);
                  const monthInterval = formData.recurrencePatternLabel === 'QUARTERLY' ? 3
                    : formData.recurrencePatternLabel === 'SEMIANNUALLY' ? 6
                    : formData.recurrencePatternLabel === 'BI-MONTHLY' ? 2 : 1;
                  let iters = 0;
                  while (upcoming.length < 5 && iters < 24) {
                    for (const dom of formData.recurrenceDaysOfMonth) {
                      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
                      const actualDay = Math.min(dom, lastDay);
                      const dt = new Date(cursor.getFullYear(), cursor.getMonth(), actualDay, 9, 0, 0);
                      if (dt >= start && upcoming.length < 5) {
                        upcoming.push(dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
                      }
                    }
                    cursor.setMonth(cursor.getMonth() + monthInterval);
                    iters++;
                  }
                  return upcoming.length > 0 ? (
                    <div className="mt-2 p-2 bg-primary/10 rounded-md">
                      <p className="text-xs font-semibold text-primary mb-1">First {upcoming.length} upcoming occurrences:</p>
                      <ul className="text-xs text-primary space-y-0.5">
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
                <p className="text-xs text-muted-foreground mt-1">
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

          {/* Invoice Schedule — full-featured version mirroring scheduled-invoices/create */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Invoice Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Frequency */}
              <div>
                <Label>Frequency *</Label>
                <div className="mt-1">
                  <SearchableSelect
                    options={RECURRENCE_PATTERN_LABELS.map(l => ({ value: l, label: l }))}
                    value={formData.invoiceRecurrencePatternLabel}
                    onChange={(v) => handleInvoicePatternChange(v as RecurrencePatternLabel)}
                    placeholder="Select frequency..."
                  />
                </div>
              </div>

              {/* Day-of-month picker */}
              {['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(formData.invoiceRecurrencePatternLabel) && (
                <div>
                  <Label>
                    {formData.invoiceRecurrencePatternLabel === 'BI-MONTHLY' ? 'Pick 2 days of the month *' : 'Day of the month *'}
                  </Label>
                  <div className="mt-2 grid grid-cols-7 gap-1">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
                      const isSelected = formData.invoiceDaysOfMonth.includes(day);
                      return (
                        <button key={day} type="button" onClick={() => toggleInvoiceDayOfMonth(day)}
                          className={`h-9 rounded-md text-sm font-medium border transition-colors ${isSelected ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted text-foreground'}`}>
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Day-of-week picker */}
              {(formData.invoiceRecurrencePatternLabel === 'DAILY' || formData.invoiceRecurrencePatternLabel === 'BI-WEEKLY') && (
                <div>
                  <Label>
                    {formData.invoiceRecurrencePatternLabel === 'BI-WEEKLY' ? 'Day of the week *' : 'Days of the week *'}
                  </Label>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-7 gap-2">
                    {DAY_LABELS_SHORT.map((day, idx) => {
                      const isSelected = formData.invoiceDaysOfWeek.includes(idx);
                      return (
                        <button key={day} type="button" onClick={() => toggleInvoiceDayOfWeek(idx)}
                          className={`h-9 rounded-md text-sm font-medium border transition-colors ${isSelected ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted text-foreground'}`}>
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Invoice start date</Label>
                  <Input type="date" className="mt-1" value={formData.invoiceStartDate}
                    onChange={e => setFormData({ ...formData, invoiceStartDate: e.target.value })} />
                </div>
                <div>
                  <Label>Invoice end date <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input type="date" className="mt-1" value={formData.invoiceEndDate}
                    onChange={e => setFormData({ ...formData, invoiceEndDate: e.target.value })} />
                </div>
              </div>

              {/* Preview */}
              {invoicePreviewDates.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/15 p-3">
                  <p className="text-sm font-semibold text-primary mb-2">Next {invoicePreviewDates.length} invoice dates:</p>
                  <ul className="space-y-1">
                    {invoicePreviewDates.map((d, i) => (
                      <li key={i} className="text-sm text-primary">
                        {i + 1}. {d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Time + Timezone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Time of Day</Label>
                  <Input type="time" value={formData.invoiceTime}
                    onChange={(e) => setFormData({ ...formData, invoiceTime: e.target.value })} />
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

              {/* Auto-charge */}
              <div className="pt-3 border-t">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.invoiceAutoCharge}
                    onChange={e => setFormData({ ...formData, invoiceAutoCharge: e.target.checked })}
                    className="mt-1 accent-primary" />
                  <div className="text-sm">
                    <p className="font-medium flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      Auto-charge on each invoice <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Automatically charge the client's saved payment method when each invoice is generated.
                    </p>
                  </div>
                </label>
                {formData.invoiceAutoCharge && selectedClientPMs.length > 0 && (
                  <div className="mt-2 ml-6">
                    <Label>Pay from</Label>
                    <select value={formData.invoiceAutoChargePaymentMethodId}
                      onChange={e => setFormData({ ...formData, invoiceAutoChargePaymentMethodId: e.target.value })}
                      className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Select payment method…</option>
                      {selectedClientPMs.map(pm => (
                        <option key={pm.id} value={pm.id}>
                          {labelForPm(pm)}{pm.id === selectedClientDefaultPMId ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {formData.invoiceAutoCharge && selectedClientPMs.length === 0 && (
                  <p className="mt-2 ml-6 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    This client has no saved payment methods for auto-charge.
                  </p>
                )}
              </div>

              {/* Consolidation (only for DAILY + company has permission) */}
              {formData.invoiceRecurrencePatternLabel === 'DAILY' && invoiceCompanyHasConsolidation && (
                <div className="pt-3 border-t space-y-4">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.invoiceConsolidationEnabled}
                      onChange={e => setFormData({ ...formData, invoiceConsolidationEnabled: e.target.checked })}
                      className="mt-1 accent-primary" />
                    <div className="text-sm">
                      <p className="font-medium flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-primary" />
                        Consolidate daily invoices into one periodic invoice <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Accumulates daily invoices and generates one consolidated invoice at the end of each period.
                      </p>
                    </div>
                  </label>
                  {formData.invoiceConsolidationEnabled && (
                    <>
                      <div>
                        <label className="text-sm font-medium">Consolidation Period *</label>
                        <div className="mt-1 grid grid-cols-3 gap-2">
                          {(['weekly', 'bi-weekly', 'monthly'] as const).map(p => (
                            <button key={p} type="button"
                              onClick={() => setFormData({ ...formData, invoiceConsolidationPeriod: p })}
                              className={`h-9 rounded-md text-sm font-medium border transition-colors ${formData.invoiceConsolidationPeriod === p ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted text-foreground'}`}>
                              {p === 'bi-weekly' ? 'Bi-Weekly' : p.charAt(0).toUpperCase() + p.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {(formData.invoiceConsolidationPeriod === 'weekly' || formData.invoiceConsolidationPeriod === 'bi-weekly') && (
                        <div>
                          <label className="text-sm font-medium">Consolidation Day *</label>
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-7 gap-2">
                            {DAY_LABELS_SHORT.map((day, idx) => (
                              <button key={day} type="button"
                                onClick={() => setFormData({ ...formData, invoiceConsolidationEndDayOfWeek: idx })}
                                className={`h-9 rounded-md text-sm font-medium border transition-colors ${formData.invoiceConsolidationEndDayOfWeek === idx ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted text-foreground'}`}>
                                {day}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={formData.invoiceConsolidationAutoCharge}
                          onChange={e => setFormData({ ...formData, invoiceConsolidationAutoCharge: e.target.checked })}
                          className="mt-1 accent-primary" />
                        <div className="text-sm">
                          <p className="font-medium">Auto-charge the consolidated invoice</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Automatically charge the client when the consolidated invoice is created.
                          </p>
                        </div>
                      </label>
                      {formData.invoiceConsolidationAutoCharge && selectedClientPMs.length > 0 && (
                        <div className="ml-6">
                          <Label>Pay from</Label>
                          <select value={formData.invoiceConsolidationAutoChargePaymentMethodId}
                            onChange={e => setFormData({ ...formData, invoiceConsolidationAutoChargePaymentMethodId: e.target.value })}
                            className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                            <option value="">Select payment method…</option>
                            {selectedClientPMs.map(pm => (
                              <option key={pm.id} value={pm.id}>
                                {labelForPm(pm)}{pm.id === selectedClientDefaultPMId ? ' (default)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
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
                  : formData.recurrencePatternLabel === 'BI-WEEKLY'
                  ? `Every 2 weeks — ${formData.recurrenceDaysOfWeek.length > 0 ? daysOfWeek[formData.recurrenceDaysOfWeek[0]] : 'No day selected'}${formData.recurrenceStartDate ? ` from ${new Date(formData.recurrenceStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`
                  : formData.recurrencePatternLabel === 'BI-MONTHLY'
                  ? `Every 2 months — on the ${formData.recurrenceDaysOfMonth.length > 0 ? getOrdinalSuffixShort(formData.recurrenceDaysOfMonth[0]) : 'No day selected'}`
                  : needsDayOfMonthPicker
                  ? `${formData.recurrencePatternLabel} — on the ${formData.recurrenceDaysOfMonth.length > 0 ? getOrdinalSuffixShort(formData.recurrenceDaysOfMonth[0]) : 'No day selected'}`
                  : `Every ${formData.recurrenceInterval} ${formData.recurrenceType}`}
              </div>
              <div className="text-sm">
                <span className="font-semibold">Invoice Schedule:</span>{' '}
                {formData.invoiceScheduleType === 'bi-monthly'
                  ? `Bi-Monthly (every 2 months) on the ${formData.invoiceScheduleDayOfMonth}${getOrdinalSuffix(formData.invoiceScheduleDayOfMonth)}`
                  : formData.invoiceScheduleType === 'quarterly'
                  ? `Quarterly (every 3 months) on the ${formData.invoiceScheduleDayOfMonth}${getOrdinalSuffix(formData.invoiceScheduleDayOfMonth)}`
                  : formData.invoiceScheduleType === 'semiannually'
                  ? `Semi-Annually (every 6 months) on the ${formData.invoiceScheduleDayOfMonth}${getOrdinalSuffix(formData.invoiceScheduleDayOfMonth)}`
                  : `Every ${formData.invoiceScheduleInterval} month(s) on the ${formData.invoiceScheduleDayOfMonth}${getOrdinalSuffix(formData.invoiceScheduleDayOfMonth)}`}
              </div>
              <div className="text-sm">
                <span className="font-semibold">Invoice Time:</span> {formData.invoiceTime} {formData.timezone}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row">
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
      </PortalListPage>
    </>
  );
}
