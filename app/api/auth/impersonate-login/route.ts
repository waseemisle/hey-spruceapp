import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

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
    const adminAuth = getAdminAuth();
    const db = getFirestore();

    // Verify the requesting user is an admin
    let adminUid: string;
    try {
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      adminUid = decodedToken.uid;
    } catch (error) {
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

    // Verify the target user exists and get their email/password
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

    if (!userData?.password) {
      return NextResponse.json(
        { error: 'User password not set. Cannot impersonate without password.' },
        { status: 400 }
      );
    }

    // Create impersonation token with email and password
    const tokenData = {
      email: userData.email,
      password: userData.password,
      userId,
      role,
      adminUid,
      expiresAt: Date.now() + 300000, // 5 minutes - short lived for security
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

