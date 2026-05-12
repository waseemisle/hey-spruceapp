'use client';

import AdminLayout from '@/components/admin-layout';
import { AdminPortalHeaderExtraProvider } from '@/components/admin-portal-header-extra-context';

export default function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminPortalHeaderExtraProvider>
      <AdminLayout>{children}</AdminLayout>
    </AdminPortalHeaderExtraProvider>
  );
}
