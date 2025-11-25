'use client';

import { useEffect, useState } from 'react';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getApps, initializeApp } from 'firebase/app';
import { auth as defaultAuth, db as defaultDb } from './firebase';

/**
 * Hook to get the correct Firebase auth and db instances based on impersonation state.
 * During impersonation, returns the impersonation app's instances.
 * Otherwise, returns the default instances.
 */
export function useFirebaseInstance() {
  const [authInstance, setAuthInstance] = useState<Auth>(defaultAuth);
  const [dbInstance, setDbInstance] = useState<Firestore>(defaultDb);

  useEffect(() => {
    const getInstances = () => {
      try {
        const stored = localStorage.getItem('impersonationState');
        if (stored) {
          const state = JSON.parse(stored);
          
          if (state.isImpersonating === true && state.appName) {
            const existingApps = getApps();
            const impersonationApp = existingApps.find(app => app.name === state.appName);
            
            if (impersonationApp) {
              setAuthInstance(getAuth(impersonationApp));
              setDbInstance(getFirestore(impersonationApp));
              return;
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
              
              setAuthInstance(getAuth(newApp));
              setDbInstance(getFirestore(newApp));
              return;
            }
          }
        }
      } catch (error) {
        console.error('Error getting Firebase instances:', error);
      }
      
      // Default to regular instances
      setAuthInstance(defaultAuth);
      setDbInstance(defaultDb);
    };

    getInstances();

    // Check for changes periodically (e.g., when impersonation state changes)
    const interval = setInterval(getInstances, 1000);

    return () => clearInterval(interval);
  }, []);

  return { auth: authInstance, db: dbInstance };
}

