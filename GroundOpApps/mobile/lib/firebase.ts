// SHARED BACKEND — same Firebase project (groundopss) as web + other mobile platform.
// Firebase v11+ auto-uses AsyncStorage on React Native when @react-native-async-storage/async-storage is installed.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import AsyncStorage from '@react-native-async-storage/async-storage'; // side-effect — enables RN persistence
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(config);

export const auth: Auth = getAuth(app);

// CRITICAL: staging uses 'sandbox' Firestore database (same rule as web lib/firebase.ts).
const dbId = process.env.EXPO_PUBLIC_APP_ENV === 'staging' ? 'sandbox' : '(default)';
export const db: Firestore = getFirestore(app, dbId);

export const storage: FirebaseStorage = getStorage(app);

/** Secondary Firebase app instance — used for admin impersonation sessions. */
export function createImpersonationApp(name: string) {
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  return initializeApp(config, name);
}
