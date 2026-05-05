/**
 * Shared recurrence-pattern helpers.
 *
 * Originally inlined into the Recurring Work Orders detail page; extracted
 * here so Scheduled Invoices can reuse the exact same scheduling math
 * instead of forking. Both features support the seven canonical labels
 * (DAILY / WEEKLY / BI-WEEKLY / MONTHLY / BI-MONTHLY / QUARTERLY /
 * SEMIANNUALLY) and the same RecurrencePattern shape from `@/types`.
 *
 * Anything time-zone-sensitive (cron firing window, "next 5 dates"
 * preview) flows through `generateAllScheduledDates` so a fix here
 * benefits both surfaces simultaneously.
 */

import type { RecurrencePattern } from '@/types';

export type RecurrencePatternLabel =
  | 'DAILY'
  | 'WEEKLY'
  | 'BI-WEEKLY'
  | 'MONTHLY'
  | 'BI-MONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUALLY';

export const RECURRENCE_PATTERN_LABELS: RecurrencePatternLabel[] = [
  'DAILY',
  'WEEKLY',
  'BI-WEEKLY',
  'MONTHLY',
  'BI-MONTHLY',
  'QUARTERLY',
  'SEMIANNUALLY',
];

/**
 * Coerce any Firestore Timestamp / Date / parseable string into a real
 * Date, returning null on miss. Recurrence math does a lot of date
 * comparisons and one stray `null` cast to a Date wrecks the iteration
 * (NaN compares fail silently to `false`), so we centralise the parse.
 */
export function toSafeDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

interface ResolvedInterval {
  mode: 'daily' | 'weekly' | 'monthly';
  interval: number;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
}

interface ResolveInput {
  recurrencePattern?: RecurrencePattern;
  recurrencePatternLabel?: RecurrencePatternLabel | string;
}

/**
 * Map a (label, pattern) pair to an iteration tuple. Label wins when
 * present — that's what the form persists — and the pattern fields are
 * the fallback for legacy docs imported before labels existed.
 */
export function resolveInterval(input: ResolveInput): ResolvedInterval {
  const pattern = input.recurrencePattern as any;
  const label = input.recurrencePatternLabel;

  switch (label) {
    case 'DAILY':
      return { mode: 'daily', interval: 1, daysOfWeek: pattern?.daysOfWeek ?? [] };
    case 'WEEKLY':
      return { mode: 'weekly', interval: 1 };
    case 'BI-WEEKLY':
      return { mode: 'weekly', interval: 2, daysOfWeek: pattern?.daysOfWeek ?? [] };
    case 'MONTHLY':
      return { mode: 'monthly', interval: 1, daysOfMonth: pattern?.daysOfMonth ?? [] };
    case 'BI-MONTHLY':
      return { mode: 'monthly', interval: 2, daysOfMonth: pattern?.daysOfMonth ?? [] };
    case 'QUARTERLY':
      return { mode: 'monthly', interval: 3, daysOfMonth: pattern?.daysOfMonth ?? [] };
    case 'SEMIANNUALLY':
      return { mode: 'monthly', interval: 6, daysOfMonth: pattern?.daysOfMonth ?? [] };
  }

  // Legacy docs without a label — fall through to the raw pattern.
  if (pattern?.type === 'daily') return { mode: 'daily', interval: pattern.interval || 1, daysOfWeek: pattern.daysOfWeek };
  if (pattern?.type === 'weekly') return { mode: 'weekly', interval: pattern.interval || 1, daysOfWeek: pattern.daysOfWeek };
  return { mode: 'monthly', interval: pattern?.interval || 1, daysOfMonth: pattern?.daysOfMonth };
}

interface GenerateInput extends ResolveInput {
  /** Earliest possible iteration date — pattern.startDate, or pass explicitly. */
  anchor?: Date | null;
  /** Optional fallback when pattern.startDate is missing (e.g. createdAt). */
  fallbackAnchor?: Date | null;
}

/**
 * Generate every scheduled date from the anchor forward, capped at
 * `maxDates`. Used both for the "next N dates" preview in the create
 * form and the full execution timeline in the detail page.
 *
 * Iteration guards (`iters < 730` for daily, `iters < 200` for monthly)
 * prevent infinite loops if the pattern is malformed (e.g. an empty
 * daysOfWeek array on a DAILY filtered pattern).
 */
