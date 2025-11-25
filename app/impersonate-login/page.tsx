'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, signInWithCustomToken, getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

// Force dynamic rendering for this page
export const dynamic = 'force-dynamic';

function ImpersonateLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (!token) {
      setStatus('error');
      setErrorMessage('Impersonation token is required');
      return;
    }

    const performLogin = async () => {
      try {
        // Decode the token (browser-compatible base64 decoding)
        let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        const decoded = atob(base64);
        const tokenData = JSON.parse(decoded);

        // Check if token is expired
        if (tokenData.expiresAt < Date.now()) {
          setStatus('error');
          setErrorMessage('Impersonation token has expired');
          return;
        }

        const { customToken, email, password, role, userId, adminUid } = tokenData;

        // Store impersonation state in localStorage before logging in
        const impersonationState = {
          isImpersonating: true,
          adminUid: adminUid,
          impersonatedUserId: userId,
          impersonatedUserRole: role,
          impersonatedUserName: '', // Will be set after fetching user data
          startedAt: Date.now(),
        };
        localStorage.setItem('impersonationState', JSON.stringify(impersonationState));

        // Create a separate Firebase app instance for impersonation
        // This prevents auth state from interfering with admin's session
        const impersonationAppName = `impersonation-${Date.now()}`;
        let impersonationAuth;
        let impersonationDb;
        
        try {
          // Create a separate Firebase app instance for impersonation
          // This prevents auth state from interfering with admin's session
          const existingApps = getApps();
          let impersonationApp;
          
          // Try to find existing impersonation app or create new one
          const existingImpersonationApp = existingApps.find(app => app.name && app.name.startsWith('impersonation-'));
          if (existingImpersonationApp) {
            impersonationApp = existingImpersonationApp;
          } else {
            impersonationApp = initializeApp({
              apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
              authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
              projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
              storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
              messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
              appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
            }, impersonationAppName);
          }
          
          impersonationAuth = getAuth(impersonationApp);
          impersonationDb = getFirestore(impersonationApp);
        } catch (error) {
          console.error('Error creating impersonation app:', error);
          // Fallback to default app
          impersonationAuth = auth;
          impersonationDb = db;
        }

        // Sign in with email/password using separate app instance
        // This creates a separate auth session that won't interfere with admin's session
        let user;
        if (customToken) {
          // Use custom token with separate app instance (legacy support)
          const userCredential = await signInWithCustomToken(impersonationAuth, customToken);
          user = userCredential.user;
        } else if (email && password) {
          // Use email/password with separate app instance - this preserves admin's session
          const userCredential = await signInWithEmailAndPassword(impersonationAuth, email, password);
          user = userCredential.user;
        } else {
          setStatus('error');
          setErrorMessage('Invalid impersonation token: missing authentication method');
          return;
        }

        // Verify the user role matches and update impersonation state with user name
        if (role === 'client') {
          const clientDoc = await getDoc(doc(impersonationDb, 'clients', user.uid));
          if (clientDoc.exists()) {
            const clientData = clientDoc.data();
            // Update impersonation state with user name
            impersonationState.impersonatedUserName = clientData.fullName || clientData.companyName || 'Client';
            localStorage.setItem('impersonationState', JSON.stringify(impersonationState));
            setStatus('success');
            // Redirect to client portal
            router.push('/client-portal');
            return;
          }
        } else if (role === 'subcontractor') {
          const subDoc = await getDoc(doc(impersonationDb, 'subcontractors', user.uid));
          if (subDoc.exists()) {
            const subData = subDoc.data();
            // Update impersonation state with user name
            impersonationState.impersonatedUserName = subData.fullName || subData.businessName || 'Subcontractor';
            localStorage.setItem('impersonationState', JSON.stringify(impersonationState));
            setStatus('success');
            // Redirect to subcontractor portal
            router.push('/subcontractor-portal');
            return;
          }
        }

        setStatus('error');
        setErrorMessage('User role verification failed');
      } catch (error: any) {
        console.error('Error during impersonation login:', error);
        setStatus('error');
        setErrorMessage(error.message || 'Failed to log in');
      }
    };

    performLogin();
  }, [searchParams, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900">Logging in...</h2>
          <p className="text-gray-600 mt-2">Please wait while we sign you in.</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-900 mb-2">Error</h2>
            <p className="text-red-700 mb-4">{errorMessage}</p>
            <a
              href="/admin-portal"
              className="inline-block px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Return to Admin Portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900">Login Successful</h2>
        <p className="text-gray-600 mt-2">Redirecting...</p>
      </div>
    </div>
  );
}

export default function ImpersonateLogin() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900">Loading...</h2>
            <p className="text-gray-600 mt-2">Please wait...</p>
          </div>
        </div>
      }
    >
      <ImpersonateLoginContent />
    </Suspense>
  );
}

