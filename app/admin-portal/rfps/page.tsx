import { redirect } from 'next/navigation';

export default function RfpsLegacyRedirect() {
  redirect('/admin-portal/quotes');
}
