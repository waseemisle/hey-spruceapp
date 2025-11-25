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
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Home, Users, Building2, ClipboardList, FileText, Receipt,
  Calendar, MessageSquare, LogOut, Menu, X, ShieldCheck, RotateCcw, Wrench, Tag, XCircle, ChevronDown, ChevronRight
} from 'lucide-react';
import ViewControls from '@/components/view-controls';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workOrdersExpanded, setWorkOrdersExpanded] = useState(true);
  const [badgeCounts, setBadgeCounts] = useState({
    locations: 0,
    workOrders: 0,
    messages: 0,
  });
  const router = useRouter();

  useEffect(() => {
    // Check if Firebase is initialized
    if (!auth) {
      console.error('Firebase auth is not initialized. Please check your .env.local file.');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Check if user is admin
        const adminDoc = await getDoc(doc(db, 'adminUsers', firebaseUser.uid));
        if (adminDoc.exists()) {
          setUser({ ...firebaseUser, ...adminDoc.data() });
          setLoading(false);

          // Listen to pending locations count
          const locationsQuery = query(
            collection(db, 'locations'),
            where('status', '==', 'pending')
          );
          const unsubscribeLocations = onSnapshot(locationsQuery, (snapshot) => {
            setBadgeCounts(prev => ({ ...prev, locations: snapshot.size }));
          });

          // Listen to pending work orders count
          const workOrdersQuery = query(
            collection(db, 'workOrders'),
            where('status', '==', 'pending')
          );
          const unsubscribeWorkOrders = onSnapshot(workOrdersQuery, (snapshot) => {
            setBadgeCounts(prev => ({ ...prev, workOrders: snapshot.size }));
          });

          return () => {
            unsubscribeLocations();
            unsubscribeWorkOrders();
          };
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const menuItems = [
    { name: 'Dashboard', href: '/admin-portal', icon: Home, badgeKey: null },
    { name: 'Clients', href: '/admin-portal/clients', icon: Users, badgeKey: null },
    { name: 'Subcontractors', href: '/admin-portal/subcontractors', icon: Users, badgeKey: null },
    { name: 'Admin Users', href: '/admin-portal/admin-users', icon: ShieldCheck, badgeKey: null },
    { name: 'Companies', href: '/admin-portal/subsidiaries', icon: Building2, badgeKey: null },
    { name: 'Companies Permissions', href: '/admin-portal/companies-permissions', icon: ShieldCheck, badgeKey: null },
    { name: 'Locations', href: '/admin-portal/locations', icon: Building2, badgeKey: 'locations' },
    { name: 'Maintenance Requests', href: '/admin-portal/maint-requests', icon: Wrench, badgeKey: null },
    { name: 'Categories', href: '/admin-portal/categories', icon: Tag, badgeKey: null },
    { name: 'Quotes', href: '/admin-portal/quotes', icon: FileText, badgeKey: null },
    { name: 'Invoices', href: '/admin-portal/invoices', icon: Receipt, badgeKey: null },
    { name: 'Scheduled Invoices', href: '/admin-portal/scheduled-invoices', icon: Calendar, badgeKey: null },
    { name: 'Messages', href: '/admin-portal/messages', icon: MessageSquare, badgeKey: 'messages' },
  ];

  const workOrdersSubMenu = [
    { name: 'Standard Work Orders', href: '/admin-portal/work-orders/standard', icon: ClipboardList },
    { name: 'Recurring Work Orders', href: '/admin-portal/recurring-work-orders', icon: RotateCcw },
    { name: 'Maintenance Requests Work Orders', href: '/admin-portal/work-orders/maintenance-requests', icon: Wrench },
    { name: 'Rejected Work Orders', href: '/admin-portal/rejected-work-orders', icon: XCircle },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="bg-card shadow-sm border-b fixed w-full top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileMenuOpen(!mobileMenuOpen);
                } else {
                  setSidebarOpen(!sidebarOpen);
                }
              }}
              className="mr-4 text-muted-foreground hover:text-foreground"
              aria-label="Toggle menu"
            >
              {(sidebarOpen || mobileMenuOpen) ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <Logo href="/admin-portal" size="sm" />
            <span className="ml-3 text-sm text-muted-foreground hidden sm:inline">Admin Portal</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <NotificationBell />
            <span className="text-sm text-muted-foreground hidden md:inline">{user?.email}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="flex pt-16">
        {/* Sidebar - Desktop */}
        <aside
          className={`hidden md:block fixed left-0 h-[calc(100vh-4rem)] bg-card border-r transition-all duration-300 ${
            sidebarOpen ? 'w-64' : 'w-0 -ml-64'
          }`}
        >
          <nav className="p-4 space-y-1 overflow-y-auto h-full">
            {menuItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-foreground rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors relative"
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

            {/* Work Orders Collapsible Section */}
            <div>
              <button
                onClick={() => setWorkOrdersExpanded(!workOrdersExpanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-foreground rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors relative"
              >
                <ClipboardList className="h-5 w-5 flex-shrink-0" />
                <span className="flex-1 text-left">Work Orders</span>
                {badgeCounts.workOrders > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center min-w-[20px]">
                    {badgeCounts.workOrders > 99 ? '99+' : badgeCounts.workOrders}
                  </span>
                )}
                {workOrdersExpanded ? (
                  <ChevronDown className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-shrink-0" />
                )}
              </button>

              {workOrdersExpanded && (
                <div className="ml-4 mt-1 space-y-1">
                  {workOrdersSubMenu.map((subItem) => (
                    <Link
                      key={subItem.name}
                      href={subItem.href}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-foreground rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <subItem.icon className="h-4 w-4 flex-shrink-0" />
                      <span>{subItem.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </aside>

        {/* Sidebar - Mobile */}
        <aside
          className={`md:hidden fixed left-0 h-[calc(100vh-4rem)] bg-card border-r transition-all duration-300 z-50 ${
            mobileMenuOpen ? 'w-64' : 'w-0 -ml-64'
          }`}
        >
          <nav className="p-4 space-y-1 overflow-y-auto h-full">
            {menuItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-foreground rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors relative"
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

            {/* Work Orders Collapsible Section */}
            <div>
              <button
                onClick={() => setWorkOrdersExpanded(!workOrdersExpanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-foreground rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors relative"
              >
                <ClipboardList className="h-5 w-5 flex-shrink-0" />
                <span className="flex-1 text-left">Work Orders</span>
                {badgeCounts.workOrders > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center min-w-[20px]">
                    {badgeCounts.workOrders > 99 ? '99+' : badgeCounts.workOrders}
                  </span>
                )}
                {workOrdersExpanded ? (
                  <ChevronDown className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-shrink-0" />
                )}
              </button>

              {workOrdersExpanded && (
                <div className="ml-4 mt-1 space-y-1">
                  {workOrdersSubMenu.map((subItem) => (
                    <Link
                      key={subItem.name}
                      href={subItem.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-foreground rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <subItem.icon className="h-4 w-4 flex-shrink-0" />
                      <span>{subItem.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main
          className={`flex-1 transition-all duration-300 ${
            sidebarOpen ? 'md:ml-64' : 'md:ml-0'
          }`}
        >
          <div className="p-4 md:p-6 space-y-4">
            <ViewControls />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
