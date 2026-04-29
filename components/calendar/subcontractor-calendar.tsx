'use client';

import { useEffect, useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { collection, query, where, onSnapshot, Timestamp, documentId } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatAddress } from '@/lib/utils';
import { buildQuoteCalendarEvent, QuoteLikeForCalendar } from '@/lib/calendar-utils';

interface AssignedJob {
  id: string;
  workOrderId: string;
  subcontractorId: string;
  status: string;
  scheduledServiceDate?: Timestamp | Date;
  scheduledServiceTime?: string;
}

interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  title: string;
  locationName: string;
  locationAddress?: string;
  clientName: string;
  status: string;
  scheduledServiceDate?: Timestamp | Date;
  scheduledServiceTime?: string;
  category: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  url?: string;
  extendedProps: {
    workOrderId: string;
    workOrderNumber: string;
    locationName?: string;
    locationAddress?: string;
    clientName?: string;
    status: string;
    category?: string;
    isQuoteEvent?: boolean;
    isDiagnosticQuote?: boolean;
    quoteId?: string;
  };
}

export default function SubcontractorCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [workOrders, setWorkOrders] = useState<Map<string, WorkOrder>>(new Map());
  const [quotes, setQuotes] = useState<QuoteLikeForCalendar[]>([]);
  const [view, setView] = useState<'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'>('dayGridMonth');
  const calendarRef = useRef<FullCalendar>(null);

  useEffect(() => {
    let unsubscribeAssigned: (() => void) | null = null;
    let unsubscribeQuotes: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return;

      // Listen to assigned jobs for this subcontractor
      const assignedQuery = query(
        collection(db, 'assignedJobs'),
        where('subcontractorId', '==', user.uid),
        where('status', 'in', ['pending_acceptance', 'accepted'])
      );

      unsubscribeAssigned = onSnapshot(assignedQuery, (snapshot) => {
        const assignedData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as AssignedJob[];

        setAssignedJobs(assignedData);

        // Listen to work orders
        const workOrderIds = [...new Set(assignedData.map(job => job.workOrderId))];
        if (workOrderIds.length > 0) {
          const workOrdersQuery = query(
            collection(db, 'workOrders'),
            where(documentId(), 'in', workOrderIds.slice(0, 10)) // Firestore limit
          );

          onSnapshot(workOrdersQuery, (woSnapshot) => {
            const workOrdersMap = new Map<string, WorkOrder>();
            woSnapshot.docs.forEach(woDoc => {
              workOrdersMap.set(woDoc.id, { id: woDoc.id, ...woDoc.data() } as WorkOrder);
            });
            setWorkOrders(workOrdersMap);
          });
        }
      });

      // Listen to this subcontractor's submitted quotes / diagnostic requests
      const quotesQuery = query(collection(db, 'quotes'), where('subcontractorId', '==', user.uid));
      unsubscribeQuotes = onSnapshot(quotesQuery, (snapshot) => {
        const quotesData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as QuoteLikeForCalendar[];
        setQuotes(quotesData);
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeAssigned?.();
      unsubscribeQuotes?.();
    };
  }, []);

  useEffect(() => {
    // Convert assigned jobs to calendar events
    const calendarEvents: CalendarEvent[] = assignedJobs
      .map((job): CalendarEvent | null => {
        const workOrder = workOrders.get(job.workOrderId);
        if (!workOrder) return null;
        // Exclude archived work orders from the calendar
        if (workOrder.status === 'archived') return null;

        const scheduledDate = job.scheduledServiceDate instanceof Timestamp
          ? job.scheduledServiceDate.toDate()
          : job.scheduledServiceDate instanceof Date
          ? job.scheduledServiceDate
          : workOrder.scheduledServiceDate instanceof Timestamp
          ? workOrder.scheduledServiceDate.toDate()
          : workOrder.scheduledServiceDate instanceof Date
          ? workOrder.scheduledServiceDate
          : null;

        if (!scheduledDate) {
          // If no scheduled date, use assigned date as fallback
          const assignedDate = (job as any).assignedAt instanceof Timestamp
            ? (job as any).assignedAt.toDate()
            : new Date();
          return {
            id: workOrder.id,
            title: workOrder.title,
            start: assignedDate,
            backgroundColor: getStatusColor(workOrder.status).bg,
            borderColor: getStatusColor(workOrder.status).border,
            textColor: getStatusColor(workOrder.status).text,
            extendedProps: {
              workOrderId: workOrder.id,
              workOrderNumber: workOrder.workOrderNumber || workOrder.id.slice(-8).toUpperCase(),
              locationName: workOrder.locationName,
              locationAddress: formatAddress(workOrder.locationAddress),
              clientName: workOrder.clientName,
              status: workOrder.status,
              category: workOrder.category,
            },
          };
        }

        // Parse time if available
        let startDateTime = new Date(scheduledDate);
        const serviceTime = job.scheduledServiceTime || workOrder.scheduledServiceTime;
        if (serviceTime) {
          const [hours, minutes] = serviceTime.split(':').map(Number);
          startDateTime.setHours(hours, minutes, 0, 0);
        }

        // Estimate end time (default 2 hours)
        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(endDateTime.getHours() + 2);

        return {
          id: workOrder.id,
          title: workOrder.title,
          start: startDateTime,
          end: endDateTime,
          backgroundColor: getStatusColor(workOrder.status).bg,
          borderColor: getStatusColor(workOrder.status).border,
          textColor: getStatusColor(workOrder.status).text,
          extendedProps: {
            workOrderId: workOrder.id,
            workOrderNumber: workOrder.workOrderNumber || workOrder.id.slice(-8).toUpperCase(),
            locationName: workOrder.locationName,
            locationAddress: formatAddress(workOrder.locationAddress),
            clientName: workOrder.clientName,
            status: workOrder.status,
            category: workOrder.category,
          },
        };
      })
      .filter((event): event is CalendarEvent => event !== null);

    const quoteEvents: CalendarEvent[] = quotes
      .map(q => buildQuoteCalendarEvent(q, 'subcontractor'))
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .map(e => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        backgroundColor: e.backgroundColor,
        borderColor: e.borderColor,
        textColor: e.textColor,
        url: e.url,
        extendedProps: {
          workOrderId: e.extendedProps.workOrderId,
          workOrderNumber: e.extendedProps.workOrderNumber,
          status: e.extendedProps.status,
          isQuoteEvent: true,
          isDiagnosticQuote: e.extendedProps.isDiagnosticQuote,
          quoteId: e.extendedProps.quoteId,
        },
      }));

    setEvents([...calendarEvents, ...quoteEvents]);
  }, [assignedJobs, workOrders, quotes]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
      case 'accepted_by_subcontractor':
        return { bg: '#3b82f6', border: '#2563eb', text: '#ffffff' }; // Blue
      case 'pending':
      case 'pending_acceptance':
        return { bg: '#fbbf24', border: '#f59e0b', text: '#ffffff' }; // Yellow
      case 'completed':
        return { bg: '#10b981', border: '#059669', text: '#ffffff' }; // Green
      case 'assigned':
        return { bg: '#06b6d4', border: '#0891b2', text: '#ffffff' }; // Cyan
      default:
        return { bg: '#6b7280', border: '#4b5563', text: '#ffffff' }; // Gray
    }
  };

  const handleEventClick = (clickInfo: any) => {
    const { isQuoteEvent } = clickInfo.event.extendedProps || {};
    window.location.href = isQuoteEvent
      ? '/subcontractor-portal/bidding'
      : '/subcontractor-portal/assigned';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>My Schedule</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={view === 'dayGridMonth' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setView('dayGridMonth');
                calendarRef.current?.getApi().changeView('dayGridMonth');
              }}
            >
              Month
            </Button>
            <Button
              variant={view === 'timeGridWeek' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setView('timeGridWeek');
                calendarRef.current?.getApi().changeView('timeGridWeek');
              }}
            >
              Week
            </Button>
            <Button
              variant={view === 'timeGridDay' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setView('timeGridDay');
                calendarRef.current?.getApi().changeView('timeGridDay');
              }}
            >
              Day
            </Button>
            <Button
              variant={view === 'listWeek' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setView('listWeek');
                calendarRef.current?.getApi().changeView('listWeek');
              }}
            >
              List
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="dayGridMonth"
          events={events}
          eventClick={handleEventClick}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          height="auto"
          eventDisplay="block"
          displayEventTime={false}
          eventContent={(arg) => (
            <div className="px-1 py-0.5 text-xs leading-tight whitespace-normal break-words">
              {arg.event.title}
            </div>
          )}
        />
        </div>
        <style jsx global>{`
          /* Let event titles wrap onto multiple lines instead of truncating */
          .fc .fc-event,
          .fc .fc-daygrid-event,
          .fc .fc-daygrid-block-event,
          .fc .fc-daygrid-block-event .fc-event-main,
          .fc .fc-timegrid-event,
          .fc .fc-timegrid-event .fc-event-main,
          .fc .fc-event-main,
          .fc .fc-event-main-frame,
          .fc .fc-event-title,
          .fc .fc-event-title-container {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
          }
          .fc .fc-daygrid-event-harness,
          .fc .fc-daygrid-day-events,
          .fc .fc-daygrid-day-frame {
            overflow: visible !important;
          }
          .fc .fc-daygrid-day-frame {
            min-height: unset !important;
          }
        `}</style>
      </CardContent>
    </Card>
  );
}

