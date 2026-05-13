'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PortalListPage } from '@/components/ui/portal-list-page';
import { Building2 } from 'lucide-react';

export default function ClientCompanies() {
  const router = useRouter();

  useEffect(() => {
    router.push('/client-portal');
  }, [router]);

  return (
    <PortalListPage title="Subsidiaries" subtitle="Redirecting…" icon={Building2}>
      <div className="flex h-48 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    </PortalListPage>
  );
}
