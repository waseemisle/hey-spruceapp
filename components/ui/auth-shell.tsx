'use client';

import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { PortalHero } from '@/components/ui/portal-hero';
import { PORTAL_MAIN_MAX_WIDTH } from '@/components/ui/portal-page-surface';

/**
 * Standalone auth / utility pages (outside portal layouts): same gradient column
 * width and hero band as portal list pages, plus theme toggle.
 */
export function AuthShell({
  title,
  subtitle,
  icon: Icon = Sparkles,
  contentClassName = 'max-w-lg',
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  const showHero = Boolean(trimmedTitle);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div
        className={[
          'min-h-dvh bg-gradient-to-b from-slate-100/95 via-background to-muted/35',
          'dark:from-zinc-950 dark:via-background dark:to-background',
        ].join(' ')}
      >
        <div className={`${PORTAL_MAIN_MAX_WIDTH} min-h-0 px-4 pb-16 pt-4 sm:px-6 sm:pt-6`}>
          <div className="flex justify-end">
            <ThemeToggle />
          </div>
          <div className={`mx-auto w-full min-w-0 ${contentClassName}`}>
            <div className="space-y-6">
              {showHero && Icon && (
                <PortalHero title={trimmedTitle} subtitle={subtitle} icon={Icon} />
              )}
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
