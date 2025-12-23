'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db, storage } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, getFirestore } from 'firebase/firestore';
import { onAuthStateChanged, getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import Logo from '@/components/ui/logo';
import NotificationBell from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { Home, ClipboardList, FileText, CheckSquare, MessageSquare, LogOut, Menu, X } from 'lucide-react';
import ViewControls from '@/components/view-controls';
import ImpersonationBanner from '@/components/impersonation-banner';
import AccountSettingsDialog from './account-settings-dialog';

export default function SubcontractorLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState({
    bidding: 0,
    messages: 0,
  });
  const [firebaseInstances, setFirebaseInstances] = useState({
    authInstance: auth,
    dbInstance: db,
    storageInstance: storage,
  });
  const router = useRouter();

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

    const subscribeToAuth = (instances: typeof firebaseInstances) =>
      onAuthStateChanged(instances.authInstance, async (firebaseUser) => {
        if (firebaseUser) {
          const subDoc = await getDoc(doc(instances.dbInstance, 'subcontractors', firebaseUser.uid));
        if (subDoc.exists() && subDoc.data().status === 'approved') {
            setUser({ ...firebaseUser, ...subDoc.data() });
          setLoading(false);

          // Listen to pending bidding work orders count
          const biddingQuery = query(
              collection(instances.dbInstance, 'biddingWorkOrders'),
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
          // Only redirect if not impersonating (to avoid redirect loop during impersonation login)
          const stored = localStorage.getItem('impersonationState');
          const isCurrentlyImpersonating = stored ? JSON.parse(stored).isImpersonating === true : false;
          if (!isCurrentlyImpersonating) {
            router.push('/portal-login');
          }
        }
      } else {
        // Only redirect if not impersonating (to avoid redirect loop during impersonation login)
        const stored = localStorage.getItem('impersonationState');
        const isCurrentlyImpersonating = stored ? JSON.parse(stored).isImpersonating === true : false;
        if (!isCurrentlyImpersonating) {
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
      clearInterval(interval);
    };
  }, [router]);

  const handleLogout = async () => {
    // Get the correct auth instance (impersonation or regular)
    let authInstance = firebaseInstances.authInstance || auth;
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
    { name: 'My Quotes', href: '/subcontractor-portal/quotes', icon: FileText, badgeKey: null },
    { name: 'Assigned Jobs', href: '/subcontractor-portal/assigned', icon: CheckSquare, badgeKey: null },
    { name: 'Messages', href: '/subcontractor-portal/messages', icon: MessageSquare, badgeKey: 'messages' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <header className={`bg-card shadow-sm border-b fixed w-full z-50 ${isImpersonating ? 'top-[52px]' : 'top-0'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="mr-4 md:hidden text-muted-foreground hover:text-foreground"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <Logo href="/subcontractor-portal" size="sm" />
            <span className="ml-3 text-sm text-muted-foreground hidden sm:inline">Subcontractor Portal</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <NotificationBell />
            <span className="text-sm text-foreground hidden md:inline">{user?.email}</span>
            <AccountSettingsDialog
              user={user}
              role="subcontractor"
              instances={firebaseInstances}
              onProfileUpdated={(updated) => setUser((prev: any) => ({ ...prev, ...updated }))}
            />
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

        <main className="flex-1 md:ml-64">
          <div className="p-4 md:p-6 space-y-4">
            <ViewControls />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
