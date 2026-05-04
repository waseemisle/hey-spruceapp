/**
 * Shared calendar event model + dedup rules used by all three portals'
 * calendars (admin, client, subcontractor).
 *
 * Why this exists:
 *   Without a shared layer, each calendar built events independently and
 *   could end up showing the same logical job multiple times — e.g.:
 *     • A recurring template event AND its spawned child workOrder for the
 *       same date.
 *     • A quote event with proposedServiceDate AND the eventually-scheduled
 *       workOrder it belongs to.
 *     • A "ghost" event sitting on createdAt because scheduledServiceDate
 *       wasn't set yet, then jumping when set.
 *
 *   The product rule we implement here:
 *     "One logical job = one calendar block that moves cleanly through its
 *      lifecycle. No ghosts, no doubles."
 *
 * Status colors live in STATUS_PALETTE so admin/client/subcontractor stay
 * visually consistent.
 */
import { Timestamp } from 'firebase/firestore';
import { toDate, type QuoteCalendarEvent } from './calendar-utils';
import { formatAddress } from './utils';

export type CalendarAudience = 'admin' | 'client' | 'subcontractor';

/** Status → semantic color slot. Keep in sync with the palette below. */
export type StatusSlot =
  | 'scheduled'   // blue   — confirmed visit time
  | 'assigned'    // cyan   — assigned but not yet scheduled by sub
  | 'pending'     // amber  — needs attention (pending/approved)
  | 'bidding'     // violet — out for bid
  | 'completed'   // emerald
  | 'rejected'    // red    — rejected/overdue
  | 'recurring'   // purple — recurring template
  | 'execution'   // orange — recurring execution (child WO)
  | 'diagnostic'  // indigo — diagnostic quote/visit
  | 'quote'       // teal   — regular quote with proposed date
  | 'neutral';    // gray   — anything we can't classify

export interface StatusColor {
  slot: StatusSlot;
  bg: string;
  border: string;
  text: string;
}

/**
 * Single source of truth for event colors. Tuned for both light and dark
 * backgrounds — the bg is solid enough to read white text on either theme.
 */
export const STATUS_PALETTE: Record<StatusSlot, StatusColor> = {
  scheduled:  { slot: 'scheduled',  bg: '#3b82f6', border: '#2563eb', text: '#ffffff' },
  assigned:   { slot: 'assigned',   bg: '#06b6d4', border: '#0891b2', text: '#ffffff' },
  pending:    { slot: 'pending',    bg: '#f59e0b', border: '#d97706', text: '#ffffff' },
  bidding:    { slot: 'bidding',    bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' },
  completed:  { slot: 'completed',  bg: '#10b981', border: '#059669', text: '#ffffff' },
  rejected:   { slot: 'rejected',   bg: '#ef4444', border: '#dc2626', text: '#ffffff' },
  recurring:  { slot: 'recurring',  bg: '#7c3aed', border: '#6d28d9', text: '#ffffff' },
  execution:  { slot: 'execution',  bg: '#f97316', border: '#ea580c', text: '#ffffff' },
  diagnostic: { slot: 'diagnostic', bg: '#6366f1', border: '#4f46e5', text: '#ffffff' },
  quote:      { slot: 'quote',      bg: '#14b8a6', border: '#0d9488', text: '#ffffff' },
  neutral:    { slot: 'neutral',    bg: '#6b7280', border: '#4b5563', text: '#ffffff' },
};

export function statusToSlot(status: string | undefined): StatusSlot {
  switch ((status || '').toLowerCase()) {
    case 'scheduled':
    case 'accepted_by_subcontractor':
      return 'scheduled';
    case 'assigned':
      return 'assigned';
    case 'pending':
    case 'pending_acceptance':
    case 'approved':
      return 'pending';
    case 'bidding':
    case 'quotes_received':
      return 'bidding';
    case 'completed':
    case 'pending_invoice':
      return 'completed';
    case 'rejected':
    case 'overdue':
      return 'rejected';
    default:
      return 'neutral';
  }
}

export function colorForStatus(status: string | undefined): StatusColor {
  return STATUS_PALETTE[statusToSlot(status)];
}

/* ---------------------------------------------------------------------- */
/*  Work-order → event mapping (single source of truth)                   */
/* ---------------------------------------------------------------------- */

export interface WorkOrderForCalendar {
  id: string;
  workOrderNumber?: string;
  title: string;
  status: string;
  scheduledServiceDate?: Timestamp | Date | null | undefined;
  scheduledServiceTime?: string;
  category?: string;
  locationName?: string;
  locationAddress?: string;
  clientName?: string;
  recurringWorkOrderId?: string;
  isMaintenanceRequestOrder?: boolean;
  approvedQuoteId?: string;
}

export interface WorkOrderCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  url?: string;
  editable?: boolean;
  extendedProps: {
    kind: 'workOrder';
    workOrderId: string;
    workOrderNumber: string;
    locationName?: string;
    locationAddress?: string;
    clientName?: string;
    status: string;
    statusSlot: StatusSlot;
    category?: string;
    isRecurringExecution: boolean;
    recurringWorkOrderId?: string;
    approvedQuoteId?: string;
  };
}

