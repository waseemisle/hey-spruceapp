'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import Logo from '@/components/ui/logo';
import NotificationBell from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';
import {
  Home, Users, Building2, ClipboardList, FileText, Receipt,
  Calendar, MessageSquare, LogOut, Menu, X, ShieldCheck, RotateCcw,
  Wrench, Tag, XCircle, ChevronDown, BarChart2, Search, Package, Award, Mail, Headphones,
} from 'lucide-react';
import ViewControls from '@/components/view-controls';
import GlobalSearchDialog from '@/components/global-search-dialog';

type NavChild = { name: string; href: string; icon: React.ElementType };
type NavItem = {
  name: string;
  href?: string;
  icon: React.ElementType;
  badgeKey?: 'locations' | 'workOrders' | 'messages' | 'supportTickets';
  children?: NavChild[];
};

// Grouped into segments so all fit in one row without scrolling
const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/admin-portal', icon: Home },
  {
    name: 'Users',
    icon: Users,
    children: [
      { name: 'Clients', href: '/admin-portal/clients', icon: Users },
      { name: 'Subcontractors', href: '/admin-portal/subcontractors', icon: Users },
      { name: 'Admin Users', href: '/admin-portal/admin-users', icon: ShieldCheck },
    ],
  },
  {
    name: 'Companies',
    icon: Building2,
    children: [
      { name: 'List of Companies', href: '/admin-portal/subsidiaries', icon: Building2 },
      { name: 'Companies Permissions', href: '/admin-portal/companies-permissions', icon: ShieldCheck },
    ],
  },
  {
    name: 'Work Orders',
    icon: ClipboardList,
    badgeKey: 'workOrders',
    children: [
      { name: 'Standard Work Orders', href: '/admin-portal/work-orders/standard', icon: ClipboardList },
      { name: 'Recurring Work Orders', href: '/admin-portal/recurring-work-orders', icon: RotateCcw },
      { name: 'Maint. Req. Work Orders', href: '/admin-portal/work-orders/maintenance-requests', icon: Wrench },
      { name: 'Rejected Work Orders', href: '/admin-portal/rejected-work-orders', icon: XCircle },
    ],
  },
  {
    name: 'Invoices',
    icon: Receipt,
    children: [
      { name: 'Standard Invoices', href: '/admin-portal/invoices/standard', icon: Receipt },
      { name: 'Scheduled Invoices', href: '/admin-portal/scheduled-invoices', icon: Calendar },
    ],
  },
  {
    name: 'Field Ops',
    icon: Wrench,
    children: [
      { name: 'Locations', href: '/admin-portal/locations', icon: Building2 },
      { name: 'Maintenance Requests', href: '/admin-portal/maint-requests', icon: Wrench },
      { name: 'Categories', href: '/admin-portal/categories', icon: Tag },
      { name: 'Assets', href: '/admin-portal/assets', icon: Package },
    ],
  },
  {
    name: 'Procurement',
    icon: FileText,
    children: [
      { name: 'Quotes', href: '/admin-portal/quotes', icon: FileText },
      { name: 'RFPs', href: '/admin-portal/rfps', icon: FileText },
    ],
  },
  {
    name: 'Messaging',
    icon: MessageSquare,
    badgeKey: 'messages',
    children: [
      { name: 'Messages', href: '/admin-portal/messages', icon: MessageSquare },
      { name: 'Email Logs', href: '/admin-portal/email-logs', icon: Mail },
    ],
  },
  {
    name: 'Support',
    href: '/admin-portal/support-tickets',
    icon: Headphones,
    badgeKey: 'supportTickets',
  },
  {
    name: 'Analytics',
    icon: BarChart2,
    children: [
      { name: 'Reports', href: '/admin-portal/reports', icon: BarChart2 },
      { name: 'Analytics', href: '/admin-portal/analytics', icon: BarChart2 },
      { name: 'Contractor Scorecard', href: '/admin-portal/contractor-scorecard', icon: Award },
      { name: 'Provider Search', href: '/admin-portal/provider-search', icon: Search },
    ],
  },
];

