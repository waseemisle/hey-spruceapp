'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, onSnapshot, documentId, Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import {
  buildQuoteCalendarEvent,
  type QuoteLikeForCalendar,
  type QuoteCalendarEvent,
} from '@/lib/calendar-utils';
import {
  buildWorkOrderEvent,
  suppressQuotesWithScheduledWO,
  dedupeEventsByJobDay,
  type WorkOrderForCalendar,
} from '@/lib/calendar-events';
import CalendarShell, { type CalendarLegendItem } from './calendar-shell';

interface AssignedJob {
  id: string;
  workOrderId: string;
  subcontractorId: string;
  status: string;
  scheduledServiceDate?: Timestamp | Date;
  scheduledServiceTime?: string;
  assignedAt?: Timestamp | Date;
}

const LEGEND: CalendarLegendItem[] = [
  { slot: 'scheduled',  label: 'Scheduled' },
  { slot: 'assigned',   label: 'Assigned' },
  { slot: 'pending',    label: 'Pending' },
  { slot: 'completed',  label: 'Completed' },
  { slot: 'diagnostic', label: 'Diagnostic request' },
  { slot: 'quote',      label: 'My quote' },
];

export default function SubcontractorCalendar() {
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [workOrders, setWorkOrders] = useState<Map<string, WorkOrderForCalendar>>(new Map());
  const [quotes, setQuotes] = useState<QuoteLikeForCalendar[]>([]);

  /* ------------------------- Firestore subscriptions ------------------- */
  useEffect(() => {
    let unsubscribeAssigned: (() => void) | null = null;
    let unsubscribeQuotes: (() => void) | null = null;
    const woUnsubs: (() => void)[] = [];

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return;

      const assignedQuery = query(
        collection(db, 'assignedJobs'),
        where('subcontractorId', '==', user.uid),
        where('status', 'in', ['pending_acceptance', 'accepted']),
      );

      unsubscribeAssigned = onSnapshot(assignedQuery, (snapshot) => {
        const assignedData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as AssignedJob[];
        setAssignedJobs(assignedData);

        // Tear down previous WO listeners and re-subscribe in chunks of 10
        woUnsubs.forEach((u) => u());
        woUnsubs.length = 0;

        const allIds = Array.from(new Set(assignedData.map(j => j.workOrderId).filter(Boolean)));
        for (let i = 0; i < allIds.length; i += 10) {
          const chunk = allIds.slice(i, i + 10);
          if (chunk.length === 0) continue;
          const woQuery = query(
            collection(db, 'workOrders'),
            where(documentId(), 'in', chunk),
          );
          const unsub = onSnapshot(woQuery, (woSnapshot) => {
            setWorkOrders((prev) => {
              const next = new Map(prev);
              // Drop WOs from this chunk that aren't in the new snapshot
              chunk.forEach((id) => next.delete(id));
              woSnapshot.docs.forEach((doc) => {
                next.set(doc.id, { id: doc.id, ...doc.data() } as WorkOrderForCalendar);
              });
              return next;
            });
          });
          woUnsubs.push(unsub);
        }
      });

      const quotesQuery = query(collection(db, 'quotes'), where('subcontractorId', '==', user.uid));
      unsubscribeQuotes = onSnapshot(quotesQuery, (snapshot) => {
        setQuotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as QuoteLikeForCalendar[]);
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeAssigned?.();
      unsubscribeQuotes?.();
      woUnsubs.forEach((u) => u());
    };
  }, []);

  /* ------------------------- Build deduped event list ------------------ */
  const events = useMemo(() => {
    // 1) Build a working list of work orders the sub is assigned to. If the
    //    assignedJobs row carries its own scheduled date/time (sub set it
    //    when accepting the assignment), prefer that over the WO's date.
    const assignedWorkOrders: WorkOrderForCalendar[] = [];
    const seenWoIds = new Set<string>();
    for (const job of assignedJobs) {
      const wo = workOrders.get(job.workOrderId);
      if (!wo) continue;
      if (seenWoIds.has(wo.id)) continue; // multiple jobs for same WO → dedupe
      seenWoIds.add(wo.id);

      assignedWorkOrders.push({
        ...wo,
        scheduledServiceDate: job.scheduledServiceDate || wo.scheduledServiceDate,
        scheduledServiceTime: job.scheduledServiceTime || wo.scheduledServiceTime,
      });
    }

    // 2) Map → events (drops WOs without a scheduledServiceDate)
    const workOrderEvents = assignedWorkOrders
      .map(wo => buildWorkOrderEvent(wo, 'subcontractor'))
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // 3) Quote events — suppressed when WO is scheduled / quote was approved
    const rawQuoteEvents: QuoteCalendarEvent[] = quotes
      .map(q => buildQuoteCalendarEvent(q, 'subcontractor'))
      .filter((e): e is QuoteCalendarEvent => e !== null);
    const quoteEvents = suppressQuotesWithScheduledWO(rawQuoteEvents, assignedWorkOrders).map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      backgroundColor: e.backgroundColor,
      borderColor: e.borderColor,
      textColor: e.textColor,
      url: e.url,
      extendedProps: {
        ...e.extendedProps,
        kind: 'quote' as const,
        statusSlot: e.extendedProps.isDiagnosticQuote ? ('diagnostic' as const) : ('quote' as const),
      },
    }));

    return dedupeEventsByJobDay([...workOrderEvents, ...quoteEvents]);
  }, [assignedJobs, workOrders, quotes]);

  const handleEventClick = (clickInfo: any) => {
    const props = clickInfo.event.extendedProps || {};
    if (props.kind === 'quote') {
      window.location.href = '/subcontractor-portal/bidding';
      return;
    }
    window.location.href = '/subcontractor-portal/assigned';
  };

  return (
    <CalendarShell
      title="My Schedule"
      subtitle="Your accepted assignments and active quotes"
      events={events}
      onEventClick={handleEventClick}
      legend={LEGEND}
    />
  );
}
