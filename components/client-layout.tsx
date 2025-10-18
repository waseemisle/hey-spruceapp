'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import Logo from '@/components/ui/logo';
import { Home, Building2, ClipboardList, FileText, Receipt, MessageSquare, LogOut } from 'lucide-react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const clientDoc = await getDoc(doc(db, 'clients', firebaseUser.uid));
        if (clientDoc.exists() && clientDoc.data().status === 'approved') {
          setUser({ ...firebaseUser, ...clientDoc.data() });
          setLoading(false);
        } else {
          router.push('/portal-login');
        }
      } else {
        router.push('/portal-login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const menuItems = [
    { name: 'Dashboard', href: '/client-portal', icon: Home },
    { name: 'Locations', href: '/client-portal/locations', icon: Building2 },
    { name: 'Work Orders', href: '/client-portal/work-orders', icon: ClipboardList },
    { name: 'Quotes', href: '/client-portal/quotes', icon: FileText },
    { name: 'Invoices', href: '/client-portal/invoices', icon: Receipt },
    { name: 'Messages', href: '/client-portal/messages', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <Logo href="/client-portal" size="sm" />
            <span className="ml-3 text-sm text-gray-500">Client Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="w-64 min-h-screen bg-white border-r">
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
