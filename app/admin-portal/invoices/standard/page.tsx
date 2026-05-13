'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PortalListPage } from '@/components/ui/portal-list-page';
import { Sparkles } from 'lucide-react';

export default function StandardInvoices() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin-portal/invoices');
  }, [router]);

  return (
    <PortalListPage title="Invoices" subtitle="Redirecting…" icon={Sparkles}>
      <div className="flex h-48 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    </PortalListPage>
  );
}
