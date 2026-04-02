import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, limit, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Missing required fields: token and newPassword' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Decode and verify token.
    // Handles both base64url (new tokens: uses - and _) and standard base64 (legacy tokens: uses + and /).
    // Also handles spaces that some email clients introduce when mangling %2B in URLs.
    let decoded: {
      email?: string;
      uid?: string;
      role?: string;
      fullName?: string;
      phone?: string;
      tempPassword?: string;
      timestamp?: number;
      type?: string;
    };
    try {
      // Normalize to standard base64: convert base64url chars and space-corrupted + signs
      const base64 = token.replace(/-/g, '+').replace(/_/g, '/').replace(/ /g, '+');
      decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    } catch {
      return NextResponse.json(
        { error: 'Invalid or expired setup link. Please use the exact link from your invitation email or ask for a new one.' },
        { status: 400 }
      );
    }

    const { email, uid, role, tempPassword } = decoded;

    if (!email) {
      return NextResponse.json(
        { error: 'Invalid setup link. Please request a new invitation.' },
        { status: 400 }
      );
    }

    if (decoded.type !== 'password_setup') {
      return NextResponse.json(
        { error: 'Invalid setup link. Please request a new invitation.' },
        { status: 400 }
      );
    }

    // Check 24-hour expiry
    const tokenAge = Date.now() - (decoded.timestamp || 0);
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: 'This setup link has expired. Please request a new invitation.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Firebase API key not configured.' },
        { status: 500 }
      );
    }

    if (!tempPassword) {
      return NextResponse.json(
        { error: 'Invalid setup link (missing credentials). Please request a new invitation.' },
        { status: 400 }
      );
    }

    // Sign in with the temporary password embedded in the token to get an idToken,
    // then use that idToken to update the user's password — no Admin SDK required.
    let idToken: string;
    try {
      const signInRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: tempPassword, returnSecureToken: true }),
        }
      );

      if (!signInRes.ok) {
        const errData = await signInRes.json();
        console.error('Sign-in with temp password failed:', errData);
        return NextResponse.json(
          { error: 'This invitation link has already been used or is invalid. Please request a new invitation.' },
          { status: 400 }
        );
      }

      const signInData = await signInRes.json();
      idToken = signInData.idToken;
    } catch (err) {
      console.error('Sign-in request failed:', err);
      return NextResponse.json(
        { error: 'Failed to verify invitation. Please request a new invitation.' },
        { status: 500 }
      );
    }

    // Update the password using the idToken
    try {
      const updateRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, password: newPassword, returnSecureToken: true }),
        }
      );

      if (!updateRes.ok) {
        const errData = await updateRes.json();
        console.error('Password update failed:', errData);
        return NextResponse.json(
          { error: 'Failed to update password. Please try again or request a new invitation.' },
          { status: 500 }
        );
      }
    } catch (err) {
      console.error('Password update request failed:', err);
      return NextResponse.json(
        { error: 'Failed to update password. Please request a new invitation.' },
        { status: 500 }
      );
    }

    // Update Firestore document via server-side client SDK.
    // Query by email so we find the correct document even if the doc ID has drifted
    // from the Firebase Auth UID (e.g. after account recreation).
    try {
      const db = await getServerDb();
      const collectionName =
        role === 'admin' ? 'adminUsers' :
        role === 'client' ? 'clients' :
        'subcontractors';

      const q = query(collection(db, collectionName), where('email', '==', email), limit(1));
      const querySnap = await getDocs(q);

      if (!querySnap.empty) {
        await updateDoc(querySnap.docs[0].ref, {
          password: newPassword,
          passwordSetAt: new Date(),
          updatedAt: new Date(),
        });
      } else if (uid) {
        // Fallback: create document keyed by uid
        await setDoc(doc(db, collectionName, uid), {
          email,
          role: role || 'subcontractor',
          fullName: decoded.fullName || '',
          phone: decoded.phone || '',
          password: newPassword,
          passwordSetAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } catch (dbErr) {
      // Non-critical — password was already set in Auth; log and continue
      console.warn('Firestore update skipped (non-critical):', dbErr);
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
