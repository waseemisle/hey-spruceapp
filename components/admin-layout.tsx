'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Home, Users, Building2, ClipboardList, FileText, Receipt,
  Calendar, MessageSquare, LogOut, Menu, X
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Check if user is admin
        const adminDoc = await getDoc(doc(db, 'adminUsers', firebaseUser.uid));
        if (adminDoc.exists()) {
          setUser({ ...firebaseUser, ...adminDoc.data() });
          setLoading(false);
        } else {
          // Not an admin, redirect
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const menuItems = [
    { name: 'Dashboard', href: '/admin-portal', icon: Home },
    { name: 'Clients', href: '/admin-portal/clients', icon: Users },
    { name: 'Subcontractors', href: '/admin-portal/subcontractors', icon: Users },
    { name: 'Locations', href: '/admin-portal/locations', icon: Building2 },
    { name: 'Work Orders', href: '/admin-portal/work-orders', icon: ClipboardList },
    { name: 'Quotes', href: '/admin-portal/quotes', icon: FileText },
    { name: 'Invoices', href: '/admin-portal/invoices', icon: Receipt },
    { name: 'Scheduled Invoices', href: '/admin-portal/scheduled-invoices', icon: Calendar },
    { name: 'Messages', href: '/admin-portal/messages', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <header className="bg-white shadow-sm border-b fixed w-full top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="mr-4 text-gray-600 hover:text-gray-900"
            >
              {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <h1 className="text-xl font-bold text-purple-600">Hey Spruce Admin</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex pt-16">
        {/* Sidebar */}
        <aside
          className={`fixed left-0 h-[calc(100vh-4rem)] bg-white border-r transition-all duration-300 ${
            sidebarOpen ? 'w-64' : 'w-0 -ml-64'
          }`}
        >
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-purple-50 hover:text-purple-600 transition-colors"
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main
          className={`flex-1 transition-all duration-300 ${
            sidebarOpen ? 'ml-64' : 'ml-0'
          }`}
        >
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
