'use client';

import { LucideIcon } from 'lucide-react';

export type StatCardColor = 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'gray';

const COLOR_CLASSES: Record<StatCardColor, string> = {
  blue: 'text-blue-600 bg-blue-50 border-blue-100',
  emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  amber: 'text-amber-600 bg-amber-50 border-amber-100',
  red: 'text-red-600 bg-red-50 border-red-100',
  purple: 'text-purple-600 bg-purple-50 border-purple-100',
  gray: 'text-gray-600 bg-gray-50 border-gray-100',
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
          className={`rounded-xl border p-4 flex items-center gap-3 ${COLOR_CLASSES[color]}`}
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
