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
import { Home, ClipboardList, FileText, CheckSquare, MessageSquare, LogOut, Menu, X } from 'lucide-react';

export default function SubcontractorLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState({
    bidding: 0,
    messages: 0,
  });
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const subDoc = await getDoc(doc(db, 'subcontractors', firebaseUser.uid));
        if (subDoc.exists() && subDoc.data().status === 'approved') {
          setUser({ ...firebaseUser, ...subDoc.data() });
          setLoading(false);

          // Listen to pending bidding work orders count
          const biddingQuery = query(
            collection(db, 'biddingWorkOrders'),
            where('subcontractorId', '==', firebaseUser.uid),
            where('status', '==', 'pending')
          );
          const unsubscribeBidding = onSnapshot(biddingQuery, (snapshot) => {
            setBadgeCounts(prev => ({ ...prev, bidding: snapshot.size }));
          });

          return () => {
            unsubscribeBidding();
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const menuItems = [
    { name: 'Dashboard', href: '/subcontractor-portal', icon: Home, badgeKey: null },
    { name: 'Bidding Work Orders', href: '/subcontractor-portal/bidding', icon: ClipboardList, badgeKey: 'bidding' },
    { name: 'My Quotes', href: '/subcontractor-portal/quotes', icon: FileText, badgeKey: null },
    { name: 'Assigned Jobs', href: '/subcontractor-portal/assigned', icon: CheckSquare, badgeKey: null },
    { name: 'Messages', href: '/subcontractor-portal/messages', icon: MessageSquare, badgeKey: 'messages' },
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
            <Logo href="/subcontractor-portal" size="sm" />
            <span className="ml-3 text-sm text-gray-500 hidden sm:inline">Subcontractor Portal</span>
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
                className="flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-green-50 hover:text-green-600 transition-colors relative"
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
                className="flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-green-50 hover:text-green-600 transition-colors relative"
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
