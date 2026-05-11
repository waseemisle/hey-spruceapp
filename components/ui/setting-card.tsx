'use client';

import React from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

// ── SettingCard ──────────────────────────────────────────────────────────

type AccentColor = 'blue' | 'purple' | 'emerald' | 'amber' | 'red' | 'gray';

const ACCENT_CLASSES: Record<AccentColor, { border: string; iconBg: string; icon: string }> = {
  blue:    { border: 'border-blue-200 dark:border-blue-800',       iconBg: 'bg-blue-100 dark:bg-blue-900/40',    icon: 'text-blue-600 dark:text-blue-400' },
  purple:  { border: 'border-purple-200 dark:border-purple-800',   iconBg: 'bg-purple-100 dark:bg-purple-900/40', icon: 'text-purple-600 dark:text-purple-400' },
  emerald: { border: 'border-emerald-200 dark:border-emerald-800', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', icon: 'text-emerald-600 dark:text-emerald-400' },
  amber:   { border: 'border-amber-200 dark:border-amber-800',     iconBg: 'bg-amber-100 dark:bg-amber-900/40',  icon: 'text-amber-600 dark:text-amber-400' },
  red:     { border: 'border-red-200 dark:border-red-800',         iconBg: 'bg-red-100 dark:bg-red-900/40',      icon: 'text-red-600 dark:text-red-400' },
  gray:    { border: 'border-border',                               iconBg: 'bg-muted',                           icon: 'text-muted-foreground' },
};

interface SettingCardProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  accent?: AccentColor;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function SettingCard({
  title,
  description,
  icon: Icon,
  accent = 'gray',
  children,
  footer,
}: SettingCardProps) {
  const a = ACCENT_CLASSES[accent];
  return (
    <div className={`rounded-2xl border bg-card overflow-hidden ${a.border}`}>
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        {Icon && (
          <div className={`rounded-lg p-2 flex-shrink-0 ${a.iconBg}`}>
            <Icon className={`h-4 w-4 ${a.icon}`} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-semibold text-sm text-foreground">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
      {footer && <div className="px-5 py-3 border-t border-border bg-muted/30">{footer}</div>}
    </div>
  );
}

// ── StatusPill ───────────────────────────────────────────────────────────

type PillStatus = 'sent' | 'queued' | 'failed' | 'skipped' | 'configured' | 'not-configured' | 'enabled' | 'disabled';

const PILL_STYLES: Record<PillStatus, string> = {
  sent:           'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  queued:         'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  failed:         'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  skipped:        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  configured:     'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  'not-configured': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  enabled:        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  disabled:       'bg-muted text-muted-foreground',
};

const PILL_ICONS: Partial<Record<PillStatus, React.ElementType>> = {
  sent:           CheckCircle2,
  queued:         Clock,
  failed:         XCircle,
  skipped:        XCircle,
  configured:     CheckCircle2,
  'not-configured': XCircle,
  enabled:        CheckCircle2,
  disabled:       XCircle,
};

interface StatusPillProps {
  status: PillStatus;
  label?: string;
  className?: string;
}

export function StatusPill({ status, label, className = '' }: StatusPillProps) {
  const Icon = PILL_ICONS[status];
  const defaultLabel = status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${PILL_STYLES[status]} ${className}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {label ?? defaultLabel}
    </span>
  );
}

// ── SettingRow ───────────────────────────────────────────────────────────

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  indent?: boolean;
}

export function SettingRow({ label, description, children, indent = false }: SettingRowProps) {
  return (
    <div className={`flex items-center justify-between gap-3 ${indent ? 'pl-4 border-l-2 border-border' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
