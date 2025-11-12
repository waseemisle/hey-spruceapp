import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { token, email, uid, newPassword } = await request.json();

    // Validate required fields
    if (!token || !email || !uid || !newPassword) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Decode and verify token
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());

      // Verify token matches the provided data
      if (decoded.email !== email || decoded.uid !== uid) {
        return NextResponse.json(
          { error: 'Token data mismatch' },
          { status: 400 }
        );
      }

      // Check if token is expired (24 hours)
      const tokenAge = Date.now() - decoded.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

      if (tokenAge > maxAge) {
        return NextResponse.json(
          { error: 'Token has expired. Please request a new password setup link.' },
          { status: 400 }
        );
      }

      if (decoded.type !== 'password_setup') {
        return NextResponse.json(
          { error: 'Invalid token type' },
          { status: 400 }
        );
      }
    } catch (decodeError) {
      return NextResponse.json(
        { error: 'Invalid token' },
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

    // First, sign in with the email to get an idToken (using a temporary approach)
    // Since the user has a temporary password, we need to use the update API directly
    const updateUrl = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`;

    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        localId: uid,
        password: newPassword,
        returnSecureToken: false,
      }),
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      console.error('Firebase update error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to update password');
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
