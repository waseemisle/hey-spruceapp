import { redirect } from 'next/navigation';

export default function StandardWorkOrders() {
  redirect('/admin-portal/work-orders?type=standard');
}
