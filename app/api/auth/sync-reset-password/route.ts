import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, newPassword } = await request.json();

    if (!email || !newPassword) {
      return NextResponse.json({ error: 'Missing email or newPassword' }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!apiKey || !projectId) {
      return NextResponse.json({ error: 'Firebase not configured' }, { status: 500 });
    }

    // Sign in with new credentials to get idToken + uid
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: newPassword, returnSecureToken: true }),
      }
    );

    if (!signInRes.ok) {
      // Not critical — just skip the sync
      return NextResponse.json({ success: false, reason: 'sign-in failed' });
    }

    const { idToken, localId: uid } = await signInRes.json();

    // Try clients first, then subcontractors
    for (const collectionName of ['clients', 'subcontractors']) {
      const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${uid}`;

      const getRes = await fetch(docUrl, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (getRes.ok) {
        const patchUrl = `${docUrl}?updateMask.fieldPaths=password&updateMask.fieldPaths=passwordSetAt&updateMask.fieldPaths=updatedAt`;
        await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            fields: {
              password: { stringValue: newPassword },
              passwordSetAt: { timestampValue: new Date().toISOString() },
              updatedAt: { timestampValue: new Date().toISOString() },
            },
          }),
        });
        return NextResponse.json({ success: true, collection: collectionName });
      }
    }

    return NextResponse.json({ success: false, reason: 'user document not found' });
  } catch (error: any) {
    console.error('sync-reset-password error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
