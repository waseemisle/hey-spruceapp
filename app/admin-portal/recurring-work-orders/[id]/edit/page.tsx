'use client';

import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import RecurringWorkOrderEditForm from '@/components/recurring-work-order-edit-form';

import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { RefreshCw } from 'lucide-react';

export default function EditRecurringWorkOrder({ params }: { params: { id: string } }) {
  const router = useRouter();

  return (
    <AdminLayout>
      <PageContainer>
        <PageHeader
          title="Edit Recurring Work Order"
          subtitle="Update recurring work order settings"
          icon={RefreshCw}
          action={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          }
        />
        <RecurringWorkOrderEditForm
          id={params.id}
          onSaved={() => router.push(`/admin-portal/recurring-work-orders/${params.id}`)}
          onCancel={() => router.back()}
        />
      </PageContainer>
    </AdminLayout>
  );
}
