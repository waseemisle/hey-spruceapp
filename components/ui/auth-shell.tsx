'use client';

import type { LucideIcon } from 'lucide-react';
import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';
import { Sparkles } from 'lucide-react';

export function AuthShell({
  title,
  subtitle,
  icon: Icon = Sparkles,
  contentClassName = 'max-w-md',
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-10">
        <PageContainer>
          {title && <PortalHero title={title} subtitle={subtitle} icon={Icon} />}
          <div className={`mx-auto w-full ${contentClassName}`}>
            {children}
          </div>
        </PageContainer>
      </div>
    </div>
  );
}