/**
 * Build a single calendar event for a work order. Returns null if there is
 * no `scheduledServiceDate` — we no longer fall back to `createdAt`, since
 * that produced a "ghost" event that jumped when the date was set later.
 *
 * If product wants to surface unscheduled jobs, do it in a separate panel
 * (list view, table) — not by sticking them onto the calendar at the wrong
 * date.
 */
export function buildWorkOrderEvent(
  wo: WorkOrderForCalendar,
  audience: CalendarAudience,
): WorkOrderCalendarEvent | null {
  if (wo.status === 'archived') return null;

  const date = toDate(wo.scheduledServiceDate);
  if (!date) return null; // intentional — no createdAt fallback

  const start = new Date(date);
  if (wo.scheduledServiceTime && /^\d{1,2}:\d{2}/.test(wo.scheduledServiceTime)) {
    const [h, m] = wo.scheduledServiceTime.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) start.setHours(h, m, 0, 0);
  }
  const end = new Date(start);
  end.setHours(end.getHours() + 2);

  const isRecurringExecution = !!(wo.recurringWorkOrderId || wo.isMaintenanceRequestOrder);
  const palette = isRecurringExecution ? STATUS_PALETTE.execution : colorForStatus(wo.status);

  // Title varies per audience — admin sees the client name, sub sees the
  // client name, client doesn't need to see themselves.
  const titleParts: string[] = [wo.title];
  if (audience === 'admin' && wo.clientName) titleParts.push(wo.clientName);
  if (audience === 'subcontractor' && wo.clientName) titleParts.push(wo.clientName);

  const url =
    audience === 'admin'
      ? `/admin-portal/work-orders/${wo.id}`
      : audience === 'client'
        ? `/client-portal/work-orders/${wo.id}`
        : `/subcontractor-portal/assigned`;

  return {
    id: wo.id,
    title: titleParts.join(' — '),
    start,
    end,
    backgroundColor: palette.bg,
    borderColor: palette.border,
    textColor: palette.text,
    url,
    editable: audience === 'admin', // only admin can drag to reschedule
    extendedProps: {
      kind: 'workOrder',
      workOrderId: wo.id,
      workOrderNumber: wo.workOrderNumber || wo.id.slice(-8).toUpperCase(),
      locationName: wo.locationName,
      locationAddress: formatAddress(wo.locationAddress),
      clientName: wo.clientName,
      status: wo.status,
      statusSlot: isRecurringExecution ? 'execution' : statusToSlot(wo.status),
      category: wo.category,
      isRecurringExecution,
      recurringWorkOrderId: wo.recurringWorkOrderId,
      approvedQuoteId: wo.approvedQuoteId,
    },
  };
}

/* ---------------------------------------------------------------------- */
/*  Dedup rules                                                            */
/* ---------------------------------------------------------------------- */

