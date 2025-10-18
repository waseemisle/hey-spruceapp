import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

export async function POST(request: Request) {
  try {
    const { email, password, role, userData } = await request.json();

    if (!email || !password || !role) {
      return NextResponse.json(
        { error: 'Email, password, and role are required' },
        { status: 400 }
      );
    }

    // Create user with Firebase Auth Admin
    const auth = getAuth();
    const userRecord = await auth.createUser({
      email,
      password,
      emailVerified: false,
    });

    // Create user document in Firestore
    const db = getFirestore();
    const userDoc = {
      email,
      role,
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection(role === 'client' ? 'clients' : 'subcontractors')
      .doc(userRecord.uid)
      .set(userDoc);

    return NextResponse.json({
      success: true,
      uid: userRecord.uid,
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
