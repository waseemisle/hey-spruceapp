'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { AlertTriangle, LogOut } from 'lucide-react';

interface ImpersonationState {
  isImpersonating: boolean;
  adminUid: string;
  impersonatedUserId: string;
  impersonatedUserRole: 'client' | 'subcontractor';
  impersonatedUserName: string;
  startedAt: number;
}

export default function ImpersonationBanner() {
  const [impersonationState, setImpersonationState] = useState<ImpersonationState | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check for impersonation state in localStorage
    const checkImpersonation = () => {
      try {
        const stored = localStorage.getItem('impersonationState');
        if (stored) {
          const state = JSON.parse(stored) as ImpersonationState;
          if (state.isImpersonating) {
            setImpersonationState(state);
          } else {
            setImpersonationState(null);
          }
        } else {
          setImpersonationState(null);
        }
      } catch (error) {
        console.error('Error reading impersonation state:', error);
        setImpersonationState(null);
      }
    };

    checkImpersonation();

    // Listen for storage changes (in case impersonation is ended in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'impersonationState') {
        checkImpersonation();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Also check periodically in case localStorage is modified directly
    const interval = setInterval(checkImpersonation, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const handleExitImpersonation = async () => {
    try {
      // Sign out the impersonated user
      await auth.signOut();
      
      // Clear impersonation state
      localStorage.removeItem('impersonationState');
      setImpersonationState(null);
      
      // Redirect to admin portal
      router.push('/admin-portal');
    } catch (error) {
      console.error('Error exiting impersonation:', error);
      // Still clear state and redirect
      localStorage.removeItem('impersonationState');
      setImpersonationState(null);
      router.push('/admin-portal');
    }
  };

  if (!impersonationState) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed top-0 z-[100] w-full border-b border-amber-600/30 bg-amber-400/95 text-amber-950 shadow-md backdrop-blur-md dark:border-amber-500/25 dark:bg-amber-950/90 dark:text-amber-50"
    >
      <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-3 px-4 py-2.5 sm:gap-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-900 dark:text-amber-300" aria-hidden />
          <span className="text-sm font-semibold sm:text-base">
            Impersonation active — signed in as{' '}
            <span className="font-bold">{impersonationState.impersonatedUserName}</span>
          </span>
        </div>
        <Button
          onClick={handleExitImpersonation}
          variant="secondary"
          size="sm"
          className="shrink-0 rounded-lg border border-amber-900/30 bg-amber-950 text-amber-50 hover:bg-amber-900 dark:border-amber-400/30 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Exit
        </Button>
      </div>
    </div>
  );
}

