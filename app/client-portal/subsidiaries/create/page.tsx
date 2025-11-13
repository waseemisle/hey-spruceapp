'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '@/components/client-layout';

export default function CreateCompany() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to client dashboard since companies are now admin-only
    router.push('/client-portal');
  }, [router]);

  return (
    <ClientLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    </ClientLayout>
  );
}


