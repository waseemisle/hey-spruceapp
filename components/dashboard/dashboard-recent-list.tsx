'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export interface DashboardRecentItem {
  id: string;
  /** Primary heading (e.g. work order title) */
  title: string;
  /** Subtitle line (e.g. "Maple Street Plaza • Plumbing") */
  subtitle?: string;
  /** Right-aligned amount badge (e.g. "$240.00") */
  amount?: string;
  /** Right-aligned status pill — color from statusTone */
  statusLabel?: string;
  statusTone?: 'green' | 'red' | 'amber' | 'blue' | 'gray';
  /** Where the row's primary "View" / "Open" button navigates */
  href: string;
  /** Optional override label for the action button (default: "View") */
  actionLabel?: string;
}

const TONE_CLASSES: Record<NonNullable<DashboardRecentItem['statusTone']>, string> = {
  green: 'bg-green-50 text-green-700 border-green-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  gray: 'bg-muted text-muted-foreground border-border',
};

export default function DashboardRecentList({
  items,
  emptyText = 'Nothing here right now.',
  viewAllHref,
  viewAllLabel = 'View all',
}: {
  items: DashboardRecentItem[];
  emptyText?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-4 text-sm text-muted-foreground italic">{emptyText}</div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="flex items-center justify-between gap-3 rounded-md border border-border bg-background hover:bg-accent/50 transition-colors px-3 py-2.5 group"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground truncate">{item.title}</div>
            {item.subtitle && (
              <div className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {item.amount && (
              <span className="text-sm font-semibold text-foreground tabular-nums">{item.amount}</span>
            )}
            {item.statusLabel && (
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${TONE_CLASSES[item.statusTone || 'gray']}`}
              >
                {item.statusLabel}
              </span>
            )}
            <span className="text-xs font-medium text-blue-600 group-hover:underline flex items-center gap-1">
              {item.actionLabel || 'View'}
              <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </Link>
      ))}
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="block text-center text-xs font-medium text-blue-600 hover:underline pt-1"
        >
          {viewAllLabel} →
        </Link>
      )}
    </div>
  );
}
