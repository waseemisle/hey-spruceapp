import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

// POST - Generate impersonation login token using Firebase Admin custom tokens
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
    const adminAuth = getAdminAuth();
    const db = getAdminFirestore();

    // Verify the requesting user is an admin using Firebase Admin SDK
    let adminUid: string;
    try {
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      adminUid = decodedToken.uid;
    } catch {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const adminDoc = await db.collection('adminUsers').doc(adminUid).get();
    if (!adminDoc.exists) {
      return NextResponse.json(
        { error: 'Only admins can impersonate users' },
        { status: 403 }
      );
    }

    // Verify the target user exists
    const collectionName = role === 'client' ? 'clients' : 'subcontractors';
    const userDoc = await db.collection(collectionName).doc(userId).get();

    if (!userDoc.exists) {
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

    // Generate a custom token using Firebase Admin SDK (no plaintext passwords)
    const customToken = await adminAuth.createCustomToken(userId, {
      impersonating: true,
      originalAdmin: adminUid,
      role,
    });

    const tokenData = {
      customToken,
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
      useCustomToken: true,
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
