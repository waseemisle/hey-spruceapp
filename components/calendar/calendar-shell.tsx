'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CalendarDays, CalendarRange, Clock, ListChecks, ChevronLeft, ChevronRight,
  MapPin, Activity,
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
 * Modern calendar chrome — inspired by Linear / Vercel / Cron. Refined
 * over the previous flat design with:
 *   • Soft tinted event tiles with a colored left accent (no more loud
 *     solid color blocks)
 *   • Today shown as a contrasting filled ring
 *   • Sleek toolbar with view switcher + count chip
 *   • Hairline grid + warm white background tone
 *   • Weekend cells lifted with a tiny dotted texture
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

  // Counts by status slot for the header chip strip
  const statusCounts = useMemo(() => {
    const counts: Partial<Record<StatusSlot, number>> = {};
    for (const ev of events) {
      const slot = (ev?.extendedProps?.statusSlot as StatusSlot) || 'neutral';
      counts[slot] = (counts[slot] || 0) + 1;
    }
    return counts;
  }, [events]);

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
    <Card className="overflow-hidden border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]">
      {/* Toolbar — single elegant row with title, count, nav, view switcher */}
      <div className="border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 px-5 py-4">
          {/* Left: title + count + nav */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight text-foreground truncate">
                  {headerTitle || title}
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 border border-border rounded-full px-2 py-0.5">
                  <Activity className="h-3 w-3" />
                  {events.length} {events.length === 1 ? 'event' : 'events'}
                </span>
              </div>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg hover:bg-muted/80"
                onClick={() => { calendarRef.current?.getApi().prev(); updateTitle(); }}
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg hover:bg-muted/80"
                onClick={() => { calendarRef.current?.getApi().next(); updateTitle(); }}
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs font-semibold ml-1.5 rounded-lg"
                onClick={() => { calendarRef.current?.getApi().today(); updateTitle(); }}
              >
                Today
              </Button>
            </div>
          </div>

          {/* Right: segmented view switcher */}
          <div className="inline-flex bg-muted/50 border border-border rounded-xl p-0.5 self-start xl:self-auto">
            {VIEW_OPTIONS.map(({ id, label, shortLabel, icon: Icon }) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  onClick={() => handleViewChange(id)}
                  className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground'
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

        {/* Status count strip — tiny pills showing what's on the calendar */}
        {legend && legend.length > 0 && (
          <div className="px-5 pb-3 pt-0 flex flex-wrap gap-1.5">
            {legend.map(({ slot, label }) => {
              const palette = STATUS_PALETTE[slot];
              const count = statusCounts[slot] || 0;
              if (count === 0) return null;
              return (
                <span
                  key={`${slot}-${label}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full border px-2 py-0.5"
                  style={{
                    background: palette.softBg,
                    color: palette.softText,
                    borderColor: palette.bg + '33',
                  }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: palette.bg }}
                  />
                  {label}
                  <span className="font-semibold">{count}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-2 sm:p-3">
        <div className="ground-ops-calendar">
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
            firstDay={0}
            fixedWeekCount={false}
            eventContent={(arg) => {
              const props = arg.event.extendedProps as any;
              const slot: StatusSlot = props.statusSlot || 'neutral';
              const palette = STATUS_PALETTE[slot];
              const isList = arg.view.type === 'listWeek';
              const time = arg.event.start ? formatTimeShort(arg.event.start) : '';

              if (isList) {
                return (
                  <div className="flex items-center gap-3 py-1">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-card"
                      style={{ background: palette.bg }}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground truncate block">{arg.event.title}</span>
                      {props.locationName && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <MapPin className="h-3 w-3" />
                          {props.locationName}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              // Soft tinted card with a colored left accent
              return (
                <div
                  className="ground-ops-event-tile"
                  style={{
                    background: palette.softBg,
                    color: palette.softText,
                    borderLeftColor: palette.bg,
                  }}
                >
                  {time && (
                    <span
                      className="ground-ops-event-time"
                      style={{ color: palette.bg }}
                    >
                      {time}
                    </span>
                  )}
                  <span className="ground-ops-event-title">{arg.event.title}</span>
                </div>
              );
            }}
          />
        </div>
      </div>

      {/* Theme-aware FullCalendar overrides */}
      <style jsx global>{`
        .ground-ops-calendar .fc {
          --fc-border-color: hsl(var(--border));
          --fc-page-bg-color: transparent;
          --fc-neutral-bg-color: transparent;
          --fc-list-event-hover-bg-color: hsl(var(--muted) / 0.6);
          --fc-today-bg-color: transparent;
          --fc-now-indicator-color: #ef4444;
          font-family: inherit;
        }

        /* Grid borders — single hairline, dotted on weekend separators
           for a subtle texture without ink-noise */
        .ground-ops-calendar .fc-theme-standard .fc-scrollgrid,
        .ground-ops-calendar .fc-theme-standard td,
        .ground-ops-calendar .fc-theme-standard th {
          border-color: hsl(var(--border) / 0.7);
        }
        .ground-ops-calendar .fc .fc-scrollgrid {
          border-radius: 8px;
          border: 1px solid hsl(var(--border));
          overflow: hidden;
        }

        /* Day-of-week header */
        .ground-ops-calendar .fc .fc-col-header-cell {
          background: hsl(var(--muted) / 0.3);
          padding: 10px 4px 8px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .ground-ops-calendar .fc .fc-col-header-cell-cushion {
          color: hsl(var(--muted-foreground));
          text-transform: uppercase;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          padding: 0;
        }

        /* Day cells — generous + warm */
        .ground-ops-calendar .fc .fc-daygrid-day {
          background: hsl(var(--card));
          transition: background-color 0.15s ease;
        }
        .ground-ops-calendar .fc .fc-daygrid-day:hover {
          background: hsl(var(--muted) / 0.25);
        }
        .ground-ops-calendar .fc .fc-daygrid-day-frame {
          min-height: 120px;
          padding: 4px;
        }
        .ground-ops-calendar .fc .fc-daygrid-day-top {
          flex-direction: row;
          justify-content: flex-start;
          padding: 2px 4px 4px;
        }
        .ground-ops-calendar .fc .fc-daygrid-day-number {
          color: hsl(var(--foreground));
          font-size: 13px;
          font-weight: 600;
          padding: 5px 8px;
          line-height: 1;
          border-radius: 9999px;
          min-width: 26px;
          text-align: center;
          transition: all 0.12s ease;
        }
        .ground-ops-calendar .fc .fc-day-other .fc-daygrid-day-number {
          color: hsl(var(--muted-foreground) / 0.4);
          font-weight: 500;
        }

        /* Today — solid filled circle, brand blue with subtle ring */
        .ground-ops-calendar .fc .fc-day-today {
          background: hsl(var(--card)) !important;
          position: relative;
        }
        .ground-ops-calendar .fc .fc-day-today::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(37,99,235,0.05) 0%, rgba(37,99,235,0) 30%);
          pointer-events: none;
          z-index: 0;
        }
        .ground-ops-calendar .fc .fc-day-today .fc-daygrid-day-number {
          background: #2563eb;
          color: #fff;
          font-weight: 700;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.15);
        }

        /* Weekend — softer tint */
        .ground-ops-calendar .fc .fc-day-sat,
        .ground-ops-calendar .fc .fc-day-sun {
          background: hsl(var(--muted) / 0.18);
        }

        /* Event tiles — soft-tinted card with left accent bar */
        .ground-ops-calendar .fc .fc-event {
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 1px 4px !important;
          cursor: pointer;
        }
        .ground-ops-calendar .fc .fc-daygrid-event,
        .ground-ops-calendar .fc .fc-timegrid-event {
          border-radius: 6px;
          overflow: hidden;
        }
        .ground-ops-calendar .fc .fc-event-main { padding: 0 !important; }

        .ground-ops-calendar .ground-ops-event-tile {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px 4px 6px;
          border-radius: 6px;
          border-left: 3px solid;
          min-height: 24px;
          font-size: 11.5px;
          line-height: 1.25;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
          overflow: hidden;
        }
        .ground-ops-calendar .fc-event:hover .ground-ops-event-tile {
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
        }
        .ground-ops-calendar .ground-ops-event-time {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.01em;
          flex-shrink: 0;
        }
        .ground-ops-calendar .ground-ops-event-title {
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* TimeGrid (week/day) events — taller, stacked layout */
        .ground-ops-calendar .fc .fc-timegrid-event .ground-ops-event-tile {
          height: 100%;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          padding: 6px 8px 6px 9px;
          border-left-width: 3px;
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
          margin: 0 4px;
          border-radius: 4px;
          background: hsl(var(--muted) / 0.5);
        }
        .ground-ops-calendar .fc .fc-daygrid-more-link:hover {
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
          text-decoration: none;
        }

        /* Popover */
        .ground-ops-calendar .fc .fc-popover {
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
          overflow: hidden;
        }
        .ground-ops-calendar .fc .fc-popover-header {
          background: transparent;
          color: hsl(var(--foreground));
          padding: 10px 14px;
          font-weight: 700;
          font-size: 12px;
          border-bottom: 1px solid hsl(var(--border));
        }

        /* List view */
        .ground-ops-calendar .fc-list,
        .ground-ops-calendar .fc-list-table {
          border: none !important;
        }
        .ground-ops-calendar .fc-list-day-cushion {
          background: hsl(var(--muted) / 0.4) !important;
          color: hsl(var(--muted-foreground));
          padding: 8px 14px;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .ground-ops-calendar .fc-list-event {
          background: transparent !important;
        }
        .ground-ops-calendar .fc-list-event:hover td {
          background: hsl(var(--muted) / 0.5) !important;
        }
        .ground-ops-calendar .fc-list-event-time,
        .ground-ops-calendar .fc-list-event-title {
          color: hsl(var(--foreground));
          font-size: 13px;
        }
        .ground-ops-calendar .fc-list-event-graphic {
          display: none; /* we render our own dot in eventContent */
        }
        .ground-ops-calendar .fc-list-empty {
          background: transparent;
          color: hsl(var(--muted-foreground));
          padding: 32px;
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
