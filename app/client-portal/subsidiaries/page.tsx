'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';
import { Sparkles } from 'lucide-react';
export default function ClientCompanies() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to client dashboard since companies are now admin-only
    router.push('/client-portal');
  }, [router]);

  return (
    <>
      <PageContainer>
        <PortalHero
          title="Subsidiaries"
          subtitle=""
          icon={Sparkles}
        />
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary"></div>
      </div>
          </PageContainer>
    </>
  );
}


