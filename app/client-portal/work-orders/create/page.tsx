'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '@/components/client-layout';

export default function CreateWorkOrderRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/client-portal/work-orders?create=1');
  }, [router]);

  return (
    <ClientLayout>
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-3">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
          <p className="text-sm text-muted-foreground">Opening create work order…</p>
        </div>
      </div>
    </ClientLayout>
  );
}
