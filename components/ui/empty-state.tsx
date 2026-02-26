'use client';

import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  className?: string;
}

export function EmptyState({ icon: Icon, title, subtitle, className = '' }: EmptyStateProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-16 text-center ${className}`}>
      <div className="h-14 w-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Icon className="h-7 w-7 text-gray-400" />
      </div>
      <p className="text-gray-900 font-medium">{title}</p>
      {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
    </div>
  );
}
