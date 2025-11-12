import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { token, email, uid, tempPassword, newPassword } = await request.json();

    // Validate required fields
    if (!token || !email || !uid || !tempPassword || !newPassword) {
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
      if (decoded.email !== email || decoded.uid !== uid || decoded.tempPassword !== tempPassword) {
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
      throw new Error('Failed to authenticate with temporary password');
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
