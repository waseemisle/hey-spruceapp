import { redirect } from 'next/navigation';

export default function CreateWorkOrderRedirect() {
  redirect('/client-portal/work-orders?create=1');
}
