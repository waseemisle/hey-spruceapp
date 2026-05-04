'use client';

import { LucideIcon, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';

export interface HeroStat {
  label: string;
  value: number | string;
  icon: LucideIcon;
  /** Tailwind utility for the icon tint, e.g. 'text-blue-600 dark:text-blue-400'. */
  iconClass?: string;
  /** Tailwind utility for the icon background tint. */
  iconBg?: string;
  /** Optional sublabel under the value (e.g. "+12% vs last week"). */
  trend?: string;
}

interface DashboardHeroProps {
  /** Personalized greeting line (e.g. "Welcome back, Matthew"). */
  greeting: string;
  /** Subtitle below the greeting. */
  subtitle: string;
  /** Icon shown to the left of the greeting. */
  icon: LucideIcon;
  /** Stat tiles. Render up to 4. */
  stats: HeroStat[];
  /** Optional right-side action (e.g. company selector, primary CTA). */
  action?: React.ReactNode;
  /** Optional accent palette — defaults to "blue". */
  accent?: 'blue' | 'emerald' | 'purple';
}

const ACCENT_PALETTE: Record<NonNullable<DashboardHeroProps['accent']>, { gradient: string; orb1: string; orb2: string; iconRing: string }> = {
  blue: {
    gradient: 'from-blue-50/80 via-card to-indigo-50/40 dark:from-blue-950/30 dark:via-card dark:to-indigo-950/20',
    orb1: 'bg-blue-200/40 dark:bg-blue-900/20',
    orb2: 'bg-indigo-200/40 dark:bg-indigo-900/20',
    iconRing: 'text-blue-600 dark:text-blue-400',
  },
  emerald: {
    gradient: 'from-emerald-50/80 via-card to-teal-50/40 dark:from-emerald-950/30 dark:via-card dark:to-teal-950/20',
    orb1: 'bg-emerald-200/40 dark:bg-emerald-900/20',
    orb2: 'bg-teal-200/40 dark:bg-teal-900/20',
    iconRing: 'text-emerald-600 dark:text-emerald-400',
  },
  purple: {
    gradient: 'from-purple-50/80 via-card to-fuchsia-50/40 dark:from-purple-950/30 dark:via-card dark:to-fuchsia-950/20',
    orb1: 'bg-purple-200/40 dark:bg-purple-900/20',
    orb2: 'bg-fuchsia-200/40 dark:bg-fuchsia-900/20',
    iconRing: 'text-purple-600 dark:text-purple-400',
  },
};

/**
 * Polished hero card for portal dashboards. Renders a personalized
 * greeting, optional action slot, and up to 4 inline stat tiles in a
 * gradient panel with ambient blur orbs.
 */
export function DashboardHero({
  greeting,
  subtitle,
  icon: Icon,
  stats,
  action,
  accent = 'blue',
}: DashboardHeroProps) {
  const palette = ACCENT_PALETTE[accent];

  return (
    <Card className={`relative overflow-hidden border-border bg-gradient-to-br ${palette.gradient} shadow-sm`}>
      <div className={`absolute -top-16 -right-16 h-48 w-48 rounded-full ${palette.orb1} blur-3xl pointer-events-none`} />
      <div className={`absolute -bottom-20 -left-16 h-48 w-48 rounded-full ${palette.orb2} blur-3xl pointer-events-none`} />

      <div className="relative p-5 sm:p-6">
        {/* Top row: greeting + action */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="rounded-xl bg-card border border-border shadow-sm p-3 flex-shrink-0">
              <Icon className={`h-6 w-6 ${palette.iconRing}`} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                {greeting}
                <Sparkles className="h-4 w-4 text-amber-400" />
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            </div>
          </div>
          {action && <div className="self-stretch sm:self-start flex-shrink-0">{action}</div>}
        </div>

        {/* Stats grid */}
        {stats.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.slice(0, 4).map((stat) => {
              const StatIcon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="bg-card/80 backdrop-blur border border-border rounded-xl p-4 flex items-center gap-3 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900/60 transition-all"
                >
                  <div className={`flex-shrink-0 rounded-lg ${stat.iconBg || 'bg-muted'} p-2.5`}>
                    <StatIcon className={`h-5 w-5 ${stat.iconClass || 'text-foreground'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold leading-none text-foreground tabular-nums">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{stat.label}</p>
                    {stat.trend && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{stat.trend}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
