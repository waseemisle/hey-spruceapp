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

  // Check if we're in a production environment (Vercel, etc.)
  // ADC (Application Default Credentials) doesn't work on Vercel
  const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';

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

  // In production (Vercel), require service account credentials
  // ADC doesn't work on Vercel because it tries to access GCP metadata service
  if (isProduction) {
    throw new Error(
      `Firebase Admin SDK requires service account credentials in production.\n\n` +
      `Please set the following environment variables in Vercel:\n` +
      `- FIREBASE_PROJECT_ID (or use NEXT_PUBLIC_FIREBASE_PROJECT_ID)\n` +
      `- FIREBASE_CLIENT_EMAIL\n` +
      `- FIREBASE_PRIVATE_KEY\n\n` +
      `To get these credentials:\n` +
      `1. Go to Firebase Console → Project Settings → Service Accounts\n` +
      `2. Click "Generate New Private Key"\n` +
      `3. Add the values to Vercel environment variables\n\n` +
      `See FIREBASE_ADMIN_SETUP.md for detailed instructions.`
    );
  }

  // For local development, try Application Default Credentials (ADC)
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
      `Or add service account credentials to .env.local (recommended).`
    );
  }

  console.log('Using Application Default Credentials for Firebase Admin SDK (local development only)');

  // Initialize with ADC (Application Default Credentials)
  // This will use gcloud authentication or GOOGLE_APPLICATION_CREDENTIALS env var
  // Only works in local development or GCP environments
  adminApp = initializeApp({
    projectId,
  });

  return adminApp;
}

export function getAdminAuth() {
  const app = getAdminApp();
  return getAuth(app);
}

