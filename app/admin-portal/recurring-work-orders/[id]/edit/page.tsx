'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import RecurringWorkOrderEditForm from '@/components/recurring-work-order-edit-form';
import { PortalListPage } from '@/components/ui/portal-list-page';

export default function EditRecurringWorkOrder({ params }: { params: { id: string } }) {
  const router = useRouter();

  return (
    <>
      <PortalListPage
        title="Edit Recurring Work Order"
        subtitle="Update recurring work order settings"
        icon={RefreshCw}
        heroAction={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        }
      >
        <RecurringWorkOrderEditForm
          id={params.id}
          onSaved={() => router.push(`/admin-portal/recurring-work-orders/${params.id}`)}
          onCancel={() => router.back()}
        />
      </PortalListPage>
    </>
  );
}
