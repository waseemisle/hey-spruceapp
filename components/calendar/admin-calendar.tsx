'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { RecurringWorkOrder } from '@/types';
import { toast } from 'sonner';
import {
  buildQuoteCalendarEvent,
  type QuoteLikeForCalendar,
  type QuoteCalendarEvent,
} from '@/lib/calendar-utils';
import {
  buildWorkOrderEvent,
  suppressTemplateOccurrencesWithChildren,
  suppressQuotesWithScheduledWO,
  dedupeEventsByJobDay,
  STATUS_PALETTE,
  type WorkOrderForCalendar,
} from '@/lib/calendar-events';
import CalendarShell, { type CalendarLegendItem } from './calendar-shell';
import { formatAddress } from '@/lib/utils';

interface AdminCalendarProps {
  selectedClients?: string[];
  selectedLocations?: string[];
  selectedStatuses?: string[];
  onEventClick?: (workOrderId: string) => void;
  companyId?: string;
  companyClientIds?: string[];
}

const LEGEND: CalendarLegendItem[] = [
  { slot: 'scheduled',  label: 'Scheduled' },
  { slot: 'assigned',   label: 'Assigned' },
  { slot: 'pending',    label: 'Pending' },
  { slot: 'bidding',    label: 'Bidding' },
  { slot: 'completed',  label: 'Completed' },
  { slot: 'rejected',   label: 'Rejected' },
  { slot: 'recurring',  label: 'Recurring template' },
  { slot: 'execution',  label: 'Recurring execution' },
  { slot: 'diagnostic', label: 'Diagnostic' },
  { slot: 'quote',      label: 'Quote' },
];

