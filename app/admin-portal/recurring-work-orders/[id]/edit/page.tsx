'use client';

import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import RecurringWorkOrderEditForm from '@/components/recurring-work-order-edit-form';

export default function EditRecurringWorkOrder({ params }: { params: { id: string } }) {
  const router = useRouter();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Edit Recurring Work Order</h1>
            <p className="text-muted-foreground mt-2">Update recurring work order settings</p>
          </div>
        </div>

        <RecurringWorkOrderEditForm
          id={params.id}
          onSaved={() => router.push(`/admin-portal/recurring-work-orders/${params.id}`)}
          onCancel={() => router.back()}
        />
      </div>
    </AdminLayout>
  );
}
