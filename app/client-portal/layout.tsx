'use client';

import ClientLayout from '@/components/client-layout';

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return <ClientLayout>{children}</ClientLayout>;
}
