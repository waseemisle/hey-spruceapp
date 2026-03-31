import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { UserRefreshClient } from 'google-auth-library';

let adminApp: App | null = null;

export function getAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  // Check if already initialized
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  // Option 1: service account credentials (preferred)
  if (projectId && clientEmail && privateKey) {
    adminApp = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
    return adminApp;
  }

  // Option 2: OAuth refresh token credentials (when service account key creation is org-policy-blocked)
  const oauthClientId = process.env.FIREBASE_OAUTH_CLIENT_ID;
  const oauthClientSecret = process.env.FIREBASE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.FIREBASE_REFRESH_TOKEN;

  if (oauthClientId && oauthClientSecret && refreshToken) {
    const userRefreshClient = new UserRefreshClient(oauthClientId, oauthClientSecret, refreshToken);
    adminApp = initializeApp({
      credential: {
        getAccessToken: async () => {
          const res = await userRefreshClient.refreshAccessToken();
          const expiry = (res.credentials.expiry_date ?? Date.now() + 3600_000);
          return {
            access_token: res.credentials.access_token!,
            expires_in: Math.floor((expiry - Date.now()) / 1000),
          };
        },
      },
      projectId: projectId ?? undefined,
    });
    return adminApp;
  }

  // Option 3: local dev — Application Default Credentials
  const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';
  if (isProduction) {
    throw new Error(
      'Firebase Admin SDK: set FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, ' +
      'or FIREBASE_OAUTH_CLIENT_ID + FIREBASE_OAUTH_CLIENT_SECRET + FIREBASE_REFRESH_TOKEN.'
    );
  }

  if (!projectId) {
    throw new Error('Firebase Admin requires FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID.');
  }

  console.log('Using Application Default Credentials for Firebase Admin SDK (local dev only)');
  adminApp = initializeApp({ projectId });
  return adminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

/** Returns the Firestore instance for the 'sandbox' database (same Firebase project). */
export function getSandboxAdminFirestore() {
  return getFirestore(getAdminApp(), 'sandbox');
}
