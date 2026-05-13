'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PortalDetailGlassProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Glass hero shell used on dense portal detail pages (admin work order, etc.).
 * Children should include breadcrumb, title row, and action rail.
 */
export function PortalDetailGlass({ children, className }: PortalDetailGlassProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/85 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.04] backdrop-blur-xl dark:bg-zinc-900/75 dark:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)] dark:ring-white/[0.06]',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sky-400/15 blur-3xl dark:bg-sky-500/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-violet-400/12 blur-3xl dark:bg-violet-600/10"
        aria-hidden
      />
      <div className="relative space-y-5 p-5 sm:p-7">{children}</div>
    </div>
  );
}
