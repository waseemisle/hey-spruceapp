'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/ui/page-container';

export default function CreateCompany() {
  const router = useRouter();

  useEffect(() => {
    router.push('/client-portal');
  }, [router]);

  return (
    <>
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </PageContainer>
    </>
  );
}


