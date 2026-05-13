'use client';

import { Search } from 'lucide-react';

const triggerClass =
  'flex h-10 w-full max-w-full min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-background/80 px-3 text-left text-sm text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto sm:min-w-[200px] sm:max-w-xs';

const kbdClass =
  'hidden shrink-0 sm:inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground';

type PortalGlobalSearchTriggerProps = {
  onClick: () => void;
  desktopHint: string;
  mobileLabel: string;
  shortcutTitle?: string;
};

/** Closed-state search control — same chrome across admin / client / subcontractor portals. */
export function PortalGlobalSearchTrigger({
  onClick,
  desktopHint,
  mobileLabel,
  shortcutTitle = 'Global search',
}: PortalGlobalSearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={triggerClass}
      title={shortcutTitle}
      aria-label={shortcutTitle}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <span className="hidden sm:inline">{desktopHint}</span>
        <span className="sm:hidden">{mobileLabel}</span>
      </span>
      <kbd className={kbdClass}>Ctrl K</kbd>
    </button>
  );
}

/** Panel wrapper for command-palette style search modals. */
export const PORTAL_GLOBAL_SEARCH_PANEL_CLASS =
  'overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_24px_48px_-12px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.04] dark:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)] dark:ring-white/[0.06]';
