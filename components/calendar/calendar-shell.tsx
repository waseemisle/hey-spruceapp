'use client';

import { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  CalendarDays, CalendarRange, Clock, ListChecks, ChevronLeft, ChevronRight,
  Calendar as CalendarIcon, MapPin,
} from 'lucide-react';
import { useIsMobile } from '@/lib/use-is-mobile';
import { STATUS_PALETTE, type StatusSlot } from '@/lib/calendar-events';

export type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';

export interface CalendarLegendItem {
  slot: StatusSlot;
  label: string;
}

interface CalendarShellProps {
  /** Card title shown in the toolbar. */
  title: string;
  /** Optional subtitle (e.g. "All work orders" or "My schedule"). */
  subtitle?: string;
  /** Events to render — should already be deduped. */
  events: any[];
  /** Click handler — receives FullCalendar's clickInfo. */
  onEventClick?: (info: any) => void;
  /** Drag-drop reschedule handler — admin only. */
  onEventDrop?: (info: any) => void;
  /** When true, events with `editable: true` can be dragged. */
  editable?: boolean;
  /** Status legend chips shown below the calendar. Empty = no legend. */
  legend?: CalendarLegendItem[];
}

const VIEW_OPTIONS: { id: CalendarView; label: string; shortLabel: string; icon: typeof CalendarDays }[] = [
  { id: 'dayGridMonth', label: 'Month', shortLabel: 'M', icon: CalendarDays },
  { id: 'timeGridWeek', label: 'Week',  shortLabel: 'W', icon: CalendarRange },
  { id: 'timeGridDay',  label: 'Day',   shortLabel: 'D', icon: Clock },
  { id: 'listWeek',     label: 'List',  shortLabel: 'L', icon: ListChecks },
];

/**
 * Modern calendar chrome shared by the admin / client / subcontractor
 * calendars. Owns:
 *   • Toolbar (prev/next/today, title, segmented view switcher)
 *   • Theme-aware FullCalendar styling (dark-mode safe)
 *   • Polished event renderer (status dot + title + meta)
 *   • Optional status legend
 *
 * Data fetching, dedup, and per-portal nuances stay in the wrapper.
 */
