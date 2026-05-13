'use client';

import type { ReactNode } from 'react';

/**
 * Full-bleed page backdrop used under portal content (matches
 * admin work order detail: slate wash, dark zinc, edge bleed past layout padding).
 */
export function PortalPageSurface({
  children,
  className = '',
  bleedContent = false,
}: {
  children: ReactNode;
  className?: string;
  /** When true, skip the inner max-width column (rare full-bleed layouts). */
  bleedContent?: boolean;
}) {
  return (
    <div
      className={[
        '-mx-4 md:-mx-6 -mt-2 mb-8 min-h-[calc(100dvh-7.5rem)]',
        'bg-gradient-to-b from-slate-100/95 via-slate-50/50 to-muted/35 px-4 pb-12 pt-1',
        'dark:from-zinc-950 dark:via-zinc-950/80 dark:to-background md:px-6',
        className,
      ].join(' ')}
    >
      {bleedContent ? (
        children
      ) : (
        <div className={PORTAL_MAIN_MAX_WIDTH}>{children}</div>
      )}
    </div>
  );
}

/** Max content width used on the reference work order detail page. */
export const PORTAL_MAIN_MAX_WIDTH = 'mx-auto max-w-[92rem] w-full min-w-0';
