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
  MapPin,
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
 * Calendar chrome shared by admin/client/subcontractor portals.
 *
 * Design: clean, dense, monochrome — modeled on Notion Calendar / Cron /
 * the Google Calendar redesign. No gradient panels, no orbs, no big
 * decorative tiles. Just:
 *   • A flat toolbar (title, mini-nav, view switcher)
 *   • Generous day cells with clear date numbers
 *   • Solid colored event pills (Google Calendar–style)
 *   • A circular "today" badge instead of a tinted background
 *   • Theme-aware via hsl(var(--…)) tokens
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
    <Card className="overflow-hidden border-border shadow-sm bg-card">
      {/* Toolbar — flat, no gradient. Title + nav + view switcher. */}
      <div className="border-b border-border">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-5 py-3">
          {/* Left: title + month nav */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full"
                onClick={() => { calendarRef.current?.getApi().prev(); updateTitle(); }}
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full"
                onClick={() => { calendarRef.current?.getApi().next(); updateTitle(); }}
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
                  {headerTitle || title}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  onClick={() => { calendarRef.current?.getApi().today(); updateTitle(); }}
                >
                  Today
                </Button>
              </div>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>

          {/* Right: segmented view switcher */}
          <div className="inline-flex bg-muted/50 border border-border rounded-lg p-0.5 self-start lg:self-auto">
            {VIEW_OPTIONS.map(({ id, label, shortLabel, icon: Icon }) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  onClick={() => handleViewChange(id)}
                  className={`relative inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    active
                      ? 'bg-card text-foreground shadow-sm'
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
      </div>

      <CardContent className="p-0">
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
                  <div className="flex items-center gap-2.5 py-1">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-card"
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

              // Solid colored pill — Google Calendar style
              return (
                <div
                  className="ground-ops-event-pill"
                  style={{ background: palette.bg, color: palette.text }}
                >
                  {time && <span className="ground-ops-event-pill-time">{time}</span>}
                  <span className="ground-ops-event-pill-title">{arg.event.title}</span>
                </div>
              );
            }}
          />
        </div>

        {legend && legend.length > 0 && (
          <div className="border-t border-border px-4 sm:px-5 py-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {legend.map(({ slot, label }) => (
              <div key={`${slot}-${label}`} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: STATUS_PALETTE[slot].bg }}
                />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Theme-aware FullCalendar overrides — clean, dense, no chrome. */}
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

        /* Grid borders — single hairline, no doubling */
        .ground-ops-calendar .fc-theme-standard .fc-scrollgrid,
        .ground-ops-calendar .fc-theme-standard td,
        .ground-ops-calendar .fc-theme-standard th {
          border-color: hsl(var(--border));
        }
        .ground-ops-calendar .fc .fc-scrollgrid {
          border-radius: 0;
          border-left: none;
          border-right: none;
          border-bottom: none;
        }

        /* Day-of-week header */
        .ground-ops-calendar .fc .fc-col-header-cell {
          background: transparent;
          padding: 10px 4px 8px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .ground-ops-calendar .fc .fc-col-header-cell-cushion {
          color: hsl(var(--muted-foreground));
          text-transform: uppercase;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          padding: 0;
        }

        /* Day cells — generous, clean */
        .ground-ops-calendar .fc .fc-daygrid-day-frame {
          min-height: 110px;
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
          font-weight: 500;
          padding: 4px 6px;
          line-height: 1;
          border-radius: 9999px;
          min-width: 24px;
          text-align: center;
          transition: background-color 0.12s ease;
        }
        .ground-ops-calendar .fc .fc-day-other .fc-daygrid-day-number {
          color: hsl(var(--muted-foreground) / 0.5);
        }

        /* Today — single circle around the date number, nothing else */
        .ground-ops-calendar .fc .fc-day-today {
          background: transparent !important;
        }
        .ground-ops-calendar .fc .fc-day-today .fc-daygrid-day-number {
          background: #2563eb;
          color: #fff;
          font-weight: 700;
        }

        /* Weekend tint — barely there */
        .ground-ops-calendar .fc .fc-day-sat,
        .ground-ops-calendar .fc .fc-day-sun {
          background: hsl(var(--muted) / 0.12);
        }

        /* Event pills — solid colored blocks (Google Calendar style) */
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

        .ground-ops-calendar .ground-ops-event-pill {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 3px 7px;
          border-radius: 6px;
          min-height: 22px;
          font-size: 11.5px;
          line-height: 1.25;
          transition: filter 0.12s ease, transform 0.12s ease;
          overflow: hidden;
        }
        .ground-ops-calendar .fc-event:hover .ground-ops-event-pill {
          filter: brightness(0.93);
          transform: translateY(-1px);
        }
        .ground-ops-calendar .ground-ops-event-pill-time {
          font-size: 10.5px;
          font-weight: 700;
          opacity: 0.92;
          letter-spacing: 0.01em;
          flex-shrink: 0;
        }
        .ground-ops-calendar .ground-ops-event-pill-title {
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* TimeGrid (week/day) events */
        .ground-ops-calendar .fc .fc-timegrid-event .ground-ops-event-pill {
          height: 100%;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          padding: 5px 7px;
        }
        .ground-ops-calendar .fc .fc-timegrid-event .ground-ops-event-pill-title {
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
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
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
          font-weight: 600;
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
