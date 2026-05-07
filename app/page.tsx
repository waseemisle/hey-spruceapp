import { redirect } from 'next/navigation';

export default function Home() {
  // This app is a multi-portal product; the homepage should not be a public
  // marketing landing page. Route visitors directly to the portal login.
  redirect('/portal-login');
}
