import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let stagingApp: App | null = null;

export function getStagingAdminApp(): App {
  if (stagingApp) return stagingApp;

  const existing = getApps().find(a => a.name === 'staging');
  if (existing) {
    stagingApp = existing;
    return stagingApp;
  }

  const projectId = process.env.STAGING_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.STAGING_FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.STAGING_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Staging Firebase credentials not configured. ' +
      'Set STAGING_FIREBASE_PROJECT_ID, STAGING_FIREBASE_CLIENT_EMAIL, and ' +
      'STAGING_FIREBASE_PRIVATE_KEY in Vercel Production environment variables.',
    );
  }

  stagingApp = initializeApp(
    { credential: cert({ projectId, clientEmail, privateKey }) },
    'staging',
  );
  return stagingApp;
}

export function getStagingFirestore() {
  return getFirestore(getStagingAdminApp());
}

export function isStagingConfigured(): boolean {
  return !!(
    process.env.STAGING_FIREBASE_PROJECT_ID &&
    process.env.STAGING_FIREBASE_CLIENT_EMAIL &&
    process.env.STAGING_FIREBASE_PRIVATE_KEY
  );
}