/** Same calendar day check (local time). */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

interface RecurringTemplateEventLike {
  id: string;
  start: Date | string;
  extendedProps?: { workOrderId?: string; isRecurringTemplate?: boolean };
}

/**
 * Drop recurring-template occurrence events whose date already has a
 * spawned child workOrder (which itself becomes a workOrder event). This
 * eliminates the "purple template + orange execution on the same date"
 * double tile that confuses subcontractors.
 *
 * Match key: (parent recurring id, calendar day).
 */
export function suppressTemplateOccurrencesWithChildren<
  T extends RecurringTemplateEventLike,
>(templateEvents: T[], workOrders: WorkOrderForCalendar[]): T[] {
  // Build the "occupied" set: parent recurring id × yyyy-mm-dd
  const occupied = new Set<string>();
  for (const wo of workOrders) {
    if (!wo.recurringWorkOrderId) continue;
    const d = toDate(wo.scheduledServiceDate);
    if (!d) continue;
    const key = `${wo.recurringWorkOrderId}:${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    occupied.add(key);
  }
  return templateEvents.filter((evt) => {
    const parentId = evt.extendedProps?.workOrderId;
    if (!parentId) return true;
    const start = evt.start instanceof Date ? evt.start : new Date(evt.start);
    const key = `${parentId}:${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
    return !occupied.has(key);
  });
}

/**
 * Drop quote events whose backing work order is already scheduled — once
 * the WO has a real scheduledServiceDate, the WO event is the canonical
 * tile and the quote event becomes noise.
 *
 * Also drops quote events whose quote was the one approved on a WO
 * (approvedQuoteId match) regardless of dates, since the WO event is
 * "the same logical job, post-approval".
 */
export function suppressQuotesWithScheduledWO(
  quoteEvents: QuoteCalendarEvent[],
  workOrders: WorkOrderForCalendar[],
): QuoteCalendarEvent[] {
  const scheduledWoIds = new Set<string>();
  const approvedQuoteIds = new Set<string>();
  for (const wo of workOrders) {
    if (wo.approvedQuoteId) approvedQuoteIds.add(wo.approvedQuoteId);
    if (toDate(wo.scheduledServiceDate)) scheduledWoIds.add(wo.id);
  }
  return quoteEvents.filter((q) => {
    if (q.extendedProps.quoteId && approvedQuoteIds.has(q.extendedProps.quoteId)) return false;
    if (q.extendedProps.workOrderId && scheduledWoIds.has(q.extendedProps.workOrderId)) return false;
    return true;
  });
}

/**
 * Final safety pass: dedupe by event id and ensure each underlying
 * workOrderId only contributes one tile per calendar day. If two events
 * with the same workOrderId land on the same day (e.g. quote + WO that
 * sneaks past the rules above), keep the workOrder one.
 */
export function dedupeEventsByJobDay<
  T extends {
    id: string;
    start: Date | string;
    extendedProps?: { workOrderId?: string; kind?: string };
  },
>(events: T[]): T[] {
  // 1) dedupe by id (defensive — should already be unique)
  const byId = new Map<string, T>();
  for (const e of events) byId.set(e.id, e);

  // 2) dedupe (workOrderId, day) — workOrder kind wins
  const byKey = new Map<string, T>();
  for (const e of byId.values()) {
    const woId = e.extendedProps?.workOrderId;
    if (!woId) {
      byKey.set(e.id, e);
      continue;
    }
    const start = e.start instanceof Date ? e.start : new Date(e.start);
    const dayKey = `${woId}:${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
    const existing = byKey.get(dayKey);
    if (!existing) {
      byKey.set(dayKey, e);
      continue;
    }
    const existingKind = existing.extendedProps?.kind;
    const incomingKind = e.extendedProps?.kind;
    // Prefer workOrder events over anything else; otherwise keep the first one.
    if (incomingKind === 'workOrder' && existingKind !== 'workOrder') {
      byKey.set(dayKey, e);
    }
  }
  return Array.from(byKey.values());
}
