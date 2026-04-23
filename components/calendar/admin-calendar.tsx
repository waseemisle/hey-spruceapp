'use client';

import { useEffect, useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { RecurringWorkOrder } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatAddress } from '@/lib/utils';
import { toast } from 'sonner';

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
  editable?: boolean;
  url?: string;
  extendedProps: {
    workOrderId: string;
    workOrderNumber: string;
    locationName: string;
    locationAddress: string;
    clientName: string;
    status: string;
    category: string;
    isRecurring?: boolean;
    isRecurringTemplate?: boolean;
  };
}

interface AdminCalendarProps {
  selectedClients?: string[];
  selectedLocations?: string[];
  selectedStatuses?: string[];
  onEventClick?: (workOrderId: string) => void;
  companyId?: string;
  companyClientIds?: string[];
}

export default function AdminCalendar({ selectedClients, selectedLocations, selectedStatuses, onEventClick, companyId, companyClientIds }: AdminCalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [recurringWorkOrders, setRecurringWorkOrders] = useState<RecurringWorkOrder[]>([]);
  const [view, setView] = useState<'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'>('dayGridMonth');
  const calendarRef = useRef<FullCalendar>(null);

  useEffect(() => {
    // Listen to all work orders
    const workOrdersQuery = query(collection(db, 'workOrders'));

    const unsubscribeWorkOrders = onSnapshot(workOrdersQuery, (snapshot) => {
      const workOrdersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as WorkOrder[];

      setWorkOrders(workOrdersData);
    });

    // Listen to active recurring work orders
    const recurringWorkOrdersQuery = query(
      collection(db, 'recurringWorkOrders'),
      where('status', '==', 'active')
    );

    const unsubscribeRecurring = onSnapshot(recurringWorkOrdersQuery, (snapshot) => {
      const recurringData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        nextExecution: doc.data().nextExecution?.toDate(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      })) as RecurringWorkOrder[];

      setRecurringWorkOrders(recurringData);
    });

    return () => {
      unsubscribeWorkOrders();
      unsubscribeRecurring();
    };
  }, []);

  useEffect(() => {
    // Exclude archived work orders from the calendar
    let filteredWorkOrders = workOrders.filter(wo => wo.status !== 'archived');

    // Apply company filter
    if (companyId) {
      filteredWorkOrders = filteredWorkOrders.filter(wo => (wo as any).companyId === companyId);
    }

    if (selectedClients && selectedClients.length > 0) {
      filteredWorkOrders = filteredWorkOrders.filter(wo =>
        selectedClients.includes(wo.clientName)
      );
    }

    if (selectedLocations && selectedLocations.length > 0) {
      filteredWorkOrders = filteredWorkOrders.filter(wo =>
        selectedLocations.includes(wo.locationName)
      );
    }

    if (selectedStatuses && selectedStatuses.length > 0) {
      filteredWorkOrders = filteredWorkOrders.filter(wo =>
        selectedStatuses.includes(wo.status)
      );
    }

    // Convert work orders to calendar events
    const workOrderEvents: CalendarEvent[] = filteredWorkOrders
      .filter(wo => {
        // Show scheduled work orders and other statuses with dates
        return wo.scheduledServiceDate || wo.status === 'scheduled' || wo.status === 'accepted_by_subcontractor' || wo.status === 'assigned';
      })
      .map(wo => {
        const isRecurringExecution = !!(wo as any).isMaintenanceRequestOrder || !!(wo as any).recurringWorkOrderId;
        const scheduledDate = wo.scheduledServiceDate instanceof Timestamp
          ? wo.scheduledServiceDate.toDate()
          : wo.scheduledServiceDate instanceof Date
          ? wo.scheduledServiceDate
          : null;

        const colors = isRecurringExecution
          ? { bg: '#f97316', border: '#ea580c', text: '#ffffff' } // Orange for recurring executions
          : getStatusColor(wo.status);

        const titlePrefix = isRecurringExecution ? '⚡ ' : '';

        if (!scheduledDate) {
          const createdDate = (wo as any).createdAt instanceof Timestamp
            ? (wo as any).createdAt.toDate()
            : new Date();
          return {
            id: wo.id,
            title: `${titlePrefix}${wo.title} - ${wo.clientName}`,
            start: createdDate,
            backgroundColor: colors.bg,
            borderColor: colors.border,
            textColor: colors.text,
            url: `/admin-portal/work-orders/${wo.id}`,
            extendedProps: {
              workOrderId: wo.id,
              workOrderNumber: wo.workOrderNumber || wo.id.slice(-8).toUpperCase(),
              locationName: wo.locationName,
              locationAddress: formatAddress(wo.locationAddress),
              clientName: wo.clientName,
              status: wo.status,
              category: wo.category,
              isRecurring: isRecurringExecution,
            },
          };
        }

        // Parse time if available
        let startDateTime = new Date(scheduledDate);
        if (wo.scheduledServiceTime) {
          const [hours, minutes] = wo.scheduledServiceTime.split(':').map(Number);
          startDateTime.setHours(hours, minutes, 0, 0);
        }

        // Estimate end time (default 2 hours)
        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(endDateTime.getHours() + 2);

        return {
          id: wo.id,
          title: `${titlePrefix}${wo.title} - ${wo.clientName}`,
          start: startDateTime,
          end: endDateTime,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          textColor: colors.text,
          url: `/admin-portal/work-orders/${wo.id}`,
          extendedProps: {
            workOrderId: wo.id,
            workOrderNumber: wo.workOrderNumber || wo.id.slice(-8).toUpperCase(),
            locationName: wo.locationName,
            locationAddress: formatAddress(wo.locationAddress),
            clientName: wo.clientName,
            status: wo.status,
            category: wo.category,
            isRecurring: isRecurringExecution,
          },
        };
      });

    // Convert recurring work orders to calendar events
    const recurringEvents: CalendarEvent[] = [];

    const filteredRecurring = recurringWorkOrders.filter(rwo => {
      if (companyClientIds && companyClientIds.length > 0 && !companyClientIds.includes(rwo.clientId)) return false;
      if (selectedClients && selectedClients.length > 0 && !selectedClients.includes(rwo.clientName)) return false;
      if (selectedLocations && selectedLocations.length > 0 && !selectedLocations.includes(rwo.locationName || '')) return false;
      return true;
    });

    for (const rwo of filteredRecurring) {
      const daysOfWeek: number[] | undefined = (rwo.recurrencePattern as any)?.daysOfWeek;
      const patternStartDate: any = (rwo.recurrencePattern as any)?.startDate;

      if (daysOfWeek && daysOfWeek.length > 0) {
        // DAILY pattern — generate one event per matching day for the next 90 days from start date
        const start = patternStartDate
          ? (patternStartDate instanceof Date ? patternStartDate : patternStartDate?.toDate?.() ?? new Date(patternStartDate))
          : (rwo.nextExecution instanceof Date ? rwo.nextExecution : new Date(rwo.nextExecution));

        const windowStart = new Date(start);
        windowStart.setHours(0, 0, 0, 0);

        const endDate: any = (rwo.recurrencePattern as any)?.endDate;
        const windowEnd = endDate
          ? (endDate instanceof Date ? endDate : endDate?.toDate?.() ?? new Date(endDate))
          : (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d; })();

        const cursor = new Date(windowStart);
        let occurrenceIdx = 0;

        while (cursor <= windowEnd) {
          if (daysOfWeek.includes(cursor.getDay())) {
            const eventStart = new Date(cursor);
            eventStart.setHours(9, 0, 0, 0);
            const eventEnd = new Date(eventStart);
            eventEnd.setHours(11, 0, 0, 0);

            recurringEvents.push({
              id: `recurring-${rwo.id}-${occurrenceIdx}`,
              title: `🔄 ${rwo.title} - ${rwo.clientName}`,
              start: eventStart,
              end: eventEnd,
              backgroundColor: '#7c3aed',
              borderColor: '#6d28d9',
              textColor: '#ffffff',
              editable: false,
              url: `/admin-portal/recurring-work-orders/${rwo.id}`,
              extendedProps: {
                workOrderId: rwo.id,
                workOrderNumber: rwo.workOrderNumber || rwo.id.slice(-8).toUpperCase(),
                locationName: rwo.locationName || 'Unknown Location',
                locationAddress: formatAddress(rwo.locationAddress),
                clientName: rwo.clientName,
                status: 'recurring',
                category: rwo.category,
                isRecurring: true,
                isRecurringTemplate: true,
              },
            });
            occurrenceIdx++;
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        // Non-daily: generate events between startDate and endDate if available
        const patternStart: any = (rwo.recurrencePattern as any)?.startDate;
        const patternEnd: any = (rwo.recurrencePattern as any)?.endDate;
        const interval: number = (rwo.recurrencePattern as any)?.interval || 1;
        const type: string = (rwo.recurrencePattern as any)?.type || 'monthly';
        const dayOfMonth: number = (rwo.recurrencePattern as any)?.dayOfMonth || 1;

        const toDate = (val: any): Date => {
          if (val instanceof Date) return val;
          if (typeof val?.toDate === 'function') return val.toDate();
          return new Date(val);
        };

        const makeEvent = (idx: number, eventStart: Date): CalendarEvent => {
          const eventEnd = new Date(eventStart);
          eventEnd.setHours(11, 0, 0, 0);
          return {
            id: `recurring-${rwo.id}-${idx}`,
            title: `🔄 ${rwo.title} - ${rwo.clientName}`,
            start: new Date(eventStart),
            end: eventEnd,
            backgroundColor: '#7c3aed',
            borderColor: '#6d28d9',
            textColor: '#ffffff',
            editable: false,
            url: `/admin-portal/recurring-work-orders/${rwo.id}`,
            extendedProps: {
              workOrderId: rwo.id,
              workOrderNumber: rwo.workOrderNumber || rwo.id.slice(-8).toUpperCase(),
              locationName: rwo.locationName || 'Unknown Location',
              locationAddress: formatAddress(rwo.locationAddress),
              clientName: rwo.clientName,
              status: 'recurring',
              category: rwo.category,
              isRecurring: true,
              isRecurringTemplate: true,
            },
          };
        };

        if (patternStart && patternEnd) {
          const startDate = toDate(patternStart);
          const endDate = toDate(patternEnd);
          let occurrenceIdx = 0;

          if (type === 'monthly') {
            // First occurrence at dayOfMonth on/after startDate
            let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), dayOfMonth, 9, 0, 0);
            if (cursor < startDate) {
              cursor = new Date(cursor.getFullYear(), cursor.getMonth() + interval, dayOfMonth, 9, 0, 0);
            }
            while (cursor <= endDate) {
              recurringEvents.push(makeEvent(occurrenceIdx, cursor));
              cursor = new Date(cursor.getFullYear(), cursor.getMonth() + interval, dayOfMonth, 9, 0, 0);
              occurrenceIdx++;
            }
          } else if (type === 'weekly') {
            let cursor = new Date(startDate);
            cursor.setHours(9, 0, 0, 0);
            while (cursor <= endDate) {
              recurringEvents.push(makeEvent(occurrenceIdx, cursor));
              cursor = new Date(cursor);
              cursor.setDate(cursor.getDate() + interval * 7);
              occurrenceIdx++;
            }
          }
        } else if (rwo.nextExecution) {
          // Fallback: single nextExecution event
          const nextExec = rwo.nextExecution instanceof Date ? rwo.nextExecution : new Date(rwo.nextExecution);
          const startDateTime = new Date(nextExec);
          startDateTime.setHours(9, 0, 0, 0);
          recurringEvents.push({
            id: `recurring-${rwo.id}`,
            title: `🔄 ${rwo.title} - ${rwo.clientName} (Recurring)`,
            start: startDateTime,
            end: (() => { const e = new Date(startDateTime); e.setHours(11, 0, 0, 0); return e; })(),
            backgroundColor: '#7c3aed',
            borderColor: '#6d28d9',
            textColor: '#ffffff',
            editable: false,
            url: `/admin-portal/recurring-work-orders/${rwo.id}`,
            extendedProps: {
              workOrderId: rwo.id,
              workOrderNumber: rwo.workOrderNumber || rwo.id.slice(-8).toUpperCase(),
              locationName: rwo.locationName || 'Unknown Location',
              locationAddress: formatAddress(rwo.locationAddress),
              clientName: rwo.clientName,
              status: 'recurring',
              category: rwo.category,
              isRecurring: true,
              isRecurringTemplate: true,
            },
          });
        }
      }
    }

    // Combine both event types
    setEvents([...workOrderEvents, ...recurringEvents]);
  }, [workOrders, recurringWorkOrders, selectedClients, selectedLocations, selectedStatuses, companyId, companyClientIds]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
      case 'accepted_by_subcontractor':
        return { bg: '#3b82f6', border: '#2563eb', text: '#ffffff' }; // Blue
      case 'pending':
      case 'approved':
        return { bg: '#fbbf24', border: '#f59e0b', text: '#ffffff' }; // Yellow
      case 'completed':
        return { bg: '#10b981', border: '#059669', text: '#ffffff' }; // Green
      case 'bidding':
        return { bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' }; // Purple
      case 'rejected':
      case 'overdue':
        return { bg: '#ef4444', border: '#dc2626', text: '#ffffff' }; // Red
      case 'assigned':
        return { bg: '#06b6d4', border: '#0891b2', text: '#ffffff' }; // Cyan
      default:
        return { bg: '#6b7280', border: '#4b5563', text: '#ffffff' }; // Gray
    }
  };

  // FullCalendar renders each event as an <a> when `url` is set, so Ctrl/Cmd+Click
  // and middle-click open in a new tab natively. We only intercept the click when a
  // custom onEventClick handler is provided (e.g. to trigger an in-app drawer).
  const handleEventClick = (clickInfo: any) => {
    if (onEventClick) {
      clickInfo.jsEvent.preventDefault();
      const { workOrderId } = clickInfo.event.extendedProps;
      onEventClick(workOrderId);
    }
  };

  // Persist a drag-reschedule back to Firestore. Recurring template events are marked
  // editable:false per-event, so this handler only fires for real workOrders docs
  // (including executions of recurring WOs, which are themselves standard work orders).
  const handleEventDrop = async (dropInfo: any) => {
    const eventId = String(dropInfo.event.id || '');
    const isRecurringTemplateEvent = eventId.startsWith('recurring-') || dropInfo.event.extendedProps?.isRecurringTemplate;

    if (isRecurringTemplateEvent) {
      dropInfo.revert();
      toast.error('Recurring work orders cannot be rescheduled from the calendar. Edit the recurrence pattern instead.');
      return;
    }

    const newStart: Date | null = dropInfo.event.start;
    if (!newStart) {
      dropInfo.revert();
      return;
    }

    // Also sync scheduledServiceTime (HH:mm) so the calendar's render logic — which
    // prefers the time string over the timestamp's hours — stays aligned when a
    // week/day view drag also changes the time.
    const hh = String(newStart.getHours()).padStart(2, '0');
    const mm = String(newStart.getMinutes()).padStart(2, '0');
    const newTimeStr = `${hh}:${mm}`;

    try {
      await updateDoc(doc(db, 'workOrders', eventId), {
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>All Work Orders Calendar</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={view === 'dayGridMonth' ? 'default' : 'outline'}
              size="sm"
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
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="dayGridMonth"
          events={events}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          editable={true}
          eventStartEditable={true}
          eventDurationEditable={false}
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
          /* Allow the day cell itself to grow to fit wrapped event text */
          .fc .fc-daygrid-day-frame {
            min-height: unset !important;
          }
        `}</style>
        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#7c3aed' }} />
            <span>🔄 Recurring WO Template</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#f97316' }} />
            <span>⚡ Recurring WO Execution</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
            <span>Scheduled / Accepted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#06b6d4' }} />
            <span>Assigned</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#10b981' }} />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#fbbf24' }} />
            <span>Pending / Approved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#8b5cf6' }} />
            <span>Bidding</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
            <span>Rejected / Overdue</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