export default function CalendarShell({
  title,
  subtitle,
  events,
  onEventClick,
  onEventDrop,
  editable = false,
  legend,
}: CalendarShellProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const isMobile = useIsMobile();
  const [view, setView] = useState<CalendarView>('dayGridMonth');
  const [headerTitle, setHeaderTitle] = useState('');

  // Switch to list view on mobile by default — month grid doesn't pack well.
  useEffect(() => {
    if (!calendarRef.current) return;
    const target: CalendarView = isMobile ? 'listWeek' : 'dayGridMonth';
    calendarRef.current.getApi().changeView(target);
    setView(target);
    setHeaderTitle(calendarRef.current.getApi().view.title);
  }, [isMobile]);

  const updateTitle = () => {
    const api = calendarRef.current?.getApi();
    if (api) setHeaderTitle(api.view.title);
  };

  const handleViewChange = (next: CalendarView) => {
    setView(next);
    calendarRef.current?.getApi().changeView(next);
    updateTitle();
  };

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      {/* Toolbar */}
      <div className="relative bg-gradient-to-br from-blue-50/80 via-card to-indigo-50/40 dark:from-blue-950/30 dark:via-card dark:to-indigo-950/20 border-b border-border">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-200/30 dark:bg-blue-900/20 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-xl bg-card border border-border shadow-sm p-2 flex-shrink-0">
                <CalendarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-foreground truncate">{title}</h2>
                {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
              </div>
            </div>

            {/* Segmented view switcher */}
            <div className="inline-flex bg-card/80 backdrop-blur border border-border rounded-xl p-1 shadow-sm">
              {VIEW_OPTIONS.map(({ id, label, shortLabel, icon: Icon }) => {
                const active = view === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleViewChange(id)}
                    className={`relative inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      active
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                    aria-pressed={active}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation row: prev/next, today, current title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => { calendarRef.current?.getApi().prev(); updateTitle(); }}
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => { calendarRef.current?.getApi().next(); updateTitle(); }}
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs font-semibold ml-1"
                onClick={() => { calendarRef.current?.getApi().today(); updateTitle(); }}
              >
                Today
              </Button>
            </div>
            <div className="text-sm sm:text-base font-bold text-foreground tracking-tight">
              {headerTitle}
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        <div className="ground-ops-calendar p-2 sm:p-4">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView="dayGridMonth"
            events={events}
            eventClick={onEventClick}
            eventDrop={onEventDrop}
            editable={editable}
            eventStartEditable={editable}
            eventDurationEditable={false}
            datesSet={updateTitle}
            headerToolbar={false}
            height="auto"
            eventDisplay="block"
            displayEventTime={false}
            dayMaxEvents={3}
            moreLinkClick="popover"
            eventContent={(arg) => {
              const props = arg.event.extendedProps as any;
              const slot: StatusSlot = props.statusSlot || 'neutral';
              const palette = STATUS_PALETTE[slot];
              const isList = arg.view.type === 'listWeek';
              const time = arg.event.start ? formatTimeShort(arg.event.start) : '';

              if (isList) {
                return (
                  <div className="flex items-center gap-2 py-0.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                      style={{ background: palette.bg }}
                    />
                    <span className="font-medium text-foreground truncate">{arg.event.title}</span>
                    {props.locationName && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground ml-2">
                        <MapPin className="h-3 w-3" />
                        {props.locationName}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <div
                  className="ground-ops-event-chip"
                  style={{ borderLeftColor: palette.border }}
                >
                  <span
                    className="ground-ops-event-dot"
                    style={{ background: palette.border }}
                  />
                  <div className="ground-ops-event-text">
                    {time && <span className="ground-ops-event-time">{time}</span>}
                    <span className="ground-ops-event-title">{arg.event.title}</span>
                  </div>
                </div>
              );
            }}
          />
        </div>

        {legend && legend.length > 0 && (
          <div className="border-t border-border bg-muted/30 px-4 py-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {legend.map(({ slot, label }) => (
              <div key={`${slot}-${label}`} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/5"
                  style={{ background: STATUS_PALETTE[slot].bg }}
                />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Theme-aware FullCalendar overrides — scoped via .ground-ops-calendar */}
      <style jsx global>{`
        .ground-ops-calendar .fc {
          --fc-border-color: hsl(var(--border));
          --fc-page-bg-color: transparent;
          --fc-neutral-bg-color: hsl(var(--muted) / 0.4);
          --fc-list-event-hover-bg-color: hsl(var(--muted) / 0.6);
          --fc-today-bg-color: hsl(var(--primary) / 0.06);
          --fc-now-indicator-color: #ef4444;
          font-family: inherit;
        }

        .ground-ops-calendar .fc .fc-scrollgrid,
        .ground-ops-calendar .fc .fc-scrollgrid td,
        .ground-ops-calendar .fc .fc-scrollgrid th {
          border-color: hsl(var(--border));
        }

        .ground-ops-calendar .fc .fc-col-header-cell {
          background: hsl(var(--muted) / 0.4);
          padding: 8px 4px;
        }
        .ground-ops-calendar .fc .fc-col-header-cell-cushion {
          color: hsl(var(--muted-foreground));
          text-transform: uppercase;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 4px 6px;
        }

        .ground-ops-calendar .fc .fc-daygrid-day-frame { min-height: 96px; }
        .ground-ops-calendar .fc .fc-daygrid-day-top {
          flex-direction: row;
          padding: 4px 6px;
        }
        .ground-ops-calendar .fc .fc-daygrid-day-number {
          color: hsl(var(--foreground));
          font-size: 12px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 6px;
          transition: all 0.15s ease;
        }
        .ground-ops-calendar .fc .fc-day-today .fc-daygrid-day-number {
          background: #2563eb;
          color: #fff;
        }
        .ground-ops-calendar .fc .fc-day-other .fc-daygrid-day-number {
          color: hsl(var(--muted-foreground) / 0.6);
        }
        .ground-ops-calendar .fc .fc-day-sat,
        .ground-ops-calendar .fc .fc-day-sun {
          background: hsl(var(--muted) / 0.18);
        }
        .ground-ops-calendar .fc .fc-day-today {
          background: hsl(var(--primary) / 0.04) !important;
        }

        /* Event chip — modern card-like tile */
        .ground-ops-calendar .fc .fc-event {
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
          margin-bottom: 2px !important;
        }
        .ground-ops-calendar .fc .fc-daygrid-event,
        .ground-ops-calendar .fc .fc-timegrid-event {
          border-radius: 8px;
          overflow: hidden;
        }
        .ground-ops-calendar .fc .fc-event-main { padding: 0 !important; }
        .ground-ops-calendar .ground-ops-event-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.92);
          color: hsl(var(--foreground));
          border-left: 3px solid #3b82f6;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
          transition: transform 0.12s ease, box-shadow 0.12s ease;
          min-height: 22px;
        }
        :is(.dark) .ground-ops-calendar .ground-ops-event-chip {
          background: hsl(var(--card));
        }
        .ground-ops-calendar .fc-event:hover .ground-ops-event-chip {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }
        .ground-ops-calendar .ground-ops-event-dot {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          flex-shrink: 0;
        }
        .ground-ops-calendar .ground-ops-event-text {
          display: flex;
          align-items: baseline;
          gap: 4px;
          min-width: 0;
          flex: 1;
        }
        .ground-ops-calendar .ground-ops-event-time {
          font-size: 10px;
          font-weight: 700;
          color: hsl(var(--muted-foreground));
          flex-shrink: 0;
        }
        .ground-ops-calendar .ground-ops-event-title {
          font-size: 11px;
          font-weight: 600;
          color: hsl(var(--foreground));
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* TimeGrid (week/day) events keep the chip styling */
        .ground-ops-calendar .fc .fc-timegrid-event .ground-ops-event-chip {
          height: 100%;
          border-radius: 8px;
          align-items: flex-start;
          padding: 6px 8px;
        }
        .ground-ops-calendar .fc .fc-timegrid-event .ground-ops-event-text {
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }
        .ground-ops-calendar .fc .fc-timegrid-event .ground-ops-event-title {
          white-space: normal;
        }

        /* "+N more" link */
        .ground-ops-calendar .fc .fc-daygrid-more-link {
          color: hsl(var(--muted-foreground));
          font-size: 11px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .ground-ops-calendar .fc .fc-daygrid-more-link:hover {
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
          text-decoration: none;
        }

        /* Popover when "+more" is clicked */
        .ground-ops-calendar .fc .fc-popover {
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }
        .ground-ops-calendar .fc .fc-popover-header {
          background: hsl(var(--muted) / 0.6);
          color: hsl(var(--foreground));
          padding: 8px 12px;
          font-weight: 600;
          font-size: 12px;
        }

        /* List view */
        .ground-ops-calendar .fc-list,
        .ground-ops-calendar .fc-list-table {
          border-color: hsl(var(--border));
        }
        .ground-ops-calendar .fc-list-day-cushion {
          background: hsl(var(--muted) / 0.4) !important;
          color: hsl(var(--foreground));
          padding: 8px 12px;
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .ground-ops-calendar .fc-list-event {
          background: transparent !important;
        }
        .ground-ops-calendar .fc-list-event:hover td {
          background: hsl(var(--muted) / 0.6) !important;
        }
        .ground-ops-calendar .fc-list-event-time,
        .ground-ops-calendar .fc-list-event-graphic,
        .ground-ops-calendar .fc-list-event-title {
          color: hsl(var(--foreground));
        }
        .ground-ops-calendar .fc-list-empty {
          background: transparent;
          color: hsl(var(--muted-foreground));
        }

        /* TimeGrid axis */
        .ground-ops-calendar .fc .fc-timegrid-axis,
        .ground-ops-calendar .fc .fc-timegrid-slot-label-cushion {
          color: hsl(var(--muted-foreground));
          font-size: 11px;
        }
        .ground-ops-calendar .fc .fc-timegrid-now-indicator-line {
          border-color: #ef4444;
          border-width: 2px;
        }
        .ground-ops-calendar .fc .fc-timegrid-now-indicator-arrow {
          border-color: #ef4444;
          color: #ef4444;
        }
      `}</style>
    </Card>
  );
}

function formatTimeShort(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return '';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const meridiem = h >= 12 ? 'pm' : 'am';
  return m === 0 ? `${h12}${meridiem}` : `${h12}:${String(m).padStart(2, '0')}${meridiem}`;
}
