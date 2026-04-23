'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, getDoc, updateDoc, serverTimestamp, orderBy, where, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Save, Calendar, Clock, RotateCcw,
  ChevronDown, ChevronUp, Settings, AlertCircle,
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
  uid?: string;
  fullName: string;
  email: string;
}

interface RecurringWorkOrderEditFormProps {
  id: string;
  onSaved?: () => void;
  onCancel?: () => void;
}

export default function RecurringWorkOrderEditForm({ id, onSaved, onCancel }: RecurringWorkOrderEditFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvancedRecurrence, setShowAdvancedRecurrence] = useState(false);
  const [recurringWorkOrder, setRecurringWorkOrder] = useState<RecurringWorkOrder | null>(null);

  const RECURRENCE_PATTERN_OPTIONS = ['DAILY', 'WEEKLY', 'BI-WEEKLY', 'BI-MONTHLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'] as const;

  const [formData, setFormData] = useState({
    clientId: '',
    companyId: '',
    locationId: '',
    title: '',
    description: '',
    category: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    status: 'active' as 'active' | 'paused' | 'cancelled',
    estimateBudget: '',
    subcontractorId: '',
    nextExecution: '',
    recurrencePatternLabel: 'MONTHLY' as (typeof RECURRENCE_PATTERN_OPTIONS)[number],
    recurrenceType: 'monthly' as 'daily' | 'weekly' | 'monthly',
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: [] as number[],
    recurrenceDaysOfMonth: [] as number[],
    recurrenceStartDate: '',
    recurrenceEndDate: '',
    recurrenceMaxOccurrences: '',
    invoiceScheduleType: 'monthly' as 'monthly' | 'bi-monthly' | 'quarterly' | 'semiannually',
    invoiceScheduleInterval: 1,
    invoiceScheduleDayOfMonth: 1,
    invoiceTime: '09:00',
    timezone: 'America/New_York',
  });

  const fetchRecurringWorkOrder = async () => {
    try {
      const docRef = doc(db, 'recurringWorkOrders', id);
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

        const toDateStr = (v: any): string => {
          if (!v) return '';
          try {
            const d = v?.toDate ? v.toDate() : new Date(v);
            return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
          } catch { return ''; }
        };

        const pattern = recurringWorkOrderData.recurrencePattern;
        const invoice = recurringWorkOrderData.invoiceSchedule;
        const storedLabel = (recurringWorkOrderData as any).recurrencePatternLabel;
        let recurrencePatternLabel: (typeof RECURRENCE_PATTERN_OPTIONS)[number] = 'MONTHLY';
        if (storedLabel && RECURRENCE_PATTERN_OPTIONS.includes(storedLabel as any)) {
          recurrencePatternLabel = storedLabel as (typeof RECURRENCE_PATTERN_OPTIONS)[number];
        } else if (pattern) {
          if (pattern.type === 'daily' || (pattern.type === 'weekly' && pattern.interval === 1 && Array.isArray(pattern.daysOfWeek))) recurrencePatternLabel = 'DAILY';
          else if (pattern.type === 'weekly' && pattern.interval === 1) recurrencePatternLabel = 'WEEKLY';
          else if (pattern.type === 'weekly' && pattern.interval === 2) recurrencePatternLabel = 'BI-WEEKLY';
          else if (pattern.type === 'monthly' && pattern.interval === 6) recurrencePatternLabel = 'SEMIANNUALLY';
          else if (pattern.type === 'monthly' && pattern.interval === 3) recurrencePatternLabel = 'QUARTERLY';
          else if (pattern.type === 'monthly' && pattern.interval === 2) recurrencePatternLabel = 'BI-MONTHLY';
          else if (pattern.type === 'monthly' && pattern.interval === 1) recurrencePatternLabel = 'MONTHLY';
        }

        const normalizedFromLabel = ((): { type: 'daily' | 'weekly' | 'monthly'; interval: number } => {
          switch (recurrencePatternLabel) {
            case 'DAILY':        return { type: 'weekly', interval: 1 };
            case 'WEEKLY':       return { type: 'weekly', interval: 1 };
            case 'BI-WEEKLY':    return { type: 'weekly', interval: 2 };
            case 'MONTHLY':      return { type: 'monthly', interval: 1 };
            case 'BI-MONTHLY':   return { type: 'monthly', interval: 2 };
            case 'QUARTERLY':    return { type: 'monthly', interval: 3 };
            case 'SEMIANNUALLY': return { type: 'monthly', interval: 6 };
          }
        })();

        setFormData({
          clientId: recurringWorkOrderData.clientId || '',
          companyId: (recurringWorkOrderData as any).companyId || '',
          locationId: recurringWorkOrderData.locationId || '',
          title: recurringWorkOrderData.title || '',
          description: recurringWorkOrderData.description || '',
          category: recurringWorkOrderData.category || '',
          priority: recurringWorkOrderData.priority || 'medium',
          status: (recurringWorkOrderData.status as any) || 'active',
          estimateBudget: recurringWorkOrderData.estimateBudget?.toString() || '',
          subcontractorId: (recurringWorkOrderData as any).subcontractorId || '',
          nextExecution: toDateStr(recurringWorkOrderData.nextExecution),
          recurrencePatternLabel,
          recurrenceType: normalizedFromLabel.type,
          recurrenceInterval: normalizedFromLabel.interval,
          recurrenceDaysOfWeek: Array.isArray(pattern?.daysOfWeek) ? pattern.daysOfWeek : [],
          recurrenceDaysOfMonth: Array.isArray(pattern?.daysOfMonth) ? pattern.daysOfMonth : (pattern?.dayOfMonth ? [pattern.dayOfMonth] : []),
          recurrenceStartDate: toDateStr(pattern?.startDate),
          recurrenceEndDate: toDateStr(pattern?.endDate),
          recurrenceMaxOccurrences: pattern?.maxOccurrences?.toString() || '',
          invoiceScheduleType: invoice?.type || 'monthly',
          invoiceScheduleInterval: invoice?.interval || 1,
          invoiceScheduleDayOfMonth: invoice?.dayOfMonth || 1,
          invoiceTime: invoice?.time || '09:00',
          timezone: invoice?.timezone || 'America/New_York',
        });
      } else {
        toast.error('Recurring work order not found');
        onCancel?.();
      }
    } catch (error) {
      console.error('Error fetching recurring work order:', error);
      toast.error('Failed to load recurring work order');
    }
  };

  const fetchClients = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, 'clients')));
      setClients(snapshot.docs.map(d => ({
        id: d.id,
        fullName: d.data().fullName,
        email: d.data().email,
      })) as Client[]);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, 'locations')));
      setLocations(snapshot.docs.map(d => ({
        id: d.id,
        clientId: d.data().clientId,
        companyId: d.data().companyId,
        locationName: d.data().locationName,
        address: d.data().address,
      })) as Location[]);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchCompanies = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, 'companies')));
      setCompanies(snapshot.docs.map(d => ({
        id: d.id,
        name: d.data().name,
        clientId: d.data().clientId,
      })) as Company[]);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, 'categories'), orderBy('name', 'asc')));
      setCategories(snapshot.docs.map(d => ({ id: d.id, name: d.data().name })) as Category[]);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchSubcontractors = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, 'subcontractors'), where('status', '==', 'approved')));
      setSubcontractors(snapshot.docs.map(d => ({
        id: d.id,
        uid: d.data().uid,
        fullName: d.data().fullName,
        email: d.data().email,
      })) as Subcontractor[]);
    } catch (error) {
      console.error('Error fetching subcontractors:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const needsDayOfMonthPicker = ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(formData.recurrencePatternLabel);

  const handleSubmit = async () => {
    if (!formData.clientId || !formData.companyId || !formData.locationId || !formData.title || !formData.description || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (formData.recurrencePatternLabel === 'BI-WEEKLY' && formData.recurrenceDaysOfWeek.length !== 1) {
      toast.error('Please select exactly 1 day of the week for the bi-weekly (every 2 weeks) recurrence');
      return;
    }
    if (formData.recurrencePatternLabel === 'DAILY' && formData.recurrenceDaysOfWeek.length === 0) {
      toast.error('Please select at least one day for the daily recurrence');
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

      const now = new Date();
      let nextExecution: Date;
      if (formData.nextExecution) {
        nextExecution = new Date(formData.nextExecution);
        nextExecution.setHours(9, 0, 0, 0);
      } else if (
        (formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY') &&
        formData.recurrenceStartDate &&
        formData.recurrenceDaysOfWeek.length > 0
      ) {
        const startDate = new Date(formData.recurrenceStartDate);
        startDate.setHours(9, 0, 0, 0);
        let candidate = new Date(startDate);
        for (let i = 0; i < 7; i++) {
          if (formData.recurrenceDaysOfWeek.includes(candidate.getDay())) break;
          candidate.setDate(candidate.getDate() + 1);
        }
        nextExecution = candidate;
      } else if (needsDayOfMonthPicker && formData.recurrenceDaysOfMonth.length > 0 && formData.recurrenceStartDate) {
        const startDate = new Date(formData.recurrenceStartDate);
        startDate.setHours(9, 0, 0, 0);
        const sorted = [...formData.recurrenceDaysOfMonth].sort((a, b) => a - b);
        let found: Date | null = null;
        for (const dom of sorted) {
          const lastDay = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
          const actualDay = Math.min(dom, lastDay);
          if (actualDay >= startDate.getDate()) {
            found = new Date(startDate.getFullYear(), startDate.getMonth(), actualDay, 9, 0, 0);
            break;
          }
        }
        if (!found) {
          const monthInterval = formData.recurrencePatternLabel === 'QUARTERLY' ? 3
            : formData.recurrencePatternLabel === 'SEMIANNUALLY' ? 6
            : formData.recurrencePatternLabel === 'BI-MONTHLY' ? 2 : 1;
          const nextMonth = new Date(startDate);
          nextMonth.setMonth(nextMonth.getMonth() + monthInterval);
          const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
          found = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(sorted[0], lastDay), 9, 0, 0);
        }
        nextExecution = found;
      } else if (formData.recurrenceStartDate) {
        nextExecution = new Date(formData.recurrenceStartDate);
        nextExecution.setHours(9, 0, 0, 0);
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

      const invoiceSchedule: InvoiceSchedule = {
        type: formData.invoiceScheduleType,
        interval: formData.invoiceScheduleType === 'bi-monthly' ? 2
          : formData.invoiceScheduleType === 'quarterly' ? 3
          : formData.invoiceScheduleType === 'semiannually' ? 6
          : formData.invoiceScheduleInterval,
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
        status: formData.status,
        estimateBudget: formData.estimateBudget ? parseFloat(formData.estimateBudget) : null,
        recurrencePattern,
        recurrencePatternLabel: formData.recurrencePatternLabel,
        invoiceSchedule,
        nextExecution,
        updatedAt: serverTimestamp(),
      };

      if (formData.subcontractorId) {
        const subcontractor = subcontractors.find(s => s.id === formData.subcontractorId);
        if (subcontractor) {
          const subAuthId = (subcontractor.uid && String(subcontractor.uid).trim()) || subcontractor.id;
          updateData.subcontractorId = formData.subcontractorId;
          updateData.subcontractorName = subcontractor.fullName;
          updateData.subcontractorEmail = subcontractor.email || '';
          updateData.preAssignedSubcontractorId = subAuthId;
          updateData.preAssignedSubcontractorName = subcontractor.fullName;
          updateData.preAssignedSubcontractorEmail = subcontractor.email || '';
        }
      } else {
        updateData.subcontractorId = null;
        updateData.subcontractorName = null;
        updateData.subcontractorEmail = null;
        updateData.preAssignedSubcontractorId = null;
        updateData.preAssignedSubcontractorName = null;
        updateData.preAssignedSubcontractorEmail = null;
      }

      await updateDoc(doc(db, 'recurringWorkOrders', id), updateData);

      // Clean up stale pending executions when the pattern changes
      const originalLabel = (recurringWorkOrder as any)?.recurrencePatternLabel;
      const originalPattern = recurringWorkOrder?.recurrencePattern as any;
      const patternChanged =
        originalLabel !== formData.recurrencePatternLabel ||
        JSON.stringify(originalPattern?.daysOfWeek || []) !== JSON.stringify(recurrencePattern.daysOfWeek || []) ||
        JSON.stringify(originalPattern?.daysOfMonth || []) !== JSON.stringify(recurrencePattern.daysOfMonth || []) ||
        (originalPattern?.startDate ? new Date(originalPattern.startDate?.toDate?.() ?? originalPattern.startDate).toDateString() : '') !==
          (formData.recurrenceStartDate ? new Date(formData.recurrenceStartDate).toDateString() : '');

      if (patternChanged) {
        try {
          const execsSnap = await getDocs(
            query(collection(db, 'recurringWorkOrderExecutions'), where('recurringWorkOrderId', '==', id))
          );
          const stale = execsSnap.docs.filter((d) => {
            const data = d.data() as any;
            return !data.workOrderId && data.status !== 'executed' && data.status !== 'failed';
          });
          await Promise.all(stale.map((d) => deleteDoc(doc(db, 'recurringWorkOrderExecutions', d.id))));
        } catch (cleanupError) {
          console.error('Failed to clean up stale executions after pattern change:', cleanupError);
        }
      }

      toast.success('Recurring work order updated successfully');
      onSaved?.();
    } catch (error: any) {
      console.error('Error updating recurring work order:', error);
      toast.error(error.message || 'Failed to update recurring work order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompanySelect = (companyId: string) => {
    setFormData((prev) => ({ ...prev, companyId, locationId: '' }));
  };

  const handleLocationSelect = (locationId: string) => {
    setFormData((prev) => ({ ...prev, locationId }));
  };

  const handleRecurrencePatternChange = (label: (typeof RECURRENCE_PATTERN_OPTIONS)[number]) => {
    let type: 'monthly' | 'weekly' = 'monthly';
    let interval = 1;
    if (label === 'DAILY') { type = 'weekly'; interval = 1; }
    else if (label === 'SEMIANNUALLY') { type = 'monthly'; interval = 6; }
    else if (label === 'QUARTERLY') { type = 'monthly'; interval = 3; }
    else if (label === 'MONTHLY') { type = 'monthly'; interval = 1; }
    else if (label === 'BI-MONTHLY') { type = 'monthly'; interval = 2; }
    else if (label === 'WEEKLY') { type = 'weekly'; interval = 1; }
    else if (label === 'BI-WEEKLY') { type = 'weekly'; interval = 2; }
    setFormData({
      ...formData,
      recurrencePatternLabel: label,
      recurrenceType: type,
      recurrenceInterval: interval,
      recurrenceDaysOfWeek: (label === 'DAILY' || label === 'BI-WEEKLY') ? formData.recurrenceDaysOfWeek : [],
      recurrenceDaysOfMonth: ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label) ? formData.recurrenceDaysOfMonth : [],
      nextExecution: '',
    });
  };

  const toggleDayOfWeek = (day: number) => {
    const days = formData.recurrenceDaysOfWeek;
    if (days.includes(day)) {
      setFormData({ ...formData, recurrenceDaysOfWeek: days.filter(d => d !== day), nextExecution: '' });
    } else {
      setFormData({ ...formData, recurrenceDaysOfWeek: [...days, day], nextExecution: '' });
    }
  };

  const toggleDayOfMonth = (day: number) => {
    const days = formData.recurrenceDaysOfMonth;
    if (days.includes(day)) {
      setFormData({ ...formData, recurrenceDaysOfMonth: days.filter(d => d !== day), nextExecution: '' });
    } else {
      setFormData({ ...formData, recurrenceDaysOfMonth: [...days, day].sort((a, b) => a - b), nextExecution: '' });
    }
  };

  const getOrdinalSuffixShort = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const filteredCompanies = companies;
  const filteredLocations = locations.filter((location) => {
    if (formData.companyId) return location.companyId === formData.companyId;
    if (formData.clientId) return location.clientId === formData.clientId;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!recurringWorkOrder) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Recurring work order not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
                  ...clients.map((client) => ({ value: client.id, label: `${client.fullName} (${client.email})` })),
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
                  ...filteredLocations.map((location) => ({ value: location.id, label: location.locationName })),
                ]}
                placeholder="Choose a location..."
                aria-label="Location"
                disabled={!formData.companyId}
              />
              {formData.companyId && filteredLocations.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">No locations found for the selected company.</p>
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
              <Label>Status *</Label>
              <SearchableSelect
                className="mt-1 w-full"
                value={formData.status}
                onValueChange={(v) => setFormData({ ...formData, status: v as typeof formData.status })}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'paused', label: 'Paused' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
                placeholder="Status"
                aria-label="Status"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Paused/Cancelled recurring work orders won&apos;t be picked up by the daily cron.
              </p>
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
              <Label>Pre-assigned Subcontractor</Label>
              <SearchableSelect
                className="mt-1 w-full"
                value={formData.subcontractorId}
                onValueChange={(v) => setFormData({ ...formData, subcontractorId: v })}
                options={[
                  { value: '', label: 'Select subcontractor...' },
                  ...subcontractors.map((sub) => ({ value: sub.id, label: `${sub.fullName} (${sub.email})` })),
                ]}
                placeholder="Select subcontractor..."
                aria-label="Pre-assigned subcontractor"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Auto-shared for bidding on every execution generated from this recurring work order.
              </p>
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
                onValueChange={(v) => handleRecurrencePatternChange(v as (typeof RECURRENCE_PATTERN_OPTIONS)[number])}
                options={RECURRENCE_PATTERN_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                placeholder="Recurrence pattern"
                aria-label="Recurrence pattern"
              />
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

            {needsDayOfMonthPicker && (
              <div>
                <Label>Select Day of the Month *</Label>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                    const isSelected = formData.recurrenceDaysOfMonth.includes(day);
                    const isDisabled = !isSelected && formData.recurrenceDaysOfMonth.length >= 1;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => !isDisabled && toggleDayOfMonth(day)}
                        disabled={isDisabled}
                        className={`h-9 w-full rounded-md text-sm font-medium border transition-colors ${
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
                {formData.recurrenceDaysOfMonth.length === 0 && (
                  <p className="text-xs text-yellow-600 mt-1">Select a day of the month.</p>
                )}
                {formData.recurrenceDaysOfMonth.some(d => d > 28) && (
                  <p className="text-xs text-muted-foreground mt-1">Note: months with fewer days will use the last day of the month.</p>
                )}
              </div>
            )}

            {(formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY') && (
              <div>
                <Label>{formData.recurrencePatternLabel === 'BI-WEEKLY' ? 'Select Day of the Week *' : 'Select Days *'}</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {daysOfWeek.map((day, index) => {
                    const isSelected = formData.recurrenceDaysOfWeek.includes(index);
                    const isDisabled = formData.recurrencePatternLabel === 'BI-WEEKLY' && !isSelected && formData.recurrenceDaysOfWeek.length >= 1;
                    return (
                      <label
                        key={day}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50 border-blue-400 text-blue-700'
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
                          className="accent-blue-600"
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

            <div>
              <Label>Starting Date</Label>
              <Input
                type="date"
                value={formData.recurrenceStartDate}
                onChange={(e) => setFormData({ ...formData, recurrenceStartDate: e.target.value, nextExecution: '' })}
              />
              <p className="text-xs text-muted-foreground mt-1">The first date occurrences will begin. Events will appear on the calendar from this date onward.</p>

              {(formData.recurrencePatternLabel === 'DAILY' || formData.recurrencePatternLabel === 'BI-WEEKLY') && formData.recurrenceDaysOfWeek.length > 0 && formData.recurrenceStartDate && (() => {
                const start = new Date(formData.recurrenceStartDate);
                const upcoming: string[] = [];
                let d = new Date(start);
                let count = 0;
                if (formData.recurrencePatternLabel === 'BI-WEEKLY') {
                  while (upcoming.length < 5 && count < 365) {
                    if (formData.recurrenceDaysOfWeek.includes(d.getDay())) {
                      upcoming.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
                      d.setDate(d.getDate() + 14);
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
                  <div className="mt-2 p-2 bg-blue-50 rounded-md">
                    <p className="text-xs font-semibold text-blue-700 mb-1">First 5 upcoming occurrences:</p>
                    <ul className="text-xs text-blue-600 space-y-0.5">
                      {upcoming.map((dt, i) => <li key={i}>• {dt}</li>)}
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
                  <div className="mt-2 p-2 bg-blue-50 rounded-md">
                    <p className="text-xs font-semibold text-blue-700 mb-1">First {upcoming.length} upcoming occurrences:</p>
                    <ul className="text-xs text-blue-600 space-y-0.5">
                      {upcoming.map((dt, i) => <li key={i}>• {dt}</li>)}
                    </ul>
                  </div>
                ) : null;
              })()}
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
              <Label>Next Execution Date (optional override)</Label>
              <Input
                type="date"
                value={formData.nextExecution}
                onChange={(e) => setFormData({ ...formData, nextExecution: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank to recompute automatically from the pattern and starting date. Set a date only to manually override when the next work order will be created.
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
              <SearchableSelect
                className="mt-1 w-full"
                value={formData.invoiceScheduleType}
                onValueChange={(v) => setFormData({ ...formData, invoiceScheduleType: v as typeof formData.invoiceScheduleType })}
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'bi-monthly', label: 'Bi-Monthly (every 2 months)' },
                  { value: 'quarterly', label: 'Quarterly (every 3 months)' },
                  { value: 'semiannually', label: 'Semi-Annually (every 6 months)' },
                ]}
                placeholder="Select schedule..."
                aria-label="Invoice schedule"
              />
            </div>

            {formData.invoiceScheduleType === 'monthly' && (
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
            )}

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
              <span className="font-semibold">Status:</span> {formData.status.toUpperCase()}
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
        <Button className="flex-1" onClick={handleSubmit} loading={submitting} disabled={submitting}>
          <Save className="h-4 w-4 mr-2" />
          {submitting ? 'Updating...' : 'Update Recurring Work Order'}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
