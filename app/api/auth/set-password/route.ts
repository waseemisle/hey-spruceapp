import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, newPassword } = body;

    // Accept either { token, newPassword } or legacy { token, email, uid, tempPassword, newPassword }
    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Missing required fields: token and newPassword' },
        { status: 400 }
      );
    }

    // Validate password length
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Decode and verify token (token may be URL-encoded; normalize for base64)
    let decoded: { email?: string; uid?: string; tempPassword?: string; role?: string; timestamp?: number; type?: string };
    try {
      const normalizedToken = token.replace(/ /g, '+'); // some clients turn + into space
      decoded = JSON.parse(Buffer.from(normalizedToken, 'base64').toString('utf8'));
    } catch (decodeError) {
      return NextResponse.json(
        { error: 'Invalid or expired setup link. Please use the link from your invitation email or request a new one.' },
        { status: 400 }
      );
    }

    const email = decoded.email;
    const uid = decoded.uid;
    const tempPassword = decoded.tempPassword;

    if (!email || !uid || !tempPassword) {
      return NextResponse.json(
        { error: 'Invalid setup link. Please request a new invitation.' },
        { status: 400 }
      );
    }

    // Check if token is expired (24 hours)
    const tokenAge = Date.now() - (decoded.timestamp || 0);
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    if (tokenAge > maxAge) {
      return NextResponse.json(
        { error: 'This setup link has expired. Please request a new invitation.' },
        { status: 400 }
      );
    }

    if (decoded.type !== 'password_setup') {
      return NextResponse.json(
        { error: 'Invalid setup link. Please request a new invitation.' },
        { status: 400 }
      );
    }

    // Update password using Firebase Auth REST API
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Firebase API key not configured' },
        { status: 500 }
      );
    }

    // Sign in with the temporary password to get an idToken
    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    const signInResponse = await fetch(signInUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        password: tempPassword,
        returnSecureToken: true,
      }),
    });

    if (!signInResponse.ok) {
      const errorData = await signInResponse.json();
      console.error('Firebase sign-in error:', errorData);
      const code = errorData?.error?.message || '';
      if (code.includes('INVALID_LOGIN_CREDENTIALS') || code.includes('invalid-credential')) {
        return NextResponse.json(
          { error: 'Invalid or expired setup link. Please use the exact link from your invitation email or ask for a new one.' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to verify setup link. Please request a new invitation.' },
        { status: 400 }
      );
    }

    const signInData = await signInResponse.json();
    const idToken = signInData.idToken;

    // Now update the password using the idToken
    const updateUrl = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`;

    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idToken: idToken,
        password: newPassword,
        returnSecureToken: false,
      }),
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(errorData.error?.message || 'Failed to update password');
    }

    // Optionally update Firestore passwordSetAt (non-blocking)
    const role = decoded.role;
    const collectionName = role === 'admin' ? 'adminUsers' : role === 'client' ? 'clients' : 'subcontractors';
    try {
      const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
      const { getAdminApp } = await import('@/lib/firebase-admin');
      const adminDb = getFirestore(getAdminApp());
      await adminDb.collection(collectionName).doc(uid).update({
        passwordSetAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (firestoreErr) {
      console.warn('Firestore passwordSetAt update skipped (non-critical):', firestoreErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully',
    });

  } catch (error: any) {
    console.error('Error setting password:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to set password' },
      { status: 500 }
    );
  }
}
