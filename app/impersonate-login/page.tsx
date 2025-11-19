'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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

        const { email, password, role, userId, adminUid } = tokenData;

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

        // Sign in with email and password
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Verify the user role matches and update impersonation state with user name
        if (role === 'client') {
          const clientDoc = await getDoc(doc(db, 'clients', user.uid));
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
          const subDoc = await getDoc(doc(db, 'subcontractors', user.uid));
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

