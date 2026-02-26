'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientMaintenanceRequestsWorkOrders() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/client-portal/work-orders?type=maintenance');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Redirecting to Maintenance Requests Work Orders...</p>
      </div>
    </div>
  );
}
