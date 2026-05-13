'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { Button } from '@/components/ui/button';
import {
  CalendarDays, CalendarRange, Clock, ListChecks, ChevronLeft, ChevronRight,
  MapPin, Filter, Search, ArrowUpRight, X, CalendarCheck2,
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
 * "Editorial command center" — a clean three-pane workspace.
 *
 * Visual direction (deliberately different from prior soft-tint and
 * violet/sky/emerald iterations):
 *   • LEFT rail: monochrome controls — search, status filter chips that
 *     toggle event visibility, mini stats, "today" jumper.
 *   • CENTER: the calendar grid itself, on a flat editorial surface.
 *     No gradient backdrop. Today is a solid filled square (no halo,
 *     no pulse animation — confident, not noisy). Event chips are
 *     saturated solid colors with white text on month view, so the
 *     palette stays the visual signal of status.
 *   • RIGHT rail: agenda — today's events, then the next 7 days,
 *     each row showing time + title + location and an arrow on hover.
 *
 * Color story: warm slate neutrals (no purple gradient backdrops).
 * Accent is the status palette itself, not a brand color sprayed
 * on top. Headlines are oversized for editorial weight.
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
  const [search, setSearch] = useState('');
  const [hiddenSlots, setHiddenSlots] = useState<Set<StatusSlot>>(new Set());

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

  // Apply search + slot filters to events fed into FullCalendar
  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      const slot = (ev?.extendedProps?.statusSlot as StatusSlot) || 'neutral';
      if (hiddenSlots.has(slot)) return false;
      if (!q) return true;
      const title = String(ev.title || '').toLowerCase();
      const loc = String(ev?.extendedProps?.locationName || '').toLowerCase();
      return title.includes(q) || loc.includes(q);
    });
  }, [events, search, hiddenSlots]);

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

    for (const ev of visibleEvents) {
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

    return { todayEvents: today, upcomingEvents: upcoming.slice(0, 6), statusCounts: counts };
  }, [visibleEvents]);

  const toggleSlot = (slot: StatusSlot) => {
    setHiddenSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  };

  const totalCount = visibleEvents.length;
  const hiddenCount = events.length - totalCount;

  return (
    <div className="ground-ops-cal-shell rounded-[1.75rem] border border-border/70 bg-card/85 overflow-hidden shadow-[0_24px_48px_-12px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.04] backdrop-blur-xl dark:bg-zinc-900/75 dark:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)] dark:ring-white/[0.06]">
      {/* ───────── EDITORIAL HEADER ───────── */}
      <div className="border-b border-border bg-card">
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Schedule
            </p>
            <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight text-foreground leading-tight mt-1">
              {headerTitle || title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Date nav */}
            <div className="inline-flex items-stretch rounded-lg border border-border overflow-hidden bg-card">
              <button
                onClick={() => { calendarRef.current?.getApi().prev(); updateTitle(); }}
                className="h-9 w-9 inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => { calendarRef.current?.getApi().today(); updateTitle(); }}
                className="h-9 px-3.5 text-xs font-semibold text-foreground border-x border-border hover:bg-muted transition-colors inline-flex items-center gap-1.5"
              >
                <CalendarCheck2 className="h-3.5 w-3.5" />
                Today
              </button>
              <button
                onClick={() => { calendarRef.current?.getApi().next(); updateTitle(); }}
                className="h-9 w-9 inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Segmented view switcher */}
            <div className="inline-flex rounded-lg border border-border overflow-hidden bg-card">
              {VIEW_OPTIONS.map(({ id, label, shortLabel, icon: Icon }, idx) => {
                const active = view === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleViewChange(id)}
                    className={`h-9 px-3 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                      idx > 0 ? 'border-l border-border' : ''
                    } ${
                      active
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
      </div>

      {/* ───────── 3-PANE WORKSPACE ───────── */}
      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* LEFT: filters + status legend */}
        <aside className="hidden lg:flex flex-col gap-5 border-r border-border bg-muted/30 p-5 min-w-0">
          {/* Search */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1.5 block">
              Search
            </label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title or location"
                className="w-full h-9 pl-8 pr-7 text-xs rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 focus:border-border"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Status filter chips — clickable to hide/show */}
          {legend && legend.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  <Filter className="h-3 w-3 inline mr-1 -mt-0.5" />
                  Filter by status
                </label>
                {hiddenSlots.size > 0 && (
                  <button
                    onClick={() => setHiddenSlots(new Set())}
                    className="text-[10px] font-semibold text-foreground hover:underline"
                  >
                    Show all
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {legend.map(({ slot, label }) => {
                  const palette = STATUS_PALETTE[slot];
                  const count = statusCounts[slot] || 0;
                  const hidden = hiddenSlots.has(slot);
                  return (
                    <button
                      key={`${slot}-${label}`}
                      onClick={() => toggleSlot(slot)}
                      className={`group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                        hidden ? 'opacity-40 hover:opacity-70' : 'hover:bg-card'
                      }`}
                      aria-pressed={!hidden}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                        style={{ background: palette.bg }}
                      />
                      <span className="text-xs font-medium text-foreground flex-1 truncate">
                        {label}
                      </span>
                      <span className={`text-[10px] font-bold tabular-nums ${
                        hidden ? 'line-through text-muted-foreground' : 'text-muted-foreground'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mini stats */}
          <div className="mt-auto pt-4 border-t border-border">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Visible
              </span>
              <span className="text-2xl font-bold text-foreground tabular-nums">{totalCount}</span>
            </div>
            {hiddenCount > 0 && (
              <p className="text-[10.5px] text-muted-foreground">
                {hiddenCount} hidden by filter
              </p>
            )}
          </div>
        </aside>

        {/* CENTER: calendar grid */}
        <div className="ground-ops-calendar min-w-0 overflow-x-auto bg-card">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView="dayGridMonth"
            events={visibleEvents}
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
              const isMonth = arg.view.type === 'dayGridMonth';
              const time = arg.event.start ? formatTimeShort(arg.event.start) : '';

              if (isList) {
                return (
                  <div className="flex items-center gap-3 py-1">
                    <span
                      className="inline-block h-3 w-3 rounded-sm flex-shrink-0"
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

              // Month view: saturated solid chip with white text — bold, scannable
              if (isMonth) {
                return (
                  <div
                    className="ground-ops-event-chip"
                    style={{
                      background: palette.bg,
                      color: '#ffffff',
                    }}
                  >
                    {time && (
                      <span className="ground-ops-event-chip-time">{time}</span>
                    )}
                    <span className="ground-ops-event-chip-title">{arg.event.title}</span>
                  </div>
                );
              }

              // Time grid: tinted block with bold left bar
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
                    <span className="ground-ops-event-time" style={{ color: palette.bg }}>
                      {time}
                    </span>
                  )}
                  <span className="ground-ops-event-title">{arg.event.title}</span>
                </div>
              );
            }}
          />
        </div>

        {/* RIGHT: agenda */}
        <aside className="hidden lg:flex flex-col gap-4 border-l border-border bg-card p-4 min-w-0">
          <AgendaSection
            label="Today"
            count={todayEvents.length}
            events={todayEvents}
            emptyMessage="Nothing scheduled."
            onEventClick={onEventClick}
          />
          <AgendaSection
            label="Next 7 days"
            count={upcomingEvents.length}
            events={upcomingEvents}
            emptyMessage="No upcoming events."
            showDate
            onEventClick={onEventClick}
          />
        </aside>
      </div>

      {/* ───────── CALENDAR-INTERNAL STYLES ───────── */}
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

        .ground-ops-calendar .fc-theme-standard .fc-scrollgrid,
        .ground-ops-calendar .fc-theme-standard td,
        .ground-ops-calendar .fc-theme-standard th {
          border-color: hsl(var(--border) / 0.7);
        }
        .ground-ops-calendar .fc .fc-scrollgrid {
          border: none;
        }

        /* Column header — small caps, lots of spacing */
        .ground-ops-calendar .fc .fc-col-header-cell {
          background: hsl(var(--muted) / 0.4);
          padding: 14px 4px 12px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .ground-ops-calendar .fc .fc-col-header-cell-cushion {
          color: hsl(var(--muted-foreground));
          text-transform: uppercase;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.16em;
          padding: 0;
        }

        .ground-ops-calendar .fc .fc-daygrid-day {
          background: hsl(var(--card));
          transition: background-color 0.15s ease;
        }
        .ground-ops-calendar .fc .fc-daygrid-day:hover {
          background: hsl(var(--muted) / 0.35);
        }
        .ground-ops-calendar .fc .fc-daygrid-day-frame {
          min-height: 128px;
          padding: 4px;
        }
        .ground-ops-calendar .fc .fc-daygrid-day-top {
          flex-direction: row;
          justify-content: flex-start;
          padding: 4px 4px 4px;
        }
        .ground-ops-calendar .fc .fc-daygrid-day-number {
          color: hsl(var(--foreground));
          font-size: 13px;
          font-weight: 600;
          padding: 4px 7px;
          line-height: 1;
          border-radius: 6px;
          min-width: 24px;
          text-align: center;
          transition: all 0.12s ease;
        }
        .ground-ops-calendar .fc .fc-day-other .fc-daygrid-day-number {
          color: hsl(var(--muted-foreground) / 0.45);
          font-weight: 500;
        }

        /* Today: filled square in foreground color — confident, no animation */
        .ground-ops-calendar .fc .fc-day-today .fc-daygrid-day-number {
          background: hsl(var(--foreground));
          color: hsl(var(--background));
          font-weight: 700;
        }

        .ground-ops-calendar .fc .fc-day-sat,
        .ground-ops-calendar .fc .fc-day-sun {
          background: hsl(var(--muted) / 0.18);
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
          border-radius: 6px;
          overflow: hidden;
        }
        .ground-ops-calendar .fc .fc-event-main { padding: 0 !important; }

        /* Month view: saturated solid chip */
        .ground-ops-calendar .ground-ops-event-chip {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 3px 7px;
          border-radius: 5px;
          min-height: 22px;
          font-size: 11px;
          line-height: 1.25;
          transition: transform 0.15s ease, filter 0.15s ease;
          overflow: hidden;
        }
        .ground-ops-calendar .ground-ops-event-chip-time {
          font-weight: 800;
          font-size: 10.5px;
          opacity: 0.92;
          letter-spacing: 0.01em;
          flex-shrink: 0;
        }
        .ground-ops-calendar .ground-ops-event-chip-title {
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ground-ops-calendar .fc-event:hover .ground-ops-event-chip {
          filter: brightness(1.06);
          transform: translateY(-1px);
        }

        /* Time grid: soft tile w/ left bar */
        .ground-ops-calendar .ground-ops-event-tile {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 6px 8px 6px 9px;
          border-radius: 5px;
          border-left: 3px solid;
          height: 100%;
          font-size: 11.5px;
          line-height: 1.3;
          transition: filter 0.15s ease;
        }
        .ground-ops-calendar .ground-ops-event-time {
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.01em;
        }
        .ground-ops-calendar .ground-ops-event-title {
          font-weight: 600;
        }
        .ground-ops-calendar .fc-event:hover .ground-ops-event-tile {
          filter: brightness(0.97);
        }

        .ground-ops-calendar .fc .fc-daygrid-more-link {
          color: hsl(var(--foreground));
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          margin: 0 4px;
          border-radius: 4px;
          background: hsl(var(--muted) / 0.6);
        }
        .ground-ops-calendar .fc .fc-daygrid-more-link:hover {
          background: hsl(var(--muted));
          text-decoration: none;
        }

        .ground-ops-calendar .fc .fc-popover {
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 12px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
          overflow: hidden;
        }
        .ground-ops-calendar .fc .fc-popover-header {
          background: hsl(var(--muted) / 0.4);
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
          background: hsl(var(--muted) / 0.55) !important;
          color: hsl(var(--muted-foreground));
          padding: 10px 14px;
          font-weight: 800;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .ground-ops-calendar .fc-list-event {
          background: transparent !important;
        }
        .ground-ops-calendar .fc-list-event:hover td {
          background: hsl(var(--muted) / 0.6) !important;
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
    </div>
  );
}

/* ────────────────────────── Agenda sidebar ────────────────────────── */

function AgendaSection({
  label,
  count,
  events,
  emptyMessage,
  showDate = false,
  onEventClick,
}: {
  label: string;
  count: number;
  events: any[];
  emptyMessage: string;
  showDate?: boolean;
  onEventClick?: (info: any) => void;
}) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-baseline justify-between px-1 mb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </h3>
        <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="flex-1 min-h-0 max-h-[360px] overflow-y-auto space-y-1 pr-0.5">
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center">
            <p className="text-xs text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          events.map((ev: any) => (
            <AgendaRow key={ev.id} event={ev} showDate={showDate} onClick={onEventClick} />
          ))
        )}
      </div>
    </div>
  );
}

function AgendaRow({
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
      className="group w-full text-left rounded-lg p-2.5 transition-colors hover:bg-muted/60 flex items-start gap-2.5 border border-transparent hover:border-border"
    >
      <span
        className="mt-1 inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
        style={{ background: palette.bg }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {(time || dateLabel) && (
            <span className="text-[10.5px] font-bold tabular-nums text-muted-foreground flex-shrink-0">
              {[dateLabel, time].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <p className="text-[12.5px] font-semibold text-foreground truncate mt-0.5">
          {event.title}
        </p>
        {locationName && (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground mt-0.5 truncate max-w-full">
            <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate">{locationName}</span>
          </span>
        )}
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
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
