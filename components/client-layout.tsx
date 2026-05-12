'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db, storage } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, getFirestore } from 'firebase/firestore';
import { isItemUnviewed, markBadgeViewed, pathnameToBadgeKey, type ClientBadgeKey } from '@/lib/sidebar-badges';
import { onAuthStateChanged, getAuth } from '@/lib/firebase-auth';
import { initializeApp, getApps } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import Logo from '@/components/ui/logo';
import NotificationBell from '@/components/notification-bell';
import ProfileMenu from '@/components/profile-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { Home, Building2, ClipboardList, FileText, Receipt, MessageSquare, Menu, X, Wrench, Users, RotateCcw, CreditCard, Headphones, Stethoscope, Layers } from 'lucide-react';
import ViewControls from '@/components/view-controls';
import ImpersonationBanner from '@/components/impersonation-banner';
import ClientGlobalSearchDialog from '@/components/client-global-search-dialog';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<Record<ClientBadgeKey, number>>({
    workOrders: 0,
    recurringWorkOrders: 0,
    locations: 0,
    diagnosticRequests: 0,
    quotes: 0,
    invoices: 0,
    messages: 0,
    supportTickets: 0,
  });
  const [hasMaintenancePermission, setHasMaintenancePermission] = useState(false);
  const [hasMaintenanceRequestsWorkOrdersPermission, setHasMaintenanceRequestsWorkOrdersPermission] = useState(false);
  const [hasViewSubcontractorsPermission, setHasViewSubcontractorsPermission] = useState(false);
  const [hasRecurringWorkOrdersPermission, setHasRecurringWorkOrdersPermission] = useState(false);
  const [hasCombineWorkOrdersPermission, setHasCombineWorkOrdersPermission] = useState(false);
  const [firebaseInstances, setFirebaseInstances] = useState({
    authInstance: auth,
    dbInstance: db,
    storageInstance: storage,
  });
  const lastViewedRef = useRef<Record<string, any>>({});
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check for impersonation state and get the correct auth instance
    const getAuthInstance = () => {
      try {
        const stored = localStorage.getItem('impersonationState');
        if (stored) {
          const state = JSON.parse(stored);
          setIsImpersonating(state.isImpersonating === true);
          
          // If impersonating, use the impersonation Firebase app instance
          if (state.isImpersonating === true && state.appName) {
            const existingApps = getApps();
            const impersonationApp = existingApps.find(app => app.name === state.appName);
            
            if (impersonationApp) {
              return {
                authInstance: getAuth(impersonationApp),
                dbInstance: getFirestore(impersonationApp),
                storageInstance: getStorage(impersonationApp),
              };
            } else {
              // Create the impersonation app if it doesn't exist
              const newApp = initializeApp({
                apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
                authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
                messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
                appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
              }, state.appName);
              
              return {
                authInstance: getAuth(newApp),
                dbInstance: getFirestore(newApp),
                storageInstance: getStorage(newApp),
              };
            }
          }
        } else {
          setIsImpersonating(false);
        }
      } catch {
        setIsImpersonating(false);
      }
      
      // Default to regular auth/db
      return {
        authInstance: auth,
        dbInstance: db,
        storageInstance: storage,
      };
    };

    // Check if Firebase is initialized
    if (!auth) {
      console.error('Firebase auth is not initialized. Please check your .env.local file.');
      setLoading(false);
      router.push('/portal-login');
      return;
    }

    // Per-badge listeners. Each one writes raw items into a closure-scoped store;
    // a single recompute() projects items + lastViewedAt → unread counts.
    let unsubscribeWorkOrders: (() => void) | null = null;
    let unsubscribeRecurring: (() => void) | null = null;
    let unsubscribeLocations: (() => void) | null = null;
    let unsubscribeQuotes: (() => void) | null = null;
    let unsubscribeInvoices: (() => void) | null = null;
    let unsubscribeMessages: (() => void) | null = null;
    let unsubscribeSupportTickets: (() => void) | null = null;
    let unsubscribeUserDoc: (() => void) | null = null;

    type Item = { id: string; updatedAt?: any; createdAt?: any; status?: string; lastMessageTimestamp?: any; isDiagnosticQuote?: boolean };
    const itemsStore: Record<ClientBadgeKey, Item[]> = {
      workOrders: [], recurringWorkOrders: [], locations: [],
      diagnosticRequests: [], quotes: [], invoices: [], messages: [], supportTickets: [],
    };
    let lastViewed: Record<string, any> = {};
    let recomputeTimer: ReturnType<typeof setTimeout> | null = null;

    const recompute = () => {
      if (recomputeTimer) clearTimeout(recomputeTimer);
      recomputeTimer = setTimeout(() => {
        recomputeTimer = null;
        const next: Record<ClientBadgeKey, number> = {
          workOrders: 0, recurringWorkOrders: 0, locations: 0,
          diagnosticRequests: 0, quotes: 0, invoices: 0, messages: 0, supportTickets: 0,
        };
        for (const key of Object.keys(itemsStore) as ClientBadgeKey[]) {
          const lvKey = lastViewed?.[key];
          for (const item of itemsStore[key]) {
            const ts = key === 'messages' ? item.lastMessageTimestamp : item.updatedAt;
            if (isItemUnviewed(ts, item.createdAt, lvKey)) next[key] += 1;
          }
        }
        setBadgeCounts(next);
      }, 120);
    };

    const subscribeToAuth = (instances: typeof firebaseInstances) =>
      onAuthStateChanged(instances.authInstance, async (firebaseUser) => {
        // Clean up previous badge listeners on every auth state change
        unsubscribeWorkOrders?.(); unsubscribeWorkOrders = null;
        unsubscribeRecurring?.(); unsubscribeRecurring = null;
        unsubscribeLocations?.(); unsubscribeLocations = null;
        unsubscribeQuotes?.(); unsubscribeQuotes = null;
        unsubscribeInvoices?.(); unsubscribeInvoices = null;
        unsubscribeMessages?.(); unsubscribeMessages = null;
        unsubscribeSupportTickets?.(); unsubscribeSupportTickets = null;
        unsubscribeUserDoc?.(); unsubscribeUserDoc = null;

        // Reset per-user state
        for (const k of Object.keys(itemsStore) as ClientBadgeKey[]) itemsStore[k] = [];
        lastViewed = {};
        setBadgeCounts({
          workOrders: 0, recurringWorkOrders: 0, locations: 0,
          diagnosticRequests: 0, quotes: 0, invoices: 0, messages: 0, supportTickets: 0,
        });
        lastViewedRef.current = {};

        if (firebaseUser) {
          setUser((prev: any) => prev?.uid === firebaseUser.uid ? prev : { ...firebaseUser });
          try {
            const clientDocRef = doc(instances.dbInstance, 'clients', firebaseUser.uid);
            const clientDoc = await getDoc(clientDocRef);
            if (clientDoc.exists() && clientDoc.data().status === 'approved') {
              const clientData = clientDoc.data();
              setUser({ ...firebaseUser, ...clientData, email: clientData.email || firebaseUser.email });
              // Check maintenance requests permission
              const permissions = clientData.permissions || {};
              setHasMaintenancePermission(permissions.viewMaintenanceRequests || false);
              setHasMaintenanceRequestsWorkOrdersPermission(permissions.viewMaintenanceRequestsWorkOrders || false);
              setHasViewSubcontractorsPermission(permissions.viewSubcontractors || false);
              setHasRecurringWorkOrdersPermission(permissions.viewRecurringWorkOrders || false);
              setHasCombineWorkOrdersPermission(permissions.combineWorkOrders || false);
              setLoading(false);

              // Live-track lastViewedAt from the user profile doc.
              unsubscribeUserDoc = onSnapshot(clientDocRef, (snap) => {
                lastViewed = (snap.data()?.lastViewedAt as Record<string, any>) || {};
                lastViewedRef.current = lastViewed;
                recompute();
              }, (error) => console.error('Client profile listener error:', error));

              // Work orders — anything not in a terminal state.
              const WO_TERMINAL = new Set(['completed', 'cancelled', 'rejected']);
              const workOrdersQuery = query(
                collection(instances.dbInstance, 'workOrders'),
                where('clientId', '==', firebaseUser.uid),
              );
              unsubscribeWorkOrders = onSnapshot(workOrdersQuery, (snapshot) => {
                itemsStore.workOrders = snapshot.docs
                  .map(d => ({ id: d.id, ...(d.data() as any) }))
                  .filter(it => !WO_TERMINAL.has(String(it.status || '')));
                recompute();
              }, (error) => console.error('Work orders badge listener error:', error));

              // Recurring work orders — active and paused (not cancelled).
              const recurringQuery = query(
                collection(instances.dbInstance, 'recurringWorkOrders'),
                where('clientId', '==', firebaseUser.uid),
              );
              unsubscribeRecurring = onSnapshot(recurringQuery, (snapshot) => {
                itemsStore.recurringWorkOrders = snapshot.docs
                  .map(d => ({ id: d.id, ...(d.data() as any) }))
                  .filter(it => it.status !== 'cancelled');
                recompute();
              }, (error) => console.error('Recurring work orders badge listener error:', error));

              // Locations — any (covers status transitions: pending → approved/rejected).
              const locationsQuery = query(
                collection(instances.dbInstance, 'locations'),
                where('clientId', '==', firebaseUser.uid),
              );
              unsubscribeLocations = onSnapshot(locationsQuery, (snapshot) => {
                itemsStore.locations = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                recompute();
              }, (error) => console.error('Locations badge listener error:', error));

              // Quotes — split into regular vs diagnostic. Only 'sent_to_client'
              // are visible to the client; 'pending' hasn't reached them yet.
              const quotesQuery = query(
                collection(instances.dbInstance, 'quotes'),
                where('clientId', '==', firebaseUser.uid),
                where('status', 'in', ['pending', 'sent_to_client'])
              );
              unsubscribeQuotes = onSnapshot(quotesQuery, (snapshot) => {
                const visible = snapshot.docs
                  .map(d => ({ id: d.id, ...(d.data() as any) }))
                  .filter(it => it.status === 'sent_to_client');
                itemsStore.quotes = visible.filter(it => it.isDiagnosticQuote !== true);
                itemsStore.diagnosticRequests = visible.filter(it => it.isDiagnosticQuote === true);
                recompute();
              }, (error) => console.error('Quotes badge listener error:', error));

              // Unpaid invoices.
              const invoicesQuery = query(
                collection(instances.dbInstance, 'invoices'),
                where('clientId', '==', firebaseUser.uid),
                where('status', 'in', ['sent', 'draft'])
              );
              unsubscribeInvoices = onSnapshot(invoicesQuery, (snapshot) => {
                itemsStore.invoices = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                recompute();
              }, (error) => console.error('Invoices badge listener error:', error));

              // Messages — chats this client participates in.
              const chatsQuery = query(
                collection(instances.dbInstance, 'chats'),
                where('participants', 'array-contains', firebaseUser.uid),
              );
              unsubscribeMessages = onSnapshot(chatsQuery, (snapshot) => {
                itemsStore.messages = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                recompute();
              }, (error) => console.error('Messages badge listener error:', error));

              // Support tickets — open tickets the client is involved in.
              // Wrapped in its own try/catch so a transient chunk-load failure
              // (which can happen on App Router nav with stale CDN cache)
              // doesn't propagate up and trigger the outer redirect-to-login.
              try {
                const { subscribeClientSupportTickets } = await import('@/lib/support-ticket-snapshots');
                const OPEN = new Set(['open', 'in-progress', 'waiting-on-client', 'waiting-on-admin']);
                unsubscribeSupportTickets = subscribeClientSupportTickets(
                  instances.dbInstance,
                  firebaseUser.uid,
                  (tickets) => {
                    itemsStore.supportTickets = tickets
                      .filter(t => OPEN.has(String(t.status || '')))
                      .map(t => ({ id: t.id, updatedAt: (t as any).lastActivityAt || (t as any).updatedAt, createdAt: (t as any).createdAt }));
                    recompute();
                  },
                  (error) => console.error('Support tickets badge listener error:', error),
                );
              } catch (importErr) {
                console.error('Support tickets module load failed (non-fatal):', importErr);
              }
            } else {
              setLoading(false);
              // The clientDoc lookup can fail or return a stale "doesn't exist"
              // result during the rapid unmount/remount that App Router does
              // on every nav. Only redirect when the underlying auth singleton
              // also reports no current user — otherwise treat it as transient.
              const stillSignedIn = !!instances.authInstance?.currentUser;
              const stored = localStorage.getItem('impersonationState');
              const isCurrentlyImpersonating = stored ? JSON.parse(stored).isImpersonating === true : false;
              if (!stillSignedIn && !isCurrentlyImpersonating) {
                router.push('/portal-login');
              }
            }
          } catch (error) {
            // Don't kick the user back to the login page on a transient
            // failure (chunk load, network blip, Firestore rules race during
            // page transition). The previous behavior caused a logout every
            // time a sidebar nav click triggered a layout remount with any
            // failed await in this block. Just log and recover — badges will
            // be empty until the next mount, but the user stays signed in.
            console.error('Error fetching client profile (non-fatal):', error);
            setLoading(false);
          }
        } else {
          setLoading(false);
          // The first onAuthStateChanged callback after a layout remount can
          // briefly fire with `null` before Firebase Auth restores the
          // persisted user from IndexedDB. If the underlying singleton still
          // has a current user, this is transient — don't redirect.
          const stillSignedIn = !!instances.authInstance?.currentUser;
          const stored = localStorage.getItem('impersonationState');
          const isCurrentlyImpersonating = stored ? JSON.parse(stored).isImpersonating === true : false;
          if (!stillSignedIn && !isCurrentlyImpersonating) {
            router.push('/portal-login');
          }
        }
      });

    let instances = getAuthInstance();
    setFirebaseInstances(instances);
    let unsubscribe = subscribeToAuth(instances);

    // Check impersonation state periodically
    const interval = setInterval(() => {
      const nextInstances = getAuthInstance();
      const changed = nextInstances.authInstance !== instances.authInstance;
      if (changed) {
        unsubscribe();
        instances = nextInstances;
        setFirebaseInstances(nextInstances);
        unsubscribe = subscribeToAuth(nextInstances);
      }
    }, 3000);

    return () => {
      if (recomputeTimer) clearTimeout(recomputeTimer);
      unsubscribe();
      unsubscribeWorkOrders?.(); unsubscribeWorkOrders = null;
      unsubscribeRecurring?.(); unsubscribeRecurring = null;
      unsubscribeLocations?.(); unsubscribeLocations = null;
      unsubscribeQuotes?.(); unsubscribeQuotes = null;
      unsubscribeInvoices?.(); unsubscribeInvoices = null;
      unsubscribeMessages?.(); unsubscribeMessages = null;
      unsubscribeSupportTickets?.(); unsubscribeSupportTickets = null;
      unsubscribeUserDoc?.(); unsubscribeUserDoc = null;
      clearInterval(interval);
    };
  }, [router]);

  // Auto-mark the current page as viewed when the client navigates to it.
  // Writes lastViewedAt[badgeKey] = serverTimestamp() to the client's profile doc;
  // the snapshot listener above reads it back and clears the badge.
  useEffect(() => {
    const uid = firebaseInstances.authInstance?.currentUser?.uid;
    if (!uid || !pathname) return;
    const key = pathnameToBadgeKey(pathname, 'client');
    if (!key) return;
    void markBadgeViewed(firebaseInstances.dbInstance, 'client', uid, key as ClientBadgeKey);
  }, [pathname, firebaseInstances]);

  const handleLogout = async () => {
    let authInstance = firebaseInstances.authInstance || auth;
    const dbInstance = firebaseInstances.dbInstance || db;
    // Update login log with logout time
    if (authInstance.currentUser && dbInstance) {
      try {
        const { getDocs, query: q, collection: col, where: w, orderBy, limit: lim, updateDoc, serverTimestamp } = await import('firebase/firestore');
        const snap = await getDocs(q(col(dbInstance, 'emailLogs'), w('type', '==', 'user_login'), w('userId', '==', authInstance.currentUser.uid), w('logoutAt', '==', null), orderBy('createdAt', 'desc'), lim(1)));
        if (snap.docs.length > 0) {
          const loginAt = snap.docs[0].data().loginAt?.toDate?.();
          const duration = loginAt ? Math.round((Date.now() - loginAt.getTime()) / 60000) : null;
          await updateDoc(snap.docs[0].ref, { logoutAt: serverTimestamp(), sessionDuration: duration });
        }
      } catch {}
    }
    await authInstance.signOut();
    localStorage.removeItem('impersonationState');
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
    { name: 'Locations', href: '/client-portal/locations', icon: Building2, badgeKey: 'locations' },
    { name: 'Work Orders', href: '/client-portal/work-orders', icon: ClipboardList, badgeKey: 'workOrders' },
    { name: 'Recurring Work Orders', href: '/client-portal/recurring-work-orders', icon: RotateCcw, badgeKey: 'recurringWorkOrders' },
    ...(hasCombineWorkOrdersPermission ? [{ name: 'Combined Work Orders', href: '/client-portal/work-order-groups', icon: Layers, badgeKey: null }] : []),
    ...(hasViewSubcontractorsPermission ? [{ name: 'Subcontractors', href: '/client-portal/subcontractors', icon: Users, badgeKey: null }] : []),
    { name: 'Diagnostic Requests', href: '/client-portal/diagnostic-requests', icon: Stethoscope, badgeKey: 'diagnosticRequests' },
    { name: 'Quotes', href: '/client-portal/quotes', icon: FileText, badgeKey: 'quotes' },
    { name: 'Invoices', href: '/client-portal/invoices', icon: Receipt, badgeKey: 'invoices' },
    { name: 'Payment Methods', href: '/client-portal/payment-methods', icon: CreditCard, badgeKey: null },
    { name: 'Messages', href: '/client-portal/messages', icon: MessageSquare, badgeKey: 'messages' },
    { name: 'Support Tickets', href: '/client-portal/support-tickets', icon: Headphones, badgeKey: 'supportTickets' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <header className={`bg-card shadow-sm border-b fixed w-full z-50 ${isImpersonating ? 'top-[52px]' : 'top-0'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="mr-2 sm:mr-4 md:hidden text-muted-foreground hover:text-foreground"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <Logo href="/client-portal" size="sm" />
            <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:inline border-l border-border pl-3 ml-3">Client</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
            {user?.uid && <ClientGlobalSearchDialog dbInstance={firebaseInstances.dbInstance} userId={user.uid} />}
            <ThemeToggle />
            <NotificationBell />
            {user?.companyName && (
              <span className="hidden lg:inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-full px-2 py-1 bg-card">
                <Building2 className="h-3 w-3" />
                {user.companyName}
              </span>
            )}
            <ProfileMenu
              name={user?.fullName || user?.displayName}
              email={user?.email}
              photoUrl={user?.profileImageUrl || user?.photoURL}
              accountSettingsHref="/client-portal/account-settings"
              onLogout={handleLogout}
              accent="blue"
            />
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className={`flex ${isImpersonating ? 'pt-[68px]' : 'pt-16'}`}>
        <aside className="hidden md:block w-64 min-h-screen bg-card border-r fixed left-0">
          <nav className="p-4 space-y-1 h-[calc(100vh-4rem)] overflow-y-auto">
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
          </nav>
        </aside>

        <aside className={`md:hidden fixed left-0 h-[calc(100vh-4rem)] bg-card border-r transition-all duration-300 z-50 ${
          mobileMenuOpen ? 'w-64' : 'w-0 -ml-64'
        }`}>
          <nav className="p-4 space-y-1 h-full overflow-y-auto">
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
          </nav>
        </aside>

        <main className="flex-1 md:ml-64 min-w-0 overflow-x-hidden">
          <div className="p-4 md:p-6 space-y-4">
            <div className="flex items-center gap-4">
              <ViewControls className="flex-1" />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
