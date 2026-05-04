'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { RecurringWorkOrder } from '@/types';
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

interface ClientCalendarProps {
  selectedLocations?: string[];
  onEventClick?: (workOrderId: string) => void;
}

const LEGEND: CalendarLegendItem[] = [
  { slot: 'scheduled',  label: 'Scheduled' },
  { slot: 'pending',    label: 'Pending' },
  { slot: 'completed',  label: 'Completed' },
  { slot: 'recurring',  label: 'Recurring' },
  { slot: 'execution',  label: 'Recurring run' },
  { slot: 'diagnostic', label: 'Diagnostic' },
  { slot: 'quote',      label: 'Quote' },
];

export default function ClientCalendar({ selectedLocations, onEventClick }: ClientCalendarProps) {
  const [workOrders, setWorkOrders] = useState<WorkOrderForCalendar[]>([]);
  const [recurringWorkOrders, setRecurringWorkOrders] = useState<RecurringWorkOrder[]>([]);
  const [quotes, setQuotes] = useState<QuoteLikeForCalendar[]>([]);

  /* ------------------------- Firestore subscriptions ------------------- */
  useEffect(() => {
    let unsubscribeWorkOrders: (() => void) | null = null;
    let unsubscribeRecurring: (() => void) | null = null;
    let unsubscribeQuotes: (() => void) | null = null;

    const setupListeners = async (currentUser: { uid: string }) => {
      try {
        const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
        const clientData = clientDoc.data();
        const assignedLocations = (clientData?.assignedLocations || []) as string[];
        const clientCompanyId = clientData?.companyId as string | undefined;

        if (assignedLocations.length > 0) {
          const batchSize = 10;
          const unsubscribes: (() => void)[] = [];

          for (let i = 0; i < assignedLocations.length; i += batchSize) {
            const batch = assignedLocations.slice(i, i + batchSize);

            const workOrdersQuery = query(
              collection(db, 'workOrders'),
              where('locationId', 'in', batch),
            );
            const unsubscribeWO = onSnapshot(workOrdersQuery, (snapshot) => {
              const batchWorkOrders = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
              })) as WorkOrderForCalendar[];

              setWorkOrders((prev) => {
                const combined = [
                  ...prev.filter(wo => !batch.some(locId => (wo as any).locationId === locId)),
                  ...batchWorkOrders,
                ];
                return Array.from(new Map(combined.map(wo => [wo.id, wo])).values());
              });
            });

            const recurringQuery = query(
              collection(db, 'recurringWorkOrders'),
              where('locationId', 'in', batch),
              where('status', '==', 'active'),
            );
            const unsubscribeRWO = onSnapshot(recurringQuery, (snapshot) => {
              const batchRecurring = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
                nextExecution: d.data().nextExecution?.toDate(),
                createdAt: d.data().createdAt?.toDate(),
                updatedAt: d.data().updatedAt?.toDate(),
              })) as RecurringWorkOrder[];

              setRecurringWorkOrders((prev) => {
                const combined = [
                  ...prev.filter(rwo => !batch.some(locId => rwo.locationId === locId)),
                  ...batchRecurring,
                ];
                return Array.from(new Map(combined.map(rwo => [rwo.id, rwo])).values());
              });
            });

            unsubscribes.push(unsubscribeWO, unsubscribeRWO);
          }

          if (clientCompanyId) {
            const assignedSet = new Set(assignedLocations);
            const companyWorkOrdersQuery = query(
              collection(db, 'workOrders'),
              where('companyId', '==', clientCompanyId),
            );
            const unsubscribeCompanyWO = onSnapshot(companyWorkOrdersQuery, (snapshot) => {
              const companyWos = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
              })) as WorkOrderForCalendar[];
              const filtered = companyWos.filter(
                wo => (wo as any).locationId && assignedSet.has((wo as any).locationId),
              );
              setWorkOrders((prev) => {
                const withoutPeers = prev.filter((wo: any) => {
                  if (wo.clientId === currentUser.uid) return true;
                  if (!clientCompanyId || wo.companyId !== clientCompanyId) return true;
                  if (!wo.locationId || !assignedSet.has(wo.locationId)) return true;
                  return false;
                });
                const combined = [...withoutPeers, ...filtered];
                return Array.from(new Map(combined.map(wo => [wo.id, wo])).values());
              });
            });
            unsubscribes.push(unsubscribeCompanyWO);
          }

          unsubscribeWorkOrders = () => unsubscribes.forEach((u) => u());
        } else {
          // Backward-compat: filter by clientId
          const workOrdersQuery = query(
            collection(db, 'workOrders'),
            where('clientId', '==', currentUser.uid),
          );
          unsubscribeWorkOrders = onSnapshot(workOrdersQuery, (snapshot) => {
            setWorkOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as WorkOrderForCalendar[]);
          });

          const recurringQuery = query(
            collection(db, 'recurringWorkOrders'),
            where('clientId', '==', currentUser.uid),
            where('status', '==', 'active'),
          );
          unsubscribeRecurring = onSnapshot(recurringQuery, (snapshot) => {
            setRecurringWorkOrders(snapshot.docs.map(d => ({
              id: d.id,
              ...d.data(),
              nextExecution: d.data().nextExecution?.toDate(),
              createdAt: d.data().createdAt?.toDate(),
              updatedAt: d.data().updatedAt?.toDate(),
            })) as RecurringWorkOrder[]);
          });
        }
      } catch (error) {
        console.error('Error setting up calendar listeners:', error);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setupListeners(firebaseUser);
        const quotesQuery = query(collection(db, 'quotes'), where('clientId', '==', firebaseUser.uid));
        unsubscribeQuotes = onSnapshot(quotesQuery, (snapshot) => {
          setQuotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as QuoteLikeForCalendar[]);
        });
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeWorkOrders?.();
      unsubscribeRecurring?.();
      unsubscribeQuotes?.();
    };
  }, []);

  /* ------------------------- Build deduped event list ------------------ */
  const events = useMemo(() => {
    let filteredWorkOrders = workOrders.filter(wo => wo.status !== 'archived');
    let filteredRecurring = recurringWorkOrders;

    if (selectedLocations && selectedLocations.length > 0) {
      filteredWorkOrders = filteredWorkOrders.filter(wo =>
        selectedLocations.includes(wo.locationName || ''),
      );
      filteredRecurring = recurringWorkOrders.filter(rwo =>
        selectedLocations.includes(rwo.locationName || ''),
      );
    }

    // 1. Work order events — one per WO doc, no createdAt fallback
    const workOrderEvents = filteredWorkOrders
      .map(wo => buildWorkOrderEvent(wo, 'client'))
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // 2. Recurring template events — single nextExecution per template
    const recurringTemplateEvents = filteredRecurring
      .filter(rwo => rwo.nextExecution)
      .map(rwo => {
        const nextExec = rwo.nextExecution instanceof Date ? rwo.nextExecution : new Date(rwo.nextExecution as any);
        const start = new Date(nextExec); start.setHours(9, 0, 0, 0);
        const end = new Date(start); end.setHours(11, 0, 0, 0);
        const palette = STATUS_PALETTE.recurring;
        return {
          id: `recurring-${rwo.id}`,
          title: `${rwo.title} (Recurring)`,
          start,
          end,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          textColor: palette.text,
          editable: false,
          extendedProps: {
            kind: 'recurringTemplate' as const,
            workOrderId: rwo.id,
            workOrderNumber: rwo.workOrderNumber || rwo.id.slice(-8).toUpperCase(),
            locationName: rwo.locationName || 'Unknown Location',
            locationAddress: formatAddress(rwo.locationAddress),
            status: 'recurring',
            statusSlot: 'recurring' as const,
            category: rwo.category,
            isRecurringTemplate: true,
          },
        };
      });

    // 3. Quote events — only when no scheduled WO already represents them
    const rawQuoteEvents: QuoteCalendarEvent[] = quotes
      .map(q => buildQuoteCalendarEvent(q, 'client'))
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
  }, [workOrders, recurringWorkOrders, quotes, selectedLocations]);

  /* ------------------------- Click handler ----------------------------- */
  const handleEventClick = (clickInfo: any) => {
    const props = clickInfo.event.extendedProps || {};
    const { workOrderId, kind, isDiagnosticQuote, quoteId } = props;
    if (kind === 'quote') {
      window.location.href = isDiagnosticQuote
        ? `/client-portal/diagnostic-requests/${quoteId}`
        : workOrderId
          ? `/client-portal/work-orders/${workOrderId}`
          : '/client-portal/quotes';
      return;
    }
    if (kind === 'recurringTemplate') {
      window.location.href = `/client-portal/recurring-work-orders/${workOrderId}`;
      return;
    }
    if (onEventClick) {
      onEventClick(workOrderId);
    } else {
      window.location.href = `/client-portal/work-orders/${workOrderId}`;
    }
  };

  return (
    <CalendarShell
      title="Calendar"
      subtitle="Your scheduled work orders and recurring jobs"
      events={events}
      onEventClick={handleEventClick}
      legend={LEGEND}
    />
  );
}
