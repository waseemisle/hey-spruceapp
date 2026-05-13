'use client';

import type { LucideIcon } from 'lucide-react';

export function PortalHero({
  title,
  subtitle,
  icon: Icon,
  rightPill,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  rightPill?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-blue-50 via-card to-purple-50/60 dark:from-blue-950/30 dark:via-card dark:to-purple-950/20">
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-blue-200/30 dark:bg-blue-900/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-purple-200/30 dark:bg-purple-900/20 blur-3xl pointer-events-none" />

      <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-card border border-border shadow-sm p-3 flex-shrink-0">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {rightPill && (
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            {rightPill}
          </div>
        )}
      </div>
    </div>
  );
}

