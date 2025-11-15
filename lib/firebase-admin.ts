import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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

  // Initialize Firebase Admin
  // Use NEXT_PUBLIC_FIREBASE_PROJECT_ID as fallback for FIREBASE_PROJECT_ID
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  // If all credentials are provided, use them (production setup)
  if (projectId && clientEmail && privateKey) {
    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return adminApp;
  }

  // Otherwise, use Application Default Credentials (ADC)
  // This works with gcloud CLI authentication or GOOGLE_APPLICATION_CREDENTIALS
  if (!projectId) {
    throw new Error(
      `Firebase Admin requires at least FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID).\n\n` +
      `For local development without service account keys:\n` +
      `1. Install gcloud CLI: https://cloud.google.com/sdk/docs/install\n` +
      `2. Run: gcloud auth application-default login\n` +
      `3. Run: gcloud config set project heyspruceappv2\n` +
      `4. Add to .env.local:\n` +
      `   NEXT_PUBLIC_FIREBASE_PROJECT_ID=heyspruceappv2\n\n` +
      `For production deployment:\n` +
      `Add service account credentials to your hosting environment.`
    );
  }

  console.log('Using Application Default Credentials for Firebase Admin SDK');

  // Initialize with ADC (Application Default Credentials)
  // This will use gcloud authentication or GOOGLE_APPLICATION_CREDENTIALS env var
  adminApp = initializeApp({
    projectId,
  });

  return adminApp;
}

export function getAdminAuth() {
  const app = getAdminApp();
  return getAuth(app);
}