export function generateAllScheduledDates(
  input: GenerateInput,
  maxDates: number = 200,
): Date[] {
  const pattern = input.recurrencePattern as any;
  const { mode, interval, daysOfWeek, daysOfMonth } = resolveInterval(input);

  const explicitAnchor = input.anchor ?? toSafeDate(pattern?.startDate);
  const anchor = explicitAnchor ?? input.fallbackAnchor ?? new Date();
  anchor.setHours(9, 0, 0, 0);

  const endDate = toSafeDate(pattern?.endDate);
  const results: Date[] = [];

  if (mode === 'daily') {
    const cursor = new Date(anchor);
    const hasDaysFilter = Array.isArray(daysOfWeek) && daysOfWeek.length > 0;
    let iters = 0;
    while (results.length < maxDates && iters < 730) {
      if (endDate && cursor > endDate) break;
      if (!hasDaysFilter || daysOfWeek!.includes(cursor.getDay())) {
        results.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
      iters++;
    }
    return results;
  }

  if (mode === 'weekly') {
    const cursor = new Date(anchor);
    // BI-WEEKLY (interval=2) anchors on the chosen day-of-week
    if (Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
      // Walk forward to the first matching weekday on/after the anchor
      while (!daysOfWeek.includes(cursor.getDay())) {
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    let iters = 0;
    while (results.length < maxDates && iters < 260) {
      if (endDate && cursor > endDate) break;
      results.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + interval * 7);
      iters++;
    }
    return results;
  }

  // monthly / bi-monthly / quarterly / semiannually
  const hasDaysOfMonth = Array.isArray(daysOfMonth) && daysOfMonth.length > 0;
  const sortedDays = hasDaysOfMonth ? [...daysOfMonth!].sort((a, b) => a - b) : [anchor.getDate()];
  const monthCursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 9, 0, 0);
  let iters = 0;
  while (results.length < maxDates && iters < 240) {
    for (const dom of sortedDays) {
      // Clamp to month-end so dayOfMonth=31 in February lands on the 28th/29th.
      const lastDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
      const actualDay = Math.min(dom, lastDay);
      const dt = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), actualDay, 9, 0, 0);
      if (dt < anchor) continue;
      if (endDate && dt > endDate) break;
      if (results.length < maxDates) results.push(dt);
    }
    monthCursor.setMonth(monthCursor.getMonth() + interval);
    iters++;
  }
  return results;
}

/**
 * First scheduled date on or after `from`. Convenience wrapper around
 * generateAllScheduledDates for cron / form computations that only need
 * the next iteration, not the full preview list.
 */
export function computeNextExecution(
  input: GenerateInput,
  from: Date = new Date(),
): Date | null {
  const all = generateAllScheduledDates(input, 50);
  for (const d of all) {
    if (d >= from) return d;
  }
  return all[all.length - 1] ?? null;
}

/**
 * Build a RecurrencePattern object from form state. Centralises the
 * shape so both RWO and Scheduled Invoices populate identical docs and
 * downstream readers (cron, detail-page preview) don't have to branch.
 */
export function buildRecurrencePattern(args: {
  label: RecurrencePatternLabel;
  startDate: Date | string;
  endDate?: Date | string | null;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
}): RecurrencePattern {
  const { label } = args;
  const startDate = typeof args.startDate === 'string' ? new Date(args.startDate) : args.startDate;
  const endDate = args.endDate
    ? (typeof args.endDate === 'string' ? new Date(args.endDate) : args.endDate)
    : undefined;

  const isDaily = label === 'DAILY';
  const isWeeklyish = label === 'WEEKLY' || label === 'BI-WEEKLY';
  const isMonthly = ['MONTHLY', 'BI-MONTHLY', 'QUARTERLY', 'SEMIANNUALLY'].includes(label);

  const intervalMap: Record<RecurrencePatternLabel, number> = {
    DAILY: 1,
    WEEKLY: 1,
    'BI-WEEKLY': 2,
    MONTHLY: 1,
    'BI-MONTHLY': 2,
    QUARTERLY: 3,
    SEMIANNUALLY: 6,
  };

  const pattern: RecurrencePattern = {
    type: isDaily ? 'daily' : isWeeklyish ? 'weekly' : 'monthly',
    interval: intervalMap[label],
    startDate,
    ...(endDate ? { endDate } : {}),
  };

  if ((isDaily || label === 'BI-WEEKLY') && args.daysOfWeek?.length) {
    pattern.daysOfWeek = [...args.daysOfWeek];
  }
  if (isMonthly && args.daysOfMonth?.length) {
    pattern.daysOfMonth = [...args.daysOfMonth];
    if (args.daysOfMonth.length === 1) pattern.dayOfMonth = args.daysOfMonth[0];
  }

  return pattern;
}
