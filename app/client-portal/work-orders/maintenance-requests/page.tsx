'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PortalListPage } from '@/components/ui/portal-list-page';
import { Sparkles } from 'lucide-react';

export default function ClientMaintenanceRequestsWorkOrders() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/client-portal/work-orders?type=maintenance');
  }, [router]);

  return (
    <PortalListPage title="Work Orders" subtitle="Redirecting…" icon={Sparkles}>
      <div className="flex h-48 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <p className="mt-4 text-muted-foreground">Redirecting to Maintenance Requests Work Orders…</p>
        </div>
      </div>
    </PortalListPage>
  );
}
