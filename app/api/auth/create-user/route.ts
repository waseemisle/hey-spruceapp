import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, password, role, userData } = await request.json();

    if (!email || !password || !role) {
      return NextResponse.json(
        { error: 'Email, password, and role are required' },
        { status: 400 }
      );
    }

    // Use Firebase Authentication REST API to create user
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Firebase API key not configured' },
        { status: 500 }
      );
    }

    const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;

    const authResponse = await fetch(signUpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });

    if (!authResponse.ok) {
      const errorData = await authResponse.json();
      throw new Error(errorData.error?.message || 'Failed to create user account');
    }

    const authData = await authResponse.json();
    const uid = authData.localId;

    // Create user document in Firestore using REST API
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Firebase project ID not configured' },
        { status: 500 }
      );
    }

    const collectionName =
      role === 'client' ? 'clients' :
      role === 'subcontractor' ? 'subcontractors' :
      'adminUsers';

    const userDoc: any = {
      fields: {
        email: { stringValue: email },
        role: { stringValue: role },
        fullName: { stringValue: userData.fullName || '' },
        phone: { stringValue: userData.phone || '' },
        createdAt: { timestampValue: new Date().toISOString() },
        updatedAt: { timestampValue: new Date().toISOString() },
      }
    };

    // Add additional fields for subcontractors
    if (role === 'subcontractor' && userData.businessName) {
      userDoc.fields.businessName = { stringValue: userData.businessName };
    }
    if (role === 'subcontractor' && userData.status) {
      userDoc.fields.status = { stringValue: userData.status };
    }

    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}?documentId=${uid}`;

    const firestoreResponse = await fetch(firestoreUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.idToken}`,
      },
      body: JSON.stringify(userDoc),
    });

    if (!firestoreResponse.ok) {
      const errorData = await firestoreResponse.json();
      console.error('Firestore error:', errorData);
      throw new Error('Failed to create user document in Firestore');
    }

    return NextResponse.json({
      success: true,
      uid: uid,
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