export default function AdminLayout({ children, headerExtra }: { children: React.ReactNode; headerExtra?: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpandedItems, setMobileExpandedItems] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [badgeCounts, setBadgeCounts] = useState({ locations: 0, workOrders: 0, messages: 0, supportTickets: 0 });
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const firebaseInstances = { authInstance: auth, dbInstance: db, storageInstance: storage };

  useEffect(() => {
    if (!auth) { setLoading(false); return; }

    let unsubscribeLocations: (() => void) | undefined;
    let unsubscribeWorkOrders: (() => void) | undefined;
    let unsubscribeSupportTickets: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous badge listeners on every auth state change
      unsubscribeLocations?.();
      unsubscribeWorkOrders?.();
      unsubscribeSupportTickets?.();

      if (firebaseUser) {
        try {
          const adminDoc = await getDoc(doc(db, 'adminUsers', firebaseUser.uid));
          if (adminDoc.exists()) {
            setUser({ ...firebaseUser, ...adminDoc.data() });
            setLoading(false);

            const locationsQuery = query(collection(db, 'locations'), where('status', '==', 'pending'));
            unsubscribeLocations = onSnapshot(
              locationsQuery,
              (s) => setBadgeCounts(prev => ({ ...prev, locations: s.size })),
              (err) => console.error('Locations badge listener error:', err),
            );

            const workOrdersQuery = query(collection(db, 'workOrders'), where('status', '==', 'pending'));
            unsubscribeWorkOrders = onSnapshot(
              workOrdersQuery,
              (s) => setBadgeCounts(prev => ({ ...prev, workOrders: s.size })),
              (err) => console.error('Work orders badge listener error:', err),
            );

            const openSupportStatuses = ['open', 'in-progress', 'waiting-on-client', 'waiting-on-admin'];
            unsubscribeSupportTickets = onSnapshot(
              collection(db, 'supportTickets'),
              (s) => {
                const n = s.docs.filter((d) => {
                  const st = d.data().status as string;
                  const unassigned = !d.data().assignedTo;
                  return openSupportStatuses.includes(st) && unassigned;
                }).length;
                setBadgeCounts((prev) => ({ ...prev, supportTickets: n }));
              },
              (err) => console.error('Support tickets badge listener error:', err),
            );
          } else {
            setLoading(false);
            router.push('/portal-login');
          }
        } catch (error) {
          console.error('Error verifying admin user:', error);
          setLoading(false);
          router.push('/portal-login');
        }
      } else {
        setLoading(false);
        router.push('/portal-login');
      }
    });

    return () => {
      unsubscribe();
      unsubscribeLocations?.();
      unsubscribeWorkOrders?.();
      unsubscribeSupportTickets?.();
    };
  }, [router]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/');
  };

  const isItemActive = (item: NavItem): boolean => {
    if (item.href) {
      return item.href === '/admin-portal'
        ? pathname === '/admin-portal'
        : pathname.startsWith(item.href);
    }
    return item.children?.some(child => pathname.startsWith(child.href)) ?? false;
  };

  const getBadge = (key?: string) =>
    key ? badgeCounts[key as keyof typeof badgeCounts] ?? 0 : 0;

  const openMenu = (name: string) => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setOpenDropdown(name);
  };

  const scheduleClose = () => {
    closeTimeoutRef.current = setTimeout(() => setOpenDropdown(null), 150);
  };

  const toggleDropdown = (name: string) => {
    setOpenDropdown(prev => (prev === name ? null : name));
  };

  const toggleMobileItem = (name: string) => {
    setMobileExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
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

  if (!auth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-foreground">Firebase not configured</h1>
          <p className="text-muted-foreground">
            Set your Firebase environment variables so the app can connect. For local development, add them to{' '}
            <code className="bg-muted px-1 rounded text-sm">.env.local</code>. For production (e.g. Vercel), add them in your project&apos;s Environment Variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Fixed two-row header ── */}
      <header className="bg-card border-b fixed w-full top-0 z-50 shadow-sm">

        {/* Row 1 — logo / search / user controls (h-14 = 56px) */}
        <div className="flex items-center justify-between px-4 h-14 border-b">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-muted-foreground hover:text-foreground"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <a href="/admin-portal" className="flex items-center gap-2 no-underline">
              <Logo href="/admin-portal" size="sm" />
              <span className="text-sm text-muted-foreground hidden sm:inline hover:text-foreground transition-colors">Admin Portal</span>
            </a>
          </div>

          <div className="flex-1 flex justify-center px-4">
            <GlobalSearchDialog />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <NotificationBell />
            <span className="text-sm text-muted-foreground hidden md:inline">{user?.email}</span>
            <Link href="/admin-portal/account-settings">
              <Button variant="outline" size="sm">Account Settings</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>

        {/* Row 2 — subnav segments (h-10 = 40px) — desktop only */}
        {/* NOTE: no overflow-x-auto here — that would clip dropdowns. Items are grouped so they fit. */}
        <nav className="hidden md:flex items-stretch h-10">
          {NAV_ITEMS.map((item) => {
            const active = isItemActive(item);
            const badge = getBadge(item.badgeKey);
            const isOpen = openDropdown === item.name;

            if (item.children) {
              return (
                <div
                  key={item.name}
                  className="relative flex items-stretch"
                  onMouseEnter={() => openMenu(item.name)}
                  onMouseLeave={scheduleClose}
                >
                  <button
                    onClick={() => toggleDropdown(item.name)}
                    className={`flex items-center gap-1.5 px-4 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                      active || isOpen
                        ? 'text-foreground border-primary bg-accent/40'
                        : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-accent/50'
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                    {item.name}
                    {badge > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-0.5 flex items-center justify-center">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                    <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown — rendered in normal flow, not clipped */}
                  {isOpen && (
                    <div
                      className="absolute top-full left-0 bg-card border border-border rounded-b-lg shadow-xl min-w-[220px] z-[100] py-1"
                      onMouseEnter={() => openMenu(item.name)}
                      onMouseLeave={scheduleClose}
                    >
                      {item.children.map((child) => {
                        const childActive = pathname.startsWith(child.href);
                        return (
                          <Link
                            key={child.name}
                            href={child.href}
                            onClick={() => setOpenDropdown(null)}
                            className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                              childActive
                                ? 'bg-accent text-accent-foreground font-medium'
                                : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                            }`}
                          >
                            <child.icon className="h-4 w-4 flex-shrink-0" />
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href!}
                className={`flex items-center gap-1.5 px-4 text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors border-b-2 ${
                  active
                    ? 'text-foreground border-primary bg-accent/40'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-accent/50'
                }`}
              >
                <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                {item.name}
                {badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-0.5 flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* ── Mobile menu ── */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed top-14 left-0 right-0 bg-card border-b z-50 md:hidden overflow-y-auto max-h-[calc(100vh-3.5rem)]">
            <nav className="p-2 space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const active = isItemActive(item);
                const badge = getBadge(item.badgeKey);
                const expanded = mobileExpandedItems.has(item.name);

                if (item.children) {
                  return (
                    <div key={item.name}>
                      <button
                        onClick={() => toggleMobileItem(item.name)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg transition-colors ${
                          active
                            ? 'bg-accent text-accent-foreground font-medium'
                            : 'text-foreground hover:bg-accent'
                        }`}
                      >
                        <item.icon className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1 text-left">{item.name}</span>
                        {badge > 0 && (
                          <span className="bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      {expanded && (
                        <div className="ml-4 mt-0.5 space-y-0.5">
                          {item.children.map((child) => {
                            const childActive = pathname.startsWith(child.href);
                            return (
                              <Link
                                key={child.name}
                                href={child.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center gap-3 px-4 py-2 text-sm rounded-lg transition-colors ${
                                  childActive
                                    ? 'bg-accent text-accent-foreground font-medium'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                }`}
                              >
                                <child.icon className="h-4 w-4 flex-shrink-0" />
                                {child.name}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.name}
                    href={item.href!}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg transition-colors ${
                      active
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{item.name}</span>
                    {badge > 0 && (
                      <span className="bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}

      {/* ── Main content — offset for 56px header + 40px subnav ── */}
      <main className="pt-24">
        <div className="p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-4">
            {headerExtra}
            <ViewControls className="flex-1" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
