// Port of web lib/auth-context.tsx. Role-detection order (admin → approved-client →
// approved-subcontractor) matches verbatim. Swapped Next router for expo-router.

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { auth, db } from './firebase';

export type UserRole = 'admin' | 'client' | 'subcontractor' | null;

interface AuthContextType {
  user: User | null;
  userRole: UserRole;
  userProfile: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<User>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const resolveProfile = async (fbUser: User) => {
    // admin first
    const adminDoc = await getDoc(doc(db, 'adminUsers', fbUser.uid));
    if (adminDoc.exists()) {
      setUserRole('admin');
      setUserProfile({ uid: fbUser.uid, ...adminDoc.data() });
      return;
    }
    // approved client
    const clientDoc = await getDoc(doc(db, 'clients', fbUser.uid));
    if (clientDoc.exists()) {
      const data = clientDoc.data();
      if (data.status === 'approved') {
        setUserRole('client');
        setUserProfile({ uid: fbUser.uid, ...data });
      } else {
        setUserRole(null);
        setUserProfile({ uid: fbUser.uid, ...data, _pending: true });
      }
      return;
    }
    // approved subcontractor
    const subDoc = await getDoc(doc(db, 'subcontractors', fbUser.uid));
    if (subDoc.exists()) {
      const data = subDoc.data();
      if (data.status === 'approved') {
        setUserRole('subcontractor');
        setUserProfile({ uid: fbUser.uid, ...data });
      } else {
        setUserRole(null);
        setUserProfile({ uid: fbUser.uid, ...data, _pending: true });
      }
      return;
    }
    setUserRole(null);
    setUserProfile(null);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        try {
          await resolveProfile(fbUser);
        } catch (e) {
          console.warn('[auth] resolveProfile', e);
        }
      } else {
        setUserRole(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const signUp = async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  };

  const signOut = async () => {
    await fbSignOut(auth);
    setUser(null);
    setUserRole(null);
    setUserProfile(null);
    router.replace('/(auth)/login');
  };

  const refreshProfile = async () => {
    if (user) await resolveProfile(user);
  };

  return (
    <AuthContext.Provider
      value={{ user, userRole, userProfile, loading, signIn, signOut, signUp, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
