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
    <div className="bg-yellow-400 w-full fixed top-0 z-[100] shadow-md">
      <div className="max-w-full px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-black flex-shrink-0" />
            <span className="text-black font-semibold text-sm sm:text-base">
              Impersonation Mode Active - Logged in as{' '}
              <span className="font-bold">{impersonationState.impersonatedUserName}</span>
            </span>
          </div>
          <Button
            onClick={handleExitImpersonation}
            variant="default"
            size="sm"
            className="bg-amber-900 hover:bg-amber-950 text-amber-50 border-amber-900 rounded-md flex-shrink-0"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Exit Impersonation
          </Button>
        </div>
      </div>
    </div>
  );
}

