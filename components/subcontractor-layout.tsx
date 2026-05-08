'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db, storage } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, getFirestore } from 'firebase/firestore';
import { isItemUnviewed, markBadgeViewed, pathnameToBadgeKey, type SubBadgeKey } from '@/lib/sidebar-badges';
import { onAuthStateChanged, getAuth } from '@/lib/firebase-auth';
import { initializeApp, getApps } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import Logo from '@/components/ui/logo';
import NotificationBell from '@/components/notification-bell';
import ProfileMenu from '@/components/profile-menu';
import { Home, ClipboardList, FileText, CheckSquare, ClipboardCheck, MessageSquare, Menu, X, Headphones } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import ViewControls from '@/components/view-controls';
import ImpersonationBanner from '@/components/impersonation-banner';
import SubcontractorGlobalSearchDialog from '@/components/subcontractor-global-search-dialog';

export default function SubcontractorLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<Record<SubBadgeKey, number>>({
    bidding: 0,
    quotes: 0,
    assigned: 0,
    completedJobs: 0,
    messages: 0,
    supportTickets: 0,
  });
  const [firebaseInstances, setFirebaseInstances] = useState({
    authInstance: auth,
    dbInstance: db,
    storageInstance: storage,
  });
  // lastViewedAt map from the subcontractor's profile doc — drives all badge filtering.
  // Stored as a ref because badge listeners need the latest value without re-subscribing.
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
    let unsubscribeBidding: (() => void) | null = null;
    let unsubscribeQuotes: (() => void) | null = null;
    let unsubscribeAssigned: (() => void) | null = null;
    let unsubscribeCompleted: (() => void) | null = null;
    let unsubscribeMessages: (() => void) | null = null;
    let unsubscribeSupportTickets: (() => void) | null = null;
    let unsubscribeUserDoc: (() => void) | null = null;

    type Item = { id: string; updatedAt?: any; createdAt?: any; status?: string; lastMessageTimestamp?: any; senderId?: string };
    const itemsStore: Record<SubBadgeKey, Item[]> = {
      bidding: [], quotes: [], assigned: [], completedJobs: [], messages: [], supportTickets: [],
    };
    let lastViewed: Record<string, any> = {};

    const recompute = () => {
      const next: Record<SubBadgeKey, number> = {
        bidding: 0, quotes: 0, assigned: 0, completedJobs: 0, messages: 0, supportTickets: 0,
      };
      for (const key of Object.keys(itemsStore) as SubBadgeKey[]) {
        const lvKey = lastViewed?.[key];
        for (const item of itemsStore[key]) {
          // Messages use lastMessageTimestamp instead of updatedAt; isItemUnviewed
          // already handles both via toMillis() — pass the right field per key.
          const ts = key === 'messages' ? item.lastMessageTimestamp : item.updatedAt;
          if (isItemUnviewed(ts, item.createdAt, lvKey)) next[key] += 1;
        }
      }
      setBadgeCounts(next);
    };

    const subscribeToAuth = (instances: typeof firebaseInstances) =>
      onAuthStateChanged(instances.authInstance, async (firebaseUser) => {
        // Clean up previous listeners when auth state changes
        unsubscribeBidding?.(); unsubscribeBidding = null;
        unsubscribeQuotes?.(); unsubscribeQuotes = null;
        unsubscribeAssigned?.(); unsubscribeAssigned = null;
        unsubscribeCompleted?.(); unsubscribeCompleted = null;
        unsubscribeMessages?.(); unsubscribeMessages = null;
        unsubscribeSupportTickets?.(); unsubscribeSupportTickets = null;
        unsubscribeUserDoc?.(); unsubscribeUserDoc = null;

        // Reset per-user state
        for (const k of Object.keys(itemsStore) as SubBadgeKey[]) itemsStore[k] = [];
        lastViewed = {};
        setBadgeCounts({ bidding: 0, quotes: 0, assigned: 0, completedJobs: 0, messages: 0, supportTickets: 0 });
        lastViewedRef.current = {};

        if (firebaseUser) {
          setUser((prev: any) => prev?.uid === firebaseUser.uid ? prev : { ...firebaseUser });
          try {
            const subDocRef = doc(instances.dbInstance, 'subcontractors', firebaseUser.uid);
            const subDoc = await getDoc(subDocRef);
            if (subDoc.exists() && subDoc.data().status === 'approved') {
              setUser({ ...firebaseUser, ...subDoc.data() });
              setLoading(false);

              // Live-track lastViewedAt from the user profile doc so badges clear
              // immediately when markBadgeViewed() writes serverTimestamp.
              unsubscribeUserDoc = onSnapshot(subDocRef, (snap) => {
                lastViewed = (snap.data()?.lastViewedAt as Record<string, any>) || {};
                lastViewedRef.current = lastViewed;
                recompute();
              }, (error) => console.error('Subcontractor profile listener error:', error));

              // Pending bidding work orders — sub needs to submit a quote.
              const biddingQuery = query(
                collection(instances.dbInstance, 'biddingWorkOrders'),
                where('subcontractorId', '==', firebaseUser.uid),
                where('status', '==', 'pending')
              );
              unsubscribeBidding = onSnapshot(biddingQuery, (snapshot) => {
                itemsStore.bidding = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                recompute();
              }, (error) => console.error('Bidding badge listener error:', error));

              // My Quotes badge: per product spec, count REJECTED quotes
              // only. Accepted quotes drive the Assigned Jobs badge instead
              // (because acceptance creates an assignedJobs row), so
              // counting them here would double-badge the same event. Sub
              // needs to revisit My Quotes to see why a quote was rejected.
              const quotesQuery = query(
                collection(instances.dbInstance, 'quotes'),
                where('subcontractorId', '==', firebaseUser.uid),
                where('status', '==', 'rejected'),
              );
              unsubscribeQuotes = onSnapshot(quotesQuery, (snapshot) => {
                itemsStore.quotes = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                recompute();
              }, (error) => console.error('Quotes badge listener error:', error));

              // Assigned jobs — listen to the same `assignedJobs` collection
              // the /subcontractor-portal/assigned page reads, so the badge
              // count matches what the user sees on that page exactly.
              // Driving this off `workOrders.assignedTo` previously caused
              // missed updates because the quote-approve route writes
              // `status`+`updatedAt` and `assignedTo` in two separate
              // updateDoc calls — the snapshot can fire before the doc
              // enters the filter.
              const assignedJobsQuery = query(
                collection(instances.dbInstance, 'assignedJobs'),
                where('subcontractorId', '==', firebaseUser.uid),
              );
              unsubscribeAssigned = onSnapshot(assignedJobsQuery, (snapshot) => {
                itemsStore.assigned = snapshot.docs
                  .map(d => ({ id: d.id, ...(d.data() as any) }))
                  // Sub already declined — no longer needs attention.
                  .filter(it => String(it.status || '') !== 'rejected')
                  // Map `assignedAt` into the `updatedAt` slot so the
                  // shared isItemUnviewed comparator picks it up.
                  .map(it => ({ id: it.id, updatedAt: it.assignedAt, createdAt: it.assignedAt || it.createdAt }));
                recompute();
              }, (error) => console.error('Assigned badge listener error:', error));

              // Completed jobs — needs WO status, so still listens on
              // workOrders. Independent of the assigned listener above.
              const completedQuery = query(
                collection(instances.dbInstance, 'workOrders'),
                where('assignedTo', '==', firebaseUser.uid),
              );
              unsubscribeCompleted = onSnapshot(completedQuery, (snapshot) => {
                itemsStore.completedJobs = snapshot.docs
                  .map(d => ({ id: d.id, ...(d.data() as any) }))
                  .filter(it => it.status === 'completed' || it.status === 'pending_invoice');
                recompute();
              }, (error) => console.error('Completed badge listener error:', error));

              // Messages — chats this sub participates in. Count chats whose
              // lastMessageTimestamp is newer than lastViewedAt.messages.
              const chatsQuery = query(
                collection(instances.dbInstance, 'chats'),
                where('participants', 'array-contains', firebaseUser.uid),
              );
              unsubscribeMessages = onSnapshot(chatsQuery, (snapshot) => {
                itemsStore.messages = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                recompute();
              }, (error) => console.error('Messages badge listener error:', error));

              // Support tickets — listen to all of the sub's open tickets, then
              // filter by lastViewedAt. Reuses the existing two-query merge helper
              // by reading items directly via subscribeSubcontractorSupportTickets.
              // Wrapped in try/catch so a transient chunk-load failure doesn't
              // bubble up and trigger the outer redirect-to-login.
              try {
                const { subscribeSubcontractorSupportTickets } = await import('@/lib/support-ticket-snapshots');
                const OPEN = new Set(['open', 'in-progress', 'waiting-on-client', 'waiting-on-admin']);
                unsubscribeSupportTickets = subscribeSubcontractorSupportTickets(
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
              // The subDoc lookup can fail or return a stale "doesn't exist"
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
            // failed await in this block. Just log and recover.
            console.error('Error fetching subcontractor profile (non-fatal):', error);
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
    }, 1000);

    return () => {
      unsubscribe();
      unsubscribeBidding?.(); unsubscribeBidding = null;
      unsubscribeQuotes?.(); unsubscribeQuotes = null;
      unsubscribeAssigned?.(); unsubscribeAssigned = null;
      unsubscribeCompleted?.(); unsubscribeCompleted = null;
      unsubscribeMessages?.(); unsubscribeMessages = null;
      unsubscribeSupportTickets?.(); unsubscribeSupportTickets = null;
      unsubscribeUserDoc?.(); unsubscribeUserDoc = null;
      clearInterval(interval);
    };
  }, [router]);

  // Auto-mark the current page as viewed when the user navigates to it.
  // Writes lastViewedAt[badgeKey] = serverTimestamp() to the sub's profile doc,
  // which the snapshot listener above reads back and clears the badge.
  useEffect(() => {
    const uid = firebaseInstances.authInstance?.currentUser?.uid;
    if (!uid || !pathname) return;
    const key = pathnameToBadgeKey(pathname, 'subcontractor');
    if (!key) return;
    void markBadgeViewed(firebaseInstances.dbInstance, 'subcontractor', uid, key as SubBadgeKey);
  }, [pathname, firebaseInstances]);

  const handleLogout = async () => {
    let authInstance = firebaseInstances.authInstance || auth;
    const dbInstance = firebaseInstances.dbInstance || db;
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const menuItems = [
    { name: 'Dashboard', href: '/subcontractor-portal', icon: Home, badgeKey: null },
    { name: 'Bidding Work Orders', href: '/subcontractor-portal/bidding', icon: ClipboardList, badgeKey: 'bidding' },
    { name: 'My Quotes', href: '/subcontractor-portal/quotes', icon: FileText, badgeKey: 'quotes' },
    { name: 'Assigned Jobs', href: '/subcontractor-portal/assigned', icon: CheckSquare, badgeKey: 'assigned' },
    { name: 'My Completed Jobs', href: '/subcontractor-portal/completed-jobs', icon: ClipboardCheck, badgeKey: 'completedJobs' },
    { name: 'Messages', href: '/subcontractor-portal/messages', icon: MessageSquare, badgeKey: 'messages' },
    { name: 'Support Tickets', href: '/subcontractor-portal/support-tickets', icon: Headphones, badgeKey: 'supportTickets' },
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
            <Logo href="/subcontractor-portal" size="sm" />
            <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:inline border-l border-border pl-3 ml-3">Subcontractor</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
            {user?.uid && <SubcontractorGlobalSearchDialog dbInstance={firebaseInstances.dbInstance} userId={user.uid} />}
            <ThemeToggle />
            <NotificationBell />
            <ProfileMenu
              name={user?.fullName || user?.businessName || user?.displayName}
              email={user?.email}
              photoUrl={user?.profileImageUrl || user?.photoURL}
              accountSettingsHref="/subcontractor-portal/account-settings"
              onLogout={handleLogout}
              accent="emerald"
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
