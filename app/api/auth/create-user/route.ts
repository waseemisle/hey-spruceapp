import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, password, role, userData, sendInvitation = false } = await request.json();

    // If sendInvitation is true, we don't need a password (will send reset link)
    // If sendInvitation is false, we need a password (legacy flow for public registration)
    if (!email || !role || (!password && !sendInvitation)) {
      return NextResponse.json(
        { error: 'Email and role are required' },
        { status: 400 }
      );
    }

    // Use Firebase Authentication REST API
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Firebase API key not configured' },
        { status: 500 }
      );
    }

    let uid: string;
    let idToken: string;

    if (sendInvitation) {
      // For invitation flow: Create user without password, they'll set it via email link
      // We'll use a temporary random password and immediately send a password reset email
      const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

      const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;

      const authResponse = await fetch(signUpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password: tempPassword,
          returnSecureToken: true,
        }),
      });

      if (!authResponse.ok) {
        const errorData = await authResponse.json();
        throw new Error(errorData.error?.message || 'Failed to create user account');
      }

      const authData = await authResponse.json();
      uid = authData.localId;
      idToken = authData.idToken;

      // We need to use a custom token approach since Firebase's sendOobCode sends an email automatically
      // Store the temporary password in the token so we can sign in and update it later
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

      // Create a temporary token for password setup
      // We'll store the user's email, temp password, and timestamp
      const setupToken = Buffer.from(JSON.stringify({
        email,
        uid,
        tempPassword,
        timestamp: Date.now(),
        type: 'password_setup'
      })).toString('base64');

      const resetLink = `${baseUrl}/set-password?token=${setupToken}`;

      // Send invitation email
      try {
        const invitationResponse = await fetch(`${baseUrl}/api/email/send-invitation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            fullName: userData.fullName || 'User',
            role,
            resetLink,
          }),
        });

        if (!invitationResponse.ok) {
          const errorData = await invitationResponse.json();
          console.error('Failed to send invitation email:', errorData);
        } else {
          console.log('Invitation email sent successfully to:', email);
        }
      } catch (emailError) {
        console.error('Error sending invitation email:', emailError);
        // Don't fail the user creation if email fails
      }
    } else {
      // Legacy flow: Create user with provided password (for public registration)
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
      uid = authData.localId;
      idToken = authData.idToken;
    }

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

    // Add additional fields based on role
    if (role === 'subcontractor') {
      if (userData.businessName) {
        userDoc.fields.businessName = { stringValue: userData.businessName };
      }
      if (userData.licenseNumber) {
        userDoc.fields.licenseNumber = { stringValue: userData.licenseNumber };
      }
      if (userData.skills && Array.isArray(userData.skills)) {
        userDoc.fields.skills = {
          arrayValue: {
            values: userData.skills.map((skill: string) => ({ stringValue: skill }))
          }
        };
      }
      // For admin-created users, default to approved status
      userDoc.fields.status = { stringValue: userData.status || 'approved' };
    }

    if (role === 'client') {
      if (userData.companyName) {
        userDoc.fields.companyName = { stringValue: userData.companyName };
      }
      // For admin-created users, default to approved status
      userDoc.fields.status = { stringValue: userData.status || 'approved' };
    }

    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}?documentId=${uid}`;

    const firestoreResponse = await fetch(firestoreUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
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
