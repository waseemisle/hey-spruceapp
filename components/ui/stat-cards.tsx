'use client';

import { LucideIcon } from 'lucide-react';

export type StatCardColor = 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'gray';

const COLOR_CLASSES: Record<StatCardColor, string> = {
  blue: 'text-blue-600 bg-blue-50 border-blue-100 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-900/50',
  emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900/50',
  amber: 'text-amber-600 bg-amber-50 border-amber-100 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900/50',
  red: 'text-red-600 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-950/40 dark:border-red-900/50',
  purple: 'text-purple-600 bg-purple-50 border-purple-100 dark:text-purple-400 dark:bg-purple-950/40 dark:border-purple-900/50',
  gray: 'text-stone-600 bg-stone-50 border-stone-100 dark:text-stone-400 dark:bg-stone-900/40 dark:border-stone-800/50',
};

export interface StatCardItem {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color: StatCardColor;
}

interface StatCardsProps {
  items: StatCardItem[];
  className?: string;
}

export function StatCards({ items, className = '' }: StatCardsProps) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${className}`}>
      {items.map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className={`rounded-lg border p-4 flex items-center gap-3 ${COLOR_CLASSES[color]}`}
        >
          <Icon className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="text-xl font-bold leading-none">{value}</p>
            <p className="text-xs mt-0.5 opacity-75">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
