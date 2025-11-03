'use client';

import { useEffect, useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatAddress } from '@/lib/utils';

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
  extendedProps: {
    workOrderId: string;
    workOrderNumber: string;
    locationName: string;
    locationAddress: string;
    clientName: string;
    status: string;
    category: string;
  };
}

export default function SubcontractorCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [workOrders, setWorkOrders] = useState<Map<string, WorkOrder>>(new Map());
  const [view, setView] = useState<'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'>('dayGridMonth');
  const calendarRef = useRef<FullCalendar>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return;

      // Listen to assigned jobs for this subcontractor
      const assignedQuery = query(
        collection(db, 'assignedJobs'),
        where('subcontractorId', '==', user.uid),
        where('status', 'in', ['pending_acceptance', 'accepted'])
      );

      const unsubscribeAssigned = onSnapshot(assignedQuery, (snapshot) => {
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
            where('__name__', 'in', workOrderIds.slice(0, 10)) // Firestore limit
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

      return () => unsubscribeAssigned();
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    // Convert assigned jobs to calendar events
    const calendarEvents: CalendarEvent[] = assignedJobs
      .map(job => {
        const workOrder = workOrders.get(job.workOrderId);
        if (!workOrder) return null;

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

    setEvents(calendarEvents);
  }, [assignedJobs, workOrders]);

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
    window.location.href = `/subcontractor-portal/assigned`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>My Schedule</CardTitle>
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