export default function AdminCalendar({
  selectedClients,
  selectedLocations,
  selectedStatuses,
  onEventClick,
  companyId,
  companyClientIds,
}: AdminCalendarProps) {
  const [workOrders, setWorkOrders] = useState<WorkOrderForCalendar[]>([]);
  const [recurringWorkOrders, setRecurringWorkOrders] = useState<RecurringWorkOrder[]>([]);
  const [quotes, setQuotes] = useState<QuoteLikeForCalendar[]>([]);

  /* ------------------------- Firestore subscriptions ------------------- */
  useEffect(() => {
    const unsubscribeWorkOrders = onSnapshot(
      query(collection(db, 'workOrders')),
      (snapshot) => {
        setWorkOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as WorkOrderForCalendar[]);
      },
    );

    const unsubscribeRecurring = onSnapshot(
      query(collection(db, 'recurringWorkOrders'), where('status', '==', 'active')),
      (snapshot) => {
        setRecurringWorkOrders(snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
          nextExecution: d.data().nextExecution?.toDate(),
          createdAt: d.data().createdAt?.toDate(),
          updatedAt: d.data().updatedAt?.toDate(),
        })) as RecurringWorkOrder[]);
      },
    );

    const unsubscribeQuotes = onSnapshot(
      query(collection(db, 'quotes')),
      (snapshot) => {
        setQuotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as QuoteLikeForCalendar[]);
      },
    );

    return () => {
      unsubscribeWorkOrders();
      unsubscribeRecurring();
      unsubscribeQuotes();
    };
  }, []);

  /* ------------------------- Build deduped event list ------------------ */
  const events = useMemo(() => {
    let filteredWorkOrders = workOrders.filter(wo => wo.status !== 'archived');

    if (companyId) {
      filteredWorkOrders = filteredWorkOrders.filter(wo => (wo as any).companyId === companyId);
    }
    if (selectedClients && selectedClients.length > 0) {
      filteredWorkOrders = filteredWorkOrders.filter(wo =>
        selectedClients.includes(wo.clientName || ''),
      );
    }
    if (selectedLocations && selectedLocations.length > 0) {
      filteredWorkOrders = filteredWorkOrders.filter(wo =>
        selectedLocations.includes(wo.locationName || ''),
      );
    }
    if (selectedStatuses && selectedStatuses.length > 0) {
      filteredWorkOrders = filteredWorkOrders.filter(wo =>
        selectedStatuses.includes(wo.status),
      );
    }

    // 1. Work order events
    const workOrderEvents = filteredWorkOrders
      .map(wo => buildWorkOrderEvent(wo, 'admin'))
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // 2. Recurring template events — expanded over a window
    const filteredRecurring = recurringWorkOrders.filter((rwo) => {
      if (companyClientIds && companyClientIds.length > 0 && !companyClientIds.includes(rwo.clientId)) return false;
      if (selectedClients && selectedClients.length > 0 && !selectedClients.includes(rwo.clientName)) return false;
      if (selectedLocations && selectedLocations.length > 0 && !selectedLocations.includes(rwo.locationName || '')) return false;
      return true;
    });

    const recurringTemplateEvents = expandRecurringTemplates(filteredRecurring);

    // 3. Quote events — suppressed when WO is already scheduled / quote was approved
    let filteredQuotes = quotes;
    if (companyClientIds && companyClientIds.length > 0) {
      const allowed = new Set(companyClientIds);
      filteredQuotes = filteredQuotes.filter(q => (q as any).clientId && allowed.has((q as any).clientId));
    }
    if (selectedClients && selectedClients.length > 0) {
      filteredQuotes = filteredQuotes.filter(q => q.clientName && selectedClients.includes(q.clientName));
    }
    const rawQuoteEvents: QuoteCalendarEvent[] = filteredQuotes
      .map(q => buildQuoteCalendarEvent(q, 'admin'))
      .filter((e): e is QuoteCalendarEvent => e !== null);
    const quoteEvents = suppressQuotesWithScheduledWO(rawQuoteEvents, filteredWorkOrders).map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      backgroundColor: e.backgroundColor,
      borderColor: e.borderColor,
      textColor: e.textColor,
      url: e.url,
      editable: false,
      extendedProps: {
        ...e.extendedProps,
        kind: 'quote' as const,
        statusSlot: e.extendedProps.isDiagnosticQuote ? ('diagnostic' as const) : ('quote' as const),
      },
    }));

    // 4. Suppress template events that already have a child WO at the same date
    const dedupedTemplates = suppressTemplateOccurrencesWithChildren(
      recurringTemplateEvents,
      filteredWorkOrders,
    );

    // 5. Final safety pass — dedupe by (workOrderId, day)
    return dedupeEventsByJobDay([
      ...workOrderEvents,
      ...dedupedTemplates,
      ...quoteEvents,
    ]);
  }, [workOrders, recurringWorkOrders, quotes, selectedClients, selectedLocations, selectedStatuses, companyId, companyClientIds]);

  /* ------------------------- Click handler ----------------------------- */
  const handleEventClick = (clickInfo: any) => {
    const props = clickInfo.event.extendedProps || {};
    const kind = props.kind;
    if (kind === 'recurringTemplate') {
      // Open the recurring series detail page
      window.location.href = `/admin-portal/recurring-work-orders/${props.workOrderId}`;
      clickInfo.jsEvent.preventDefault();
      return;
    }
    if (onEventClick) {
      clickInfo.jsEvent.preventDefault();
      onEventClick(props.workOrderId);
    }
  };

  /* ------------------------- Drag-to-reschedule ------------------------ */
  const handleEventDrop = async (dropInfo: any) => {
    const props = dropInfo.event.extendedProps || {};
    const kind = props.kind;
    if (kind === 'recurringTemplate') {
      dropInfo.revert();
      toast.error('Recurring work orders cannot be rescheduled from the calendar. Edit the recurrence pattern instead.');
      return;
    }
    if (kind === 'quote') {
      dropInfo.revert();
      toast.error('Quote / Diagnostic Request times cannot be rescheduled from the calendar.');
      return;
    }

    const newStart: Date | null = dropInfo.event.start;
    if (!newStart) { dropInfo.revert(); return; }

    const hh = String(newStart.getHours()).padStart(2, '0');
    const mm = String(newStart.getMinutes()).padStart(2, '0');
    const newTimeStr = `${hh}:${mm}`;

    try {
      await updateDoc(doc(db, 'workOrders', String(dropInfo.event.id)), {
        scheduledServiceDate: newStart,
        scheduledServiceTime: newTimeStr,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Rescheduled to ${newStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
    } catch (error) {
      console.error('Failed to reschedule work order:', error);
      dropInfo.revert();
      toast.error('Failed to reschedule work order');
    }
  };

  return (
    <CalendarShell
      title="All Work Orders Calendar"
      subtitle="Drag any scheduled work order tile to reschedule"
      events={events}
      onEventClick={handleEventClick}
      onEventDrop={handleEventDrop}
      editable
      legend={LEGEND}
    />
  );
}

/* ====================================================================== */
/*  Recurring template expansion                                           */
/* ====================================================================== */

function expandRecurringTemplates(filteredRecurring: RecurringWorkOrder[]) {
  const events: any[] = [];
  const palette = STATUS_PALETTE.recurring;

  const baseEvent = (rwo: RecurringWorkOrder, idx: number, eventStart: Date) => {
    const eventEnd = new Date(eventStart); eventEnd.setHours(11, 0, 0, 0);
    return {
      id: `recurring-${rwo.id}-${idx}`,
      title: `${rwo.title} — ${rwo.clientName}`,
      start: new Date(eventStart),
      end: eventEnd,
      backgroundColor: palette.bg,
      borderColor: palette.border,
      textColor: palette.text,
      editable: false,
      url: `/admin-portal/recurring-work-orders/${rwo.id}`,
      extendedProps: {
        kind: 'recurringTemplate' as const,
        workOrderId: rwo.id,
        workOrderNumber: rwo.workOrderNumber || rwo.id.slice(-8).toUpperCase(),
        locationName: rwo.locationName || 'Unknown Location',
        locationAddress: formatAddress(rwo.locationAddress),
        clientName: rwo.clientName,
        status: 'recurring',
        statusSlot: 'recurring' as const,
        category: rwo.category,
        isRecurringTemplate: true,
      },
    };
  };

  const toJsDate = (val: any): Date => {
    if (val instanceof Date) return val;
    if (typeof val?.toDate === 'function') return val.toDate();
    return new Date(val);
  };

  for (const rwo of filteredRecurring) {
    const pattern = (rwo.recurrencePattern as any) || {};
    const daysOfWeek: number[] | undefined = pattern.daysOfWeek;
    const patternStart: any = pattern.startDate;
    const patternEnd: any = pattern.endDate;
    const interval: number = pattern.interval || 1;
    const type: string = pattern.type || 'monthly';
    const dayOfMonth: number = pattern.dayOfMonth || 1;

    if (daysOfWeek && daysOfWeek.length > 0) {
      // Daily / weekly-by-DOW
      const start = patternStart
        ? toJsDate(patternStart)
        : (rwo.nextExecution ? toJsDate(rwo.nextExecution) : new Date());
      const windowStart = new Date(start); windowStart.setHours(0, 0, 0, 0);
      const windowEnd = patternEnd
        ? toJsDate(patternEnd)
        : (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d; })();

      const cursor = new Date(windowStart);
      let occurrenceIdx = 0;
      while (cursor <= windowEnd) {
        if (daysOfWeek.includes(cursor.getDay())) {
          const eventStart = new Date(cursor); eventStart.setHours(9, 0, 0, 0);
          events.push(baseEvent(rwo, occurrenceIdx, eventStart));
          occurrenceIdx++;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (patternStart && patternEnd) {
      const startDate = toJsDate(patternStart);
      const endDate = toJsDate(patternEnd);
      let occurrenceIdx = 0;
      if (type === 'monthly') {
        let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), dayOfMonth, 9, 0, 0);
        if (cursor < startDate) {
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + interval, dayOfMonth, 9, 0, 0);
        }
        while (cursor <= endDate) {
          events.push(baseEvent(rwo, occurrenceIdx, cursor));
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + interval, dayOfMonth, 9, 0, 0);
          occurrenceIdx++;
        }
      } else if (type === 'weekly') {
        let cursor = new Date(startDate); cursor.setHours(9, 0, 0, 0);
        while (cursor <= endDate) {
          events.push(baseEvent(rwo, occurrenceIdx, cursor));
          cursor = new Date(cursor); cursor.setDate(cursor.getDate() + interval * 7);
          occurrenceIdx++;
        }
      }
    } else if (rwo.nextExecution) {
      const nextExec = toJsDate(rwo.nextExecution);
      const start = new Date(nextExec); start.setHours(9, 0, 0, 0);
      events.push(baseEvent(rwo, 0, start));
    }
  }

  return events;
}
