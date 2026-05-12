// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Only initialize Firebase if API key is present
let app: any = null;
let auth: any = null;
let db: any = null;
let storage: any = null;
let analytics: any = null;

if (firebaseConfig.apiKey) {
  // Initialize Firebase
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

  // Initialize Firebase services
  auth = getAuth(app);
  // In the staging deployment use the 'sandbox' Firestore database so production
  // and sandbox data are fully isolated within the same Firebase project.
  const dbId = process.env.NEXT_PUBLIC_APP_ENV === 'staging' ? 'sandbox' : '(default)';
  db = getFirestore(app, dbId);
  storage = getStorage(app);

  // Defer Analytics so it never blocks first paint / hydration (dynamic import + idle).
  if (typeof window !== "undefined" && firebaseConfig.measurementId) {
    const run = () => {
      import("firebase/analytics")
        .then(({ isSupported, getAnalytics }) =>
          isSupported().then((ok) => {
            if (ok && app) {
              analytics = getAnalytics(app);
            }
          })
        )
        .catch(() => {});
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(run, { timeout: 4000 });
    } else {
      setTimeout(run, 0);
    }
  }
}

export { app, auth, db, storage, analytics };
