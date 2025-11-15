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

  if (!projectId || !clientEmail || !privateKey) {
    const missingVars = [];
    if (!projectId) missingVars.push('FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)');
    if (!clientEmail) missingVars.push('FIREBASE_CLIENT_EMAIL');
    if (!privateKey) missingVars.push('FIREBASE_PRIVATE_KEY');
    
    throw new Error(
      `Firebase Admin credentials are not configured. Missing: ${missingVars.join(', ')}\n\n` +
      `To set up Firebase Admin SDK:\n` +
      `1. Go to Firebase Console: https://console.firebase.google.com/\n` +
      `2. Select your project: ${projectId || 'your-project-id'}\n` +
      `3. Go to Project Settings (gear icon) → Service Accounts tab\n` +
      `4. Click "Generate New Private Key" button\n` +
      `5. Download the JSON file\n` +
      `6. Add to your .env.local file:\n` +
      `   FIREBASE_PROJECT_ID=${projectId || 'your-project-id'}\n` +
      `   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@${projectId || 'your-project-id'}.iam.gserviceaccount.com\n` +
      `   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_HERE\\n-----END PRIVATE KEY-----\\n"\n\n` +
      `See FIREBASE_ADMIN_SETUP.md for detailed instructions.`
    );
  }

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return adminApp;
}

export function getAdminAuth() {
  const app = getAdminApp();
  return getAuth(app);
}

