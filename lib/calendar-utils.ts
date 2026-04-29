import { Timestamp } from 'firebase/firestore';

export type QuoteCalendarKind = 'diagnostic' | 'quote';

export interface QuoteCalendarEventColors {
  bg: string;
  border: string;
  text: string;
}

const TIME_SLOT_RE = /^(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

const to24Hour = (hour12: number, meridiem: string): number => {
  const m = meridiem.toUpperCase();
  if (m === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
};

export function parseTimeSlot(slot: string | undefined | null, baseDate: Date): { start: Date; end: Date } | null {
  if (!slot) return null;
  const m = slot.match(TIME_SLOT_RE);
  if (!m) return null;
  const start = new Date(baseDate);
  start.setHours(to24Hour(Number(m[1]), m[3]), Number(m[2]), 0, 0);
  const end = new Date(baseDate);
  end.setHours(to24Hour(Number(m[4]), m[6]), Number(m[5]), 0, 0);
  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
}

export const DIAGNOSTIC_EVENT_COLORS: QuoteCalendarEventColors = {
  bg: '#6366f1',
  border: '#4f46e5',
  text: '#ffffff',
};

export const QUOTE_EVENT_COLORS: QuoteCalendarEventColors = {
  bg: '#10b981',
  border: '#059669',
  text: '#ffffff',
};

export const QUOTE_CALENDAR_EXCLUDED_STATUSES = new Set([
  'rejected',
  'declined',
  'expired',
  'withdrawn',
  'cancelled',
  'canceled',
  'archived',
]);

export const toDate = (val: unknown): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val instanceof Timestamp) return val.toDate();
  const anyVal = val as { toDate?: () => Date };
  if (typeof anyVal.toDate === 'function') return anyVal.toDate();
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val as string | number);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export interface QuoteLikeForCalendar {
  id: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle?: string;
  status?: string;
  isDiagnosticQuote?: boolean;
  proposedServiceDate?: unknown;
  proposedServiceTime?: string;
  subcontractorName?: string;
  clientName?: string;
}

export interface QuoteCalendarEvent {
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
    quoteId: string;
    isDiagnosticQuote: boolean;
    isQuoteEvent: true;
    status: string;
    subcontractorName?: string;
    clientName?: string;
  };
}

export function buildQuoteCalendarEvent(
  q: QuoteLikeForCalendar,
  audience: 'admin' | 'client' | 'subcontractor',
): QuoteCalendarEvent | null {
  if (!q.proposedServiceDate) return null;
  if (q.status && QUOTE_CALENDAR_EXCLUDED_STATUSES.has(q.status)) return null;
  const baseDate = toDate(q.proposedServiceDate);
  if (!baseDate) return null;

  const slot = parseTimeSlot(q.proposedServiceTime, baseDate);
  const start = slot?.start ?? (() => { const d = new Date(baseDate); d.setHours(9, 0, 0, 0); return d; })();
  const end = slot?.end;

  const isDiagnostic = !!q.isDiagnosticQuote;
  const colors = isDiagnostic ? DIAGNOSTIC_EVENT_COLORS : QUOTE_EVENT_COLORS;
  const kindLabel = isDiagnostic ? 'Diagnostic' : 'Quote';
  const woRef = q.workOrderNumber || (q.workOrderId ? q.workOrderId.slice(-8).toUpperCase() : '');
  const titleParts = [`${kindLabel}${woRef ? ` — ${woRef}` : ''}`];
  if (q.workOrderTitle) titleParts.push(q.workOrderTitle);
  if (audience === 'admin' && q.clientName) titleParts.push(q.clientName);
  if (audience === 'subcontractor' && q.clientName) titleParts.push(q.clientName);
  if (audience === 'client' && q.subcontractorName) titleParts.push(q.subcontractorName);

  const url =
    audience === 'admin' && q.workOrderId
      ? `/admin-portal/work-orders/${q.workOrderId}`
      : audience === 'client' && isDiagnostic
        ? `/client-portal/diagnostic-requests/${q.id}`
        : audience === 'client' && q.workOrderId
          ? `/client-portal/work-orders/${q.workOrderId}`
          : undefined;

  return {
    id: `quote-${q.id}`,
    title: titleParts.join(' — '),
    start,
    end,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    textColor: colors.text,
    url,
    extendedProps: {
      workOrderId: q.workOrderId || '',
      workOrderNumber: woRef,
      quoteId: q.id,
      isDiagnosticQuote: isDiagnostic,
      isQuoteEvent: true,
      status: q.status || '',
      subcontractorName: q.subcontractorName,
      clientName: q.clientName,
    },
  };
}
