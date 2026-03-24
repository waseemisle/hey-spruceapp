import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { sendEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, role, uid: providedUid } = await request.json();

    if (!email || !role) {
      return NextResponse.json({ error: 'Email and role are required' }, { status: 400 });
    }

    // Get Firebase Admin auth
    const adminAuth = getAdminAuth();

    // Look up user — use provided UID or look up by email
    let uid: string;
    try {
      if (providedUid) {
        const userRecord = await adminAuth.getUser(providedUid);
        uid = userRecord.uid;
      } else {
        const userRecord = await adminAuth.getUserByEmail(email);
        uid = userRecord.uid;
      }
    } catch (err: any) {
      return NextResponse.json(
        { error: 'User not found. Make sure the subcontractor account was created.' },
        { status: 404 }
      );
    }

    // Generate a new temporary password
    const tempPassword =
      Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

    // Update the user's password using Admin SDK so the new token is valid
    await adminAuth.updateUser(uid, { password: tempPassword });

    // Build a new setup token
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://groundopscos.vercel.app';

    const setupToken = Buffer.from(
      JSON.stringify({
        email,
        uid,
        tempPassword,
        role,
        fullName: fullName || '',
        timestamp: Date.now(),
        type: 'password_setup',
      })
    ).toString('base64');

    const resetLink = `${baseUrl}/set-password?token=${encodeURIComponent(setupToken)}`;

    const roleTitle =
      role === 'subcontractor' ? 'Subcontractor' : role === 'client' ? 'Client' : 'Admin User';
    const portalName =
      role === 'subcontractor'
        ? 'Subcontractor Portal'
        : role === 'client'
        ? 'Client Portal'
        : 'Admin Portal';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to GroundOps</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to GroundOps!</h1>
          </div>

          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${fullName || 'there'},</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              You've been invited to join GroundOps as a <strong>${roleTitle}</strong>.
              Click the button below to set up your password and activate your account.
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

            <ul style="font-size: 14px; color: #6b7280;">
              <li><strong>Email:</strong> ${email}</li>
              <li><strong>Role:</strong> ${roleTitle}</li>
              <li><strong>Portal:</strong> ${portalName}</li>
            </ul>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Once you've set your password, you can log in at:
              <a href="${baseUrl}/portal-login" style="color: #10b981; text-decoration: none;">
                ${baseUrl}/portal-login
              </a>
            </p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

            <p style="font-size: 12px; color: #9ca3af;">
              If you didn't expect this invitation, you can safely ignore this email.
              This link will expire in 24 hours.
            </p>
          </div>

          <div style="text-align: center; margin-top: 20px; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} GroundOps LLC. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    await sendEmail({
      to: email,
      subject: `Welcome to GroundOps - Set Up Your ${roleTitle} Account`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true, message: 'Invitation email resent successfully' });
  } catch (error: any) {
    console.error('Error resending invitation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to resend invitation' },
      { status: 500 }
    );
  }
}
