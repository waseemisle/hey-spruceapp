'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';

type PortalListPageProps = {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  heroAction?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Standard list / settings portal page: hero band + vertical rhythm.
 * Matches the density of the admin work order shell without duplicating the full glass detail header.
 */
export function PortalListPage({ title, subtitle, icon, heroAction, children, className = '' }: PortalListPageProps) {
  return (
    <PageContainer className={className}>
      <PortalHero title={title} subtitle={subtitle} icon={icon} rightPill={heroAction} />
      {children}
    </PageContainer>
  );
}
