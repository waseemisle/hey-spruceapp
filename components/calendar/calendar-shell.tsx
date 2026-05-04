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
  MapPin, Calendar as CalendarIcon, Sparkles, ArrowRight,
} from 'lucide-react';
import { useIsMobile } from '@/lib/use-is-mobile';
import { STATUS_PALETTE, type StatusSlot } from '@/lib/calendar-events';

export type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';

export interface CalendarLegendItem {
  slot: StatusSlot;
  label: string;
}

interface CalendarShellProps {
  title: string;
  subtitle?: string;
  events: any[];
  onEventClick?: (info: any) => void;
  onEventDrop?: (info: any) => void;
  editable?: boolean;
  legend?: CalendarLegendItem[];
}

const VIEW_OPTIONS: { id: CalendarView; label: string; shortLabel: string; icon: typeof CalendarDays }[] = [
  { id: 'dayGridMonth', label: 'Month', shortLabel: 'M', icon: CalendarDays },
  { id: 'timeGridWeek', label: 'Week',  shortLabel: 'W', icon: CalendarRange },
  { id: 'timeGridDay',  label: 'Day',   shortLabel: 'D', icon: Clock },
  { id: 'listWeek',     label: 'List',  shortLabel: 'L', icon: ListChecks },
];

/**
 * Calendar workspace — calendar grid plus a contextual right sidebar
 * showing TODAY and UPCOMING events. Uses a multi-hue gradient backdrop
 * (violet → sky → emerald), frosted-glass toolbar, and category-aware
 * event tiles with icon dots instead of flat color blocks.
 *
 * Design moves that distinguish this from the previous two iterations:
 *   • Two-column workspace on desktop (calendar + agenda sidebar) so
 *     the page reads as a real workspace, not just a grid
 *   • Frosted-glass toolbar with backdrop-blur over a tinted gradient
 *   • Today: animated pulsing ring around the date number
 *   • Event tiles: gradient backgrounds tinted by status, with a
 *     contrast-aware shadow on hover
 *   • Sidebar event cards use the same palette but presented as
 *     scannable rows with time + location instead of grid pills
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

  // Derive today's + upcoming events for the side panel
  const { todayEvents, upcomingEvents, statusCounts } = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setHours(23, 59, 59, 999);
    const sevenDaysOut = new Date(startOfToday);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

    const today: any[] = [];
    const upcoming: any[] = [];
    const counts: Partial<Record<StatusSlot, number>> = {};

    for (const ev of events) {
      const s = ev.start instanceof Date ? ev.start : new Date(ev.start);
      const slot = (ev?.extendedProps?.statusSlot as StatusSlot) || 'neutral';
      counts[slot] = (counts[slot] || 0) + 1;
      if (s >= startOfToday && s <= endOfToday) today.push(ev);
      else if (s > endOfToday && s <= sevenDaysOut) upcoming.push(ev);
    }

    today.sort((a, b) =>
      (a.start instanceof Date ? a.start : new Date(a.start)).getTime() -
      (b.start instanceof Date ? b.start : new Date(b.start)).getTime(),
    );
    upcoming.sort((a, b) =>
      (a.start instanceof Date ? a.start : new Date(a.start)).getTime() -
      (b.start instanceof Date ? b.start : new Date(b.start)).getTime(),
    );

    return { todayEvents: today, upcomingEvents: upcoming.slice(0, 5), statusCounts: counts };
  }, [events]);

  return (
    <Card className="overflow-hidden border-border bg-gradient-to-br from-violet-50/40 via-sky-50/40 to-emerald-50/30 dark:from-violet-950/20 dark:via-sky-950/20 dark:to-emerald-950/15 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.06)]">
      {/* Frosted-glass toolbar */}
      <div className="relative border-b border-border bg-card/70 backdrop-blur-xl">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 px-5 py-4">
          {/* Left: title + count + nav */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 p-2 shadow-md shadow-violet-500/20 flex-shrink-0">
              <CalendarIcon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight text-foreground truncate">
                  {headerTitle || title}
                </h2>
                {events.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full bg-gradient-to-r from-violet-100 to-sky-100 dark:from-violet-950/40 dark:to-sky-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-900/60 px-2 py-0.5">
                    <Sparkles className="h-3 w-3" />
                    {events.length} {events.length === 1 ? 'event' : 'events'}
                  </span>
                )}
              </div>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full hover:bg-violet-100/60 dark:hover:bg-violet-950/40"
                onClick={() => { calendarRef.current?.getApi().prev(); updateTitle(); }}
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full hover:bg-violet-100/60 dark:hover:bg-violet-950/40"
                onClick={() => { calendarRef.current?.getApi().next(); updateTitle(); }}
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs font-semibold ml-1.5 rounded-full bg-card/80 backdrop-blur"
                onClick={() => { calendarRef.current?.getApi().today(); updateTitle(); }}
              >
                Today
              </Button>
            </div>
          </div>

          {/* Right: gradient pill view switcher */}
          <div className="inline-flex bg-card/70 backdrop-blur border border-border rounded-full p-0.5 self-start xl:self-auto shadow-sm">
            {VIEW_OPTIONS.map(({ id, label, shortLabel, icon: Icon }) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  onClick={() => handleViewChange(id)}
                  className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-md shadow-violet-500/20'
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

        {/* Status legend chips — only render slots that exist */}
        {legend && legend.length > 0 && (
          <div className="px-5 pb-3 flex flex-wrap gap-1.5">
            {legend.map(({ slot, label }) => {
              const palette = STATUS_PALETTE[slot];
              const count = statusCounts[slot] || 0;
              if (count === 0) return null;
              return (
                <span
                  key={`${slot}-${label}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full border px-2 py-0.5 shadow-sm"
                  style={{
                    background: palette.softBg,
                    color: palette.softText,
                    borderColor: palette.bg + '40',
                  }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full ring-2 ring-white dark:ring-card"
                    style={{ background: palette.bg }}
                  />
                  {label}
                  <span className="font-bold">{count}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-column workspace — calendar + agenda sidebar (sidebar collapses below the grid on smaller widths) */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-3 p-3">
        <div className="ground-ops-calendar bg-card rounded-xl border border-border overflow-hidden">
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
                      className="inline-block h-3 w-3 rounded-full flex-shrink-0 ring-2 ring-card shadow-sm"
                      style={{ background: palette.bg }}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-foreground truncate block">{arg.event.title}</span>
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

              return (
                <div
                  className="ground-ops-event-tile"
                  style={{
                    background: `linear-gradient(135deg, ${palette.softBg} 0%, ${palette.softBg} 60%, ${palette.bg}15 100%)`,
                    color: palette.softText,
                    borderLeftColor: palette.bg,
                  }}
                >
                  <span
                    className="ground-ops-event-dot"
                    style={{ background: palette.bg }}
                  />
                  <div className="ground-ops-event-text">
                    {time && (
                      <span className="ground-ops-event-time" style={{ color: palette.bg }}>
                        {time}
                      </span>
                    )}
                    <span className="ground-ops-event-title">{arg.event.title}</span>
                  </div>
                </div>
              );
            }}
          />
        </div>

        {/* Agenda sidebar */}
        <aside className="hidden xl:flex flex-col gap-3 min-w-0">
          <SidebarPanel
            title="Today"
            badge={todayEvents.length}
            accentClass="bg-gradient-to-br from-violet-600 to-indigo-700"
            events={todayEvents}
            emptyMessage="Nothing scheduled today."
            onEventClick={onEventClick}
          />
          <SidebarPanel
            title="Upcoming"
            badge={upcomingEvents.length}
            accentClass="bg-gradient-to-br from-sky-600 to-cyan-700"
            events={upcomingEvents}
            emptyMessage="No events in the next 7 days."
            showDate
            onEventClick={onEventClick}
          />
        </aside>
      </div>

      <style jsx global>{`
        .ground-ops-calendar .fc {
          --fc-border-color: hsl(var(--border));
          --fc-page-bg-color: transparent;
          --fc-neutral-bg-color: transparent;
          --fc-list-event-hover-bg-color: hsl(var(--muted) / 0.5);
          --fc-today-bg-color: transparent;
          --fc-now-indicator-color: #ef4444;
          font-family: inherit;
        }

        .ground-ops-calendar .fc-theme-standard .fc-scrollgrid,
        .ground-ops-calendar .fc-theme-standard td,
        .ground-ops-calendar .fc-theme-standard th {
          border-color: hsl(var(--border) / 0.6);
        }
        .ground-ops-calendar .fc .fc-scrollgrid {
          border: none;
        }

        .ground-ops-calendar .fc .fc-col-header-cell {
          background: hsl(var(--muted) / 0.25);
          padding: 12px 4px 10px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .ground-ops-calendar .fc .fc-col-header-cell-cushion {
          color: hsl(var(--muted-foreground));
          text-transform: uppercase;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;
          padding: 0;
        }

        .ground-ops-calendar .fc .fc-daygrid-day {
          background: hsl(var(--card));
          transition: background-color 0.18s ease;
        }
        .ground-ops-calendar .fc .fc-daygrid-day:hover {
          background: linear-gradient(180deg, hsl(var(--muted) / 0.3), hsl(var(--muted) / 0.1));
        }
        .ground-ops-calendar .fc .fc-daygrid-day-frame {
          min-height: 124px;
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

        /* Today: gradient circle + animated halo */
        .ground-ops-calendar .fc .fc-day-today {
          background: linear-gradient(180deg, rgba(124, 58, 237, 0.05), rgba(124, 58, 237, 0)) !important;
        }
        .ground-ops-calendar .fc .fc-day-today .fc-daygrid-day-number {
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          color: #fff;
          font-weight: 800;
          box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.15), 0 4px 10px rgba(124, 58, 237, 0.3);
          animation: groundOpsTodayPulse 2.4s ease-in-out infinite;
        }
        @keyframes groundOpsTodayPulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.15), 0 4px 10px rgba(124, 58, 237, 0.25); }
          50% { box-shadow: 0 0 0 6px rgba(124, 58, 237, 0.25), 0 4px 14px rgba(124, 58, 237, 0.4); }
        }

        .ground-ops-calendar .fc .fc-day-sat,
        .ground-ops-calendar .fc .fc-day-sun {
          background: hsl(var(--muted) / 0.15);
        }

        .ground-ops-calendar .fc .fc-event {
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 1px 4px !important;
          cursor: pointer;
        }
        .ground-ops-calendar .fc .fc-daygrid-event,
        .ground-ops-calendar .fc .fc-timegrid-event {
          border-radius: 8px;
          overflow: hidden;
        }
        .ground-ops-calendar .fc .fc-event-main { padding: 0 !important; }

        .ground-ops-calendar .ground-ops-event-tile {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px 4px 6px;
          border-radius: 8px;
          border-left: 3px solid;
          min-height: 24px;
          font-size: 11.5px;
          line-height: 1.25;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          overflow: hidden;
        }
        .ground-ops-calendar .ground-ops-event-dot {
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          flex-shrink: 0;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7);
        }
        .ground-ops-calendar .fc-event:hover .ground-ops-event-tile {
          transform: translateY(-1px) scale(1.01);
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.1);
        }
        .ground-ops-calendar .ground-ops-event-text {
          display: flex;
          align-items: baseline;
          gap: 5px;
          min-width: 0;
          flex: 1;
        }
        .ground-ops-calendar .ground-ops-event-time {
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.01em;
          flex-shrink: 0;
        }
        .ground-ops-calendar .ground-ops-event-title {
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ground-ops-calendar .fc .fc-timegrid-event .ground-ops-event-tile {
          height: 100%;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          padding: 6px 8px 6px 9px;
        }
        .ground-ops-calendar .fc .fc-timegrid-event .ground-ops-event-text {
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }
        .ground-ops-calendar .fc .fc-timegrid-event .ground-ops-event-title {
          white-space: normal;
        }

        .ground-ops-calendar .fc .fc-daygrid-more-link {
          color: hsl(var(--muted-foreground));
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          margin: 0 4px;
          border-radius: 9999px;
          background: hsl(var(--muted) / 0.5);
        }
        .ground-ops-calendar .fc .fc-daygrid-more-link:hover {
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
          text-decoration: none;
        }

        .ground-ops-calendar .fc .fc-popover {
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 14px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
          overflow: hidden;
        }
        .ground-ops-calendar .fc .fc-popover-header {
          background: linear-gradient(180deg, hsl(var(--muted) / 0.4), transparent);
          color: hsl(var(--foreground));
          padding: 10px 14px;
          font-weight: 700;
          font-size: 12px;
          border-bottom: 1px solid hsl(var(--border));
        }

        .ground-ops-calendar .fc-list,
        .ground-ops-calendar .fc-list-table {
          border: none !important;
        }
        .ground-ops-calendar .fc-list-day-cushion {
          background: linear-gradient(180deg, hsl(var(--muted) / 0.4), hsl(var(--muted) / 0.2)) !important;
          color: hsl(var(--muted-foreground));
          padding: 10px 14px;
          font-weight: 800;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
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
        .ground-ops-calendar .fc-list-event-graphic { display: none; }
        .ground-ops-calendar .fc-list-empty {
          background: transparent;
          color: hsl(var(--muted-foreground));
          padding: 32px;
        }

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

/* ────────────────────────── Agenda sidebar ────────────────────────── */

function SidebarPanel({
  title,
  badge,
  accentClass,
  events,
  emptyMessage,
  showDate = false,
  onEventClick,
}: {
  title: string;
  badge: number;
  accentClass: string;
  events: any[];
  emptyMessage: string;
  showDate?: boolean;
  onEventClick?: (info: any) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-0 shadow-sm">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${accentClass} shadow-md shadow-black/10`}>
            <CalendarIcon className="h-3.5 w-3.5 text-white" />
          </span>
          <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
        </div>
        <span className="text-[11px] font-bold text-muted-foreground bg-muted/60 border border-border rounded-full px-2 py-0.5">
          {badge}
        </span>
      </div>
      <div className="flex-1 min-h-0 max-h-[420px] overflow-y-auto p-2 space-y-1.5">
        {events.length === 0 ? (
          <div className="text-center py-6 px-3">
            <p className="text-xs text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          events.map((ev: any) => (
            <SidebarEventRow key={ev.id} event={ev} showDate={showDate} onClick={onEventClick} />
          ))
        )}
      </div>
    </div>
  );
}

function SidebarEventRow({
  event,
  showDate,
  onClick,
}: {
  event: any;
  showDate: boolean;
  onClick?: (info: any) => void;
}) {
  const slot: StatusSlot = (event?.extendedProps?.statusSlot as StatusSlot) || 'neutral';
  const palette = STATUS_PALETTE[slot];
  const start = event.start instanceof Date ? event.start : new Date(event.start);
  const time = formatTimeShort(start);
  const dateLabel = showDate ? formatDateShort(start) : '';
  const locationName = event?.extendedProps?.locationName;

  const handleClick = () => {
    if (onClick) onClick({ event, jsEvent: { preventDefault: () => {} } });
    else if (event.url) window.location.href = event.url;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group w-full text-left rounded-lg border border-border bg-gradient-to-br hover:shadow-md transition-all p-2.5 flex items-start gap-2.5 hover:-translate-y-px"
      style={{
        backgroundImage: `linear-gradient(135deg, ${palette.softBg} 0%, ${palette.softBg} 50%, ${palette.bg}10 100%)`,
      }}
    >
      <span
        className="mt-1 inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-card shadow-sm"
        style={{ background: palette.bg }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold truncate" style={{ color: palette.softText }}>
          {event.title}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[10.5px] font-medium text-muted-foreground">
          {(time || dateLabel) && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {[dateLabel, time].filter(Boolean).join(' · ')}
            </span>
          )}
          {locationName && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="h-2.5 w-2.5" />
              {locationName}
            </span>
          )}
        </div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
    </button>
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

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
