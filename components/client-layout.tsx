'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import Logo from '@/components/ui/logo';
import NotificationBell from '@/components/notification-bell';
import { Home, Building2, ClipboardList, FileText, Receipt, MessageSquare, LogOut, Menu, X } from 'lucide-react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState({
    quotes: 0,
    invoices: 0,
    messages: 0,
  });
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const clientDoc = await getDoc(doc(db, 'clients', firebaseUser.uid));
        if (clientDoc.exists() && clientDoc.data().status === 'approved') {
          setUser({ ...firebaseUser, ...clientDoc.data() });
          setLoading(false);

          // Listen to quotes count (pending/sent_to_client)
          const quotesQuery = query(
            collection(db, 'quotes'),
            where('clientId', '==', firebaseUser.uid),
            where('status', 'in', ['pending', 'sent_to_client'])
          );
          const unsubscribeQuotes = onSnapshot(quotesQuery, (snapshot) => {
            setBadgeCounts(prev => ({ ...prev, quotes: snapshot.size }));
          });

          // Listen to unpaid invoices count
          const invoicesQuery = query(
            collection(db, 'invoices'),
            where('clientId', '==', firebaseUser.uid),
            where('status', 'in', ['sent', 'draft'])
          );
          const unsubscribeInvoices = onSnapshot(invoicesQuery, (snapshot) => {
            setBadgeCounts(prev => ({ ...prev, invoices: snapshot.size }));
          });

          // Listen to unread messages count (if messages collection exists)
          // Note: This will be implemented when messaging system is added
          // const messagesQuery = query(
          //   collection(db, 'messages'),
          //   where('recipientId', '==', firebaseUser.uid),
          //   where('read', '==', false)
          // );
          // const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
          //   setBadgeCounts(prev => ({ ...prev, messages: snapshot.size }));
          // });

          return () => {
            unsubscribeQuotes();
            unsubscribeInvoices();
            // unsubscribeMessages();
          };
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
    { name: 'Dashboard', href: '/client-portal', icon: Home, badgeKey: null },
    { name: 'Companies', href: '/client-portal/subsidiaries', icon: Building2, badgeKey: null },
    { name: 'Locations', href: '/client-portal/locations', icon: Building2, badgeKey: null },
    { name: 'Work Orders', href: '/client-portal/work-orders', icon: ClipboardList, badgeKey: null },
    { name: 'Quotes', href: '/client-portal/quotes', icon: FileText, badgeKey: 'quotes' },
    { name: 'Invoices', href: '/client-portal/invoices', icon: Receipt, badgeKey: 'invoices' },
    { name: 'Messages', href: '/client-portal/messages', icon: MessageSquare, badgeKey: 'messages' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b fixed w-full top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="mr-4 md:hidden text-gray-600 hover:text-gray-900"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <Logo href="/client-portal" size="sm" />
            <span className="ml-3 text-sm text-gray-500 hidden sm:inline">Client Portal</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <NotificationBell />
            <span className="text-sm text-gray-600 hidden md:inline">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="flex pt-16">
        <aside className="hidden md:block w-64 min-h-screen bg-white border-r fixed left-0">
          <nav className="p-4 space-y-1 h-[calc(100vh-4rem)] overflow-y-auto">
            {menuItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors relative"
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.name}</span>
                {item.badgeKey && badgeCounts[item.badgeKey as keyof typeof badgeCounts] > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center min-w-[20px]">
                    {badgeCounts[item.badgeKey as keyof typeof badgeCounts] > 99 ? '99+' : badgeCounts[item.badgeKey as keyof typeof badgeCounts]}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </aside>

        <aside className={`md:hidden fixed left-0 h-[calc(100vh-4rem)] bg-white border-r transition-all duration-300 z-50 ${
          mobileMenuOpen ? 'w-64' : 'w-0 -ml-64'
        }`}>
          <nav className="p-4 space-y-1 h-full overflow-y-auto">
            {menuItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors relative"
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.name}</span>
                {item.badgeKey && badgeCounts[item.badgeKey as keyof typeof badgeCounts] > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center min-w-[20px]">
                    {badgeCounts[item.badgeKey as keyof typeof badgeCounts] > 99 ? '99+' : badgeCounts[item.badgeKey as keyof typeof badgeCounts]}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1 md:ml-64 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
