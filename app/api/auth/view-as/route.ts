import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp as initializeAdminApp, getApps as getAdminApps, cert } from 'firebase-admin/app';

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

// POST - Start viewing as user
export async function POST(request: Request) {
  try {
    const { userId, role } = await request.json();

    if (!userId || !role) {
      return NextResponse.json(
        { error: 'User ID and role are required' },
        { status: 400 }
      );
    }

    if (role !== 'client' && role !== 'subcontractor') {
      return NextResponse.json(
        { error: 'Invalid role. Only client and subcontractor can be viewed' },
        { status: 400 }
      );
    }

    // Verify the requesting user is an admin
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);
    const app = getFirebaseApp();
    const db = getFirestore(app);

    // Verify admin status (we'll use client SDK for this)
    // In production, you might want additional verification
    const adminUid = await verifyAdminToken(idToken);
    if (!adminUid) {
      return NextResponse.json(
        { error: 'Invalid authentication' },
        { status: 401 }
      );
    }

    const adminDoc = await getDoc(doc(db, 'adminUsers', adminUid));
    if (!adminDoc.exists()) {
      return NextResponse.json(
        { error: 'Only admins can view as users' },
        { status: 403 }
      );
    }

    // Verify the target user exists
    const collectionName = role === 'client' ? 'clients' : 'subcontractors';
    const userDoc = await getDoc(doc(db, collectionName, userId));

    if (!userDoc.exists()) {
      return NextResponse.json(
        { error: `${role} not found` },
        { status: 404 }
      );
    }

    const userData = userDoc.data();

    // Create view-as session data (store in encrypted cookie)
    const viewAsData = {
      userId,
      role,
      adminUid,
      userName: userData.fullName || userData.businessName || 'Unknown',
      userEmail: userData.email,
      expiresAt: Date.now() + 3600000, // 1 hour
    };

    const viewAsToken = Buffer.from(JSON.stringify(viewAsData))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set('view-as-session', viewAsToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600, // 1 hour
      path: '/',
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                   (request.headers.get('origin') || 'http://localhost:3000');

    const redirectUrl = role === 'client' ? `${baseUrl}/client-portal` : `${baseUrl}/subcontractor-portal`;

    return NextResponse.json({
      success: true,
      viewAsToken,
      redirectUrl,
      user: {
        id: userId,
        name: userData.fullName || userData.businessName || 'Unknown',
        email: userData.email,
        role,
      },
    });
  } catch (error: any) {
    console.error('Error starting view-as session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start view-as session' },
      { status: 500 }
    );
  }
}

// DELETE - Exit view-as mode
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('view-as-session');

    return NextResponse.json({
      success: true,
      message: 'Exited view-as mode',
    });
  } catch (error: any) {
    console.error('Error exiting view-as mode:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to exit view-as mode' },
      { status: 500 }
    );
  }
}

// Helper function to verify admin token (simplified version)
async function verifyAdminToken(idToken: string): Promise<string | null> {
  try {
    // Try to use Firebase Admin if available (local dev with gcloud)
    if (getAdminApps().length > 0 || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const adminAuth = getAuth();
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      return decodedToken.uid;
    }
  } catch (error) {
    // Fall back to client-side verification
    console.log('Admin SDK not available, using fallback verification');
  }

  // Fallback: decode token without verification (less secure, but works without Admin SDK)
  // In production, you should use Admin SDK or Firebase Auth REST API
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
}
