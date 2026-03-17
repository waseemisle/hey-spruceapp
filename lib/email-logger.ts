import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const getFirebaseApp = () => {
  if (getApps().length === 0) {
    return initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  }
  return getApp();
};

export type EmailType =
  | 'invoice'
  | 'quote'
  | 'invitation'
  | 'assignment'
  | 'bidding-opportunity'
  | 'client-approval'
  | 'subcontractor-approval'
  | 'maint-request-notification'
  | 'scheduled-service'
  | 'quote-notification'
  | 'review-request'
  | 'work-order-notification'
  | 'work-order-completed-notification'
  | 'auto-charge-receipt'
  | 'test';

export interface EmailLogEntry {
  type: EmailType;
  to: string | string[];
  subject: string;
  status: 'sent' | 'failed';
  context: Record<string, any>;
  error?: string;
  sentAt: any; // Firestore serverTimestamp
}

export async function logEmail(entry: Omit<EmailLogEntry, 'sentAt'>) {
  try {
    const app = getFirebaseApp();
    const db = getFirestore(app);
    await addDoc(collection(db, 'emailLogs'), {
      ...entry,
      sentAt: serverTimestamp(),
    });
  } catch (err) {
    // Never let logging failures affect email delivery
    console.error('Failed to log email:', err);
  }
}
