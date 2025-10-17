'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  userRole: 'admin' | 'client' | 'subcontractor' | null;
  userProfile: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, role: 'client' | 'subcontractor') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'client' | 'subcontractor' | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Fetch user role and profile
        try {
          // Check admin collection
          const adminDoc = await getDoc(doc(db, 'adminUsers', firebaseUser.uid));
          if (adminDoc.exists()) {
            setUserRole('admin');
            setUserProfile(adminDoc.data());
            setLoading(false);
            return;
          }

          // Check client collection
          const clientDoc = await getDoc(doc(db, 'clients', firebaseUser.uid));
          if (clientDoc.exists()) {
            const clientData = clientDoc.data();
            if (clientData.status === 'approved') {
              setUserRole('client');
              setUserProfile(clientData);
            }
            setLoading(false);
            return;
          }

          // Check subcontractor collection
          const subcontractorDoc = await getDoc(doc(db, 'subcontractors', firebaseUser.uid));
          if (subcontractorDoc.exists()) {
            const subData = subcontractorDoc.data();
            if (subData.status === 'approved') {
              setUserRole('subcontractor');
              setUserProfile(subData);
            }
            setLoading(false);
            return;
          }

          setUserRole(null);
          setUserProfile(null);
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      } else {
        setUserRole(null);
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setUserRole(null);
      setUserProfile(null);
      router.push('/');
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const signUp = async (email: string, password: string, role: 'client' | 'subcontractor') => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Note: The registration page will handle creating the Firestore document
      return;
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const value = {
    user,
    userRole,
    userProfile,
    loading,
    signIn,
    signOut,
    signUp,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
