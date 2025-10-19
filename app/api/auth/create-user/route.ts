import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Initialize Firebase client SDK for server-side use
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

export async function POST(request: Request) {
  try {
    const { email, password, role, userData } = await request.json();

    if (!email || !password || !role) {
      return NextResponse.json(
        { error: 'Email, password, and role are required' },
        { status: 400 }
      );
    }

    // Use Firebase Authentication REST API to create user
    // This doesn't require Admin SDK or service account credentials
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;

    const authResponse = await fetch(signUpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });

    if (!authResponse.ok) {
      const errorData = await authResponse.json();
      throw new Error(errorData.error?.message || 'Failed to create user account');
    }

    const authData = await authResponse.json();
    const uid = authData.localId;

    // Create user document in Firestore using client SDK
    const app = getFirebaseApp();
    const db = getFirestore(app);

    const userDoc = {
      email,
      role,
      ...userData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const collectionName =
      role === 'client' ? 'clients' :
      role === 'subcontractor' ? 'subcontractors' :
      'adminUsers';
    await setDoc(doc(db, collectionName, uid), userDoc);

    return NextResponse.json({
      success: true,
      uid: uid,
      message: `${role} created successfully`,
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}
