import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

export const runtime = 'nodejs';

// Initialize Firebase client SDK
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

// Helper function to verify admin token using client-side token decoding
async function verifyAdminToken(idToken: string): Promise<string | null> {
  try {
    // Decode token without Firebase Admin SDK verification
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
}

// POST - Generate impersonation login token using email/password
export async function POST(request: Request) {
  try {
    const { userId, role } = await request.json();
    const authHeader = request.headers.get('authorization');

    if (!userId || !role) {
      return NextResponse.json(
        { error: 'User ID and role are required' },
        { status: 400 }
      );
    }

    if (role !== 'client' && role !== 'subcontractor') {
      return NextResponse.json(
        { error: 'Invalid role. Only client and subcontractor can be impersonated' },
        { status: 400 }
      );
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);
    const app = getFirebaseApp();
    const db = getFirestore(app);

    // Verify the requesting user is an admin
    const adminUid = await verifyAdminToken(idToken);
    if (!adminUid) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const adminDoc = await getDoc(doc(db, 'adminUsers', adminUid));
    if (!adminDoc.exists()) {
      return NextResponse.json(
        { error: 'Only admins can impersonate users' },
        { status: 403 }
      );
    }

    // Verify the target user exists and get their email/password
    const collectionName = role === 'client' ? 'clients' : 'subcontractors';
    const userDoc = await getDoc(doc(db, collectionName, userId));

    if (!userDoc.exists()) {
      return NextResponse.json(
        { error: `${role} not found` },
        { status: 404 }
      );
    }

    const userData = userDoc.data();

    if (!userData?.email) {
      return NextResponse.json(
        { error: 'User email not found' },
        { status: 404 }
      );
    }

    if (!userData?.password) {
      return NextResponse.json(
        { error: 'User password not set. Cannot login without password.' },
        { status: 400 }
      );
    }

    // Use email/password authentication method
    // This will open in a new tab and won't log out the admin
    const tokenData = {
      email: userData.email,
      password: userData.password,
      userId,
      role,
      adminUid,
      expiresAt: Date.now() + 3600000, // 1 hour
    };

    const impersonationToken = Buffer.from(JSON.stringify(tokenData))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                   (request.headers.get('origin') || 'http://localhost:3000');

    return NextResponse.json({
      success: true,
      impersonationToken,
      impersonationUrl: `${baseUrl}/impersonate-login?token=${impersonationToken}`,
      useCustomToken: false,
      user: {
        id: userId,
        name: userData?.fullName || userData?.businessName || 'Unknown',
        email: userData.email,
        role,
      },
    });
  } catch (error: any) {
    console.error('Error in impersonation login:', error);

    return NextResponse.json(
      { error: error.message || 'Failed to start impersonation login' },
      { status: 500 }
    );
  }
}

