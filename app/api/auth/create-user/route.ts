import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/sendgrid';

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
    let emailSent = false;
    let emailError: string | null = null;

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
        role,
        timestamp: Date.now(),
        type: 'password_setup'
      })).toString('base64');

      const resetLink = `${baseUrl}/set-password?token=${setupToken}`;

      // Send invitation email directly using sendEmail
      try {
        const fullName = userData.fullName || 'User';
        const roleTitle = role === 'subcontractor' ? 'Subcontractor' :
                         role === 'client' ? 'Client' : 'Admin User';
        const portalName = role === 'subcontractor' ? 'Subcontractor Portal' :
                          role === 'client' ? 'Client Portal' : 'Admin Portal';

        // Create email HTML
        const emailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Welcome to Hey Spruce</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Hey Spruce!</h1>
              </div>

              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
                <p style="font-size: 16px; margin-bottom: 20px;">Hello ${fullName},</p>

                <p style="font-size: 16px; margin-bottom: 20px;">
                  You've been invited to join Hey Spruce as a <strong>${roleTitle}</strong>.
                  To get started, you'll need to set up your password.
                </p>

                <p style="font-size: 16px; margin-bottom: 30px;">
                  Click the button below to create your password and activate your account:
                </p>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetLink}"
                     style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                            color: white;
                            padding: 15px 40px;
                            text-decoration: none;
                            border-radius: 8px;
                            font-size: 16px;
                            font-weight: bold;
                            display: inline-block;">
                    Set Up Password
                  </a>
                </div>

                <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                  Or copy and paste this link into your browser:
                </p>
                <p style="font-size: 14px; color: #10b981; word-break: break-all;">
                  ${resetLink}
                </p>

                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

                <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">
                  <strong>Your Account Details:</strong>
                </p>
                <ul style="font-size: 14px; color: #6b7280;">
                  <li><strong>Email:</strong> ${email}</li>
                  <li><strong>Role:</strong> ${roleTitle}</li>
                  <li><strong>Portal:</strong> ${portalName}</li>
                </ul>

                <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                  Once you've set your password, you can log in at:
                  <a href="${baseUrl}/portal-login"
                     style="color: #10b981; text-decoration: none;">
                    ${baseUrl}/portal-login
                  </a>
                </p>

                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

                <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">
                  If you didn't expect this invitation, you can safely ignore this email.
                  This link will expire in 24 hours.
                </p>
              </div>

              <div style="text-align: center; margin-top: 20px; padding: 20px; color: #9ca3af; font-size: 12px;">
                <p>&copy; ${new Date().getFullYear()} Hey Spruce. All rights reserved.</p>
                <p>Shure Hardware - Professional Property Management Solutions</p>
              </div>
            </body>
          </html>
        `;

        // Send email via SendGrid
        await sendEmail({
          to: email,
          subject: `Welcome to Hey Spruce - Set Up Your ${roleTitle} Account`,
          html: emailHtml,
        });

        emailSent = true;
        console.log('✅ Invitation email sent successfully via SendGrid to:', email);
      } catch (err: any) {
        emailError = err.message || String(err);
        console.error('❌ Error sending invitation email:', err);
        console.error('❌ Error details:', err.message || err);
        // Don't fail the user creation if email fails, but log the error
        // The user can still be created and manually sent an invitation later
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
      emailSent: emailSent,
      emailError: emailError,
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}
