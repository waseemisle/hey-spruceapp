'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin-layout';
import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';
import { Sparkles } from 'lucide-react';

export default function StandardInvoices() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin-portal/invoices');
  }, [router]);

  return (
    <AdminLayout>
      <PageContainer>
        <PortalHero title="Invoices" subtitle="Redirecting…" icon={Sparkles} />
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </PageContainer>
    </AdminLayout>
  );
}
