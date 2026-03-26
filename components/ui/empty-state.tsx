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
    <div className={`bg-card rounded-xl border border-border p-16 text-center ${className}`}>
      <div className="h-14 w-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-foreground font-medium">{title}</p>
      {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
    </div>
  );
}
