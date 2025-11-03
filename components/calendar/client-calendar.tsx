'use client';

import { useEffect, useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { RecurringWorkOrder } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatAddress } from '@/lib/utils';

interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  title: string;
  locationName: string;
  locationAddress?: string;
  status: string;
  scheduledServiceDate?: Timestamp | Date;
  scheduledServiceTime?: string;
  category: string;
  clientId: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    workOrderId: string;
    workOrderNumber: string;
    locationName: string;
    locationAddress: string;
    status: string;
    category: string;
  };
}

interface ClientCalendarProps {
  selectedLocations?: string[];
  onEventClick?: (workOrderId: string) => void;
}

export default function ClientCalendar({ selectedLocations, onEventClick }: ClientCalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [recurringWorkOrders, setRecurringWorkOrders] = useState<RecurringWorkOrder[]>([]);
  const [view, setView] = useState<'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'>('dayGridMonth');
  const calendarRef = useRef<FullCalendar>(null);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Listen to work orders for this client
    const workOrdersQuery = query(
      collection(db, 'workOrders'),
      where('clientId', '==', currentUser.uid)
    );

    const unsubscribeWorkOrders = onSnapshot(workOrdersQuery, (snapshot) => {
      const workOrdersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as WorkOrder[];

      setWorkOrders(workOrdersData);
    });

    // Listen to recurring work orders for this client
    const recurringWorkOrdersQuery = query(
      collection(db, 'recurringWorkOrders'),
      where('clientId', '==', currentUser.uid),
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
    // Filter work orders by selected locations
    let filteredWorkOrders = workOrders;
    let filteredRecurring = recurringWorkOrders;
    
    if (selectedLocations && selectedLocations.length > 0) {
      filteredWorkOrders = workOrders.filter(wo => 
        selectedLocations.includes(wo.locationName)
      );
      filteredRecurring = recurringWorkOrders.filter(rwo => 
        selectedLocations.includes(rwo.locationName || '')
      );
    }

    // Convert work orders to calendar events
    const workOrderEvents: CalendarEvent[] = filteredWorkOrders
      .filter(wo => {
        // Only show work orders with scheduled dates or recurring work orders
        return wo.scheduledServiceDate || wo.status === 'scheduled' || wo.status === 'accepted_by_subcontractor';
      })
      .map(wo => {
        const scheduledDate = wo.scheduledServiceDate instanceof Timestamp 
          ? wo.scheduledServiceDate.toDate()
          : wo.scheduledServiceDate instanceof Date
          ? wo.scheduledServiceDate
          : null;

        if (!scheduledDate) {
          // If no scheduled date, use created date as fallback
          const createdDate = (wo as any).createdAt instanceof Timestamp
            ? (wo as any).createdAt.toDate()
            : new Date();
          return {
            id: wo.id,
            title: wo.title,
            start: createdDate,
            backgroundColor: getStatusColor(wo.status).bg,
            borderColor: getStatusColor(wo.status).border,
            textColor: getStatusColor(wo.status).text,
            extendedProps: {
              workOrderId: wo.id,
              workOrderNumber: wo.workOrderNumber || wo.id.slice(-8).toUpperCase(),
              locationName: wo.locationName,
              locationAddress: formatAddress(wo.locationAddress),
              status: wo.status,
              category: wo.category,
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
          title: wo.title,
          start: startDateTime,
          end: endDateTime,
          backgroundColor: getStatusColor(wo.status).bg,
          borderColor: getStatusColor(wo.status).border,
          textColor: getStatusColor(wo.status).text,
          extendedProps: {
            workOrderId: wo.id,
            workOrderNumber: wo.workOrderNumber || wo.id.slice(-8).toUpperCase(),
            locationName: wo.locationName,
            locationAddress: formatAddress(wo.locationAddress),
            status: wo.status,
            category: wo.category,
          },
        };
      });

    // Convert recurring work orders to calendar events
    const recurringEvents: CalendarEvent[] = filteredRecurring
      .filter(rwo => rwo.nextExecution)
      .map(rwo => {
        const nextExec = rwo.nextExecution instanceof Date ? rwo.nextExecution : new Date(rwo.nextExecution);
        
        // Create event for next execution
        const startDateTime = new Date(nextExec);
        startDateTime.setHours(9, 0, 0, 0); // Default 9 AM

        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(endDateTime.getHours() + 2);

        return {
          id: `recurring-${rwo.id}`,
          title: `🔄 ${rwo.title} (Recurring)`,
          start: startDateTime,
          end: endDateTime,
          backgroundColor: '#fbbf24', // Yellow for recurring
          borderColor: '#f59e0b',
          textColor: '#ffffff',
          extendedProps: {
            workOrderId: rwo.id,
            workOrderNumber: rwo.workOrderNumber || rwo.id.slice(-8).toUpperCase(),
            locationName: rwo.locationName || 'Unknown Location',
            locationAddress: formatAddress(rwo.locationAddress),
            status: 'recurring',
            category: rwo.category,
            isRecurring: true,
          },
        };
      });

    // Combine both event types
    setEvents([...workOrderEvents, ...recurringEvents]);
  }, [workOrders, recurringWorkOrders, selectedLocations]);

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
      default:
        return { bg: '#6b7280', border: '#4b5563', text: '#ffffff' }; // Gray
    }
  };

  const handleEventClick = (clickInfo: any) => {
    if (onEventClick) {
      onEventClick(clickInfo.event.extendedProps.workOrderId);
    } else {
      window.location.href = `/client-portal/work-orders/${clickInfo.event.extendedProps.workOrderId}`;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Calendar</CardTitle>
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
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          height="auto"
          eventDisplay="block"
          eventTimeFormat={{
            hour: 'numeric',
            minute: '2-digit',
            meridiem: 'short',
          }}
        />
      </CardContent>
    </Card>
  );
}

