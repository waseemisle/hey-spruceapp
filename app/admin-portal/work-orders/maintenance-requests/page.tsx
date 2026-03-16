import { redirect } from 'next/navigation';

export default function MaintenanceRequestsWorkOrders() {
  redirect('/admin-portal/work-orders?type=maintenance');
}
