/**
 * Server-side Firebase helper.
 *
 * API routes run on Vercel without a logged-in user, so the client SDK sends
 * requests to Firestore with no auth token — triggering "Missing or
 * insufficient permissions" on every collection.
 *
 * This module keeps a named Firebase app ("server-app") separate from the
 * browser singleton and signs in with admin credentials so that Firestore
 * security rules see a valid request.auth on every server-side call.
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, inMemoryPersistence, setPersistence } from 'firebase/auth';

const SERVER_APP_NAME = 'server-app';

function getServerApp(): FirebaseApp {
  const existing = getApps().find((a) => a.name === SERVER_APP_NAME);
  if (existing) return existing;
  return initializeApp(
    {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    },
    SERVER_APP_NAME,
  );
}

/**
 * Returns an authenticated Firestore instance for server-side API routes.
 *
 * Signs in with FIREBASE_SYNC_EMAIL / FIREBASE_SYNC_PASSWORD on cold starts;
 * on warm lambdas the auth state is cached via auth.currentUser so subsequent
 * calls are instant.
 */
export async function getServerDb(): Promise<Firestore> {
  const app = getServerApp();
  const auth = getAuth(app);

  if (!auth.currentUser) {
    const email = process.env.FIREBASE_SYNC_EMAIL;
    const password = process.env.FIREBASE_SYNC_PASSWORD;
    if (!email || !password) {
      throw new Error(
        'Missing FIREBASE_SYNC_EMAIL or FIREBASE_SYNC_PASSWORD env vars — cannot authenticate server-side Firestore',
      );
    }
    await setPersistence(auth, inMemoryPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  }

  return getFirestore(app);
}
