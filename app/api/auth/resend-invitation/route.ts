import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, ctaButton, alertBox } from '@/lib/email-template';

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://groundopscos.vercel.app';

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, role, uid } = await request.json();

    if (!email || !role || !uid) {
      return NextResponse.json({ error: 'email, role, and uid are required' }, { status: 400 });
    }

    const roleTitle =
      role === 'subcontractor' ? 'Subcontractor' : role === 'client' ? 'Client' : 'Admin User';
    const portalName =
      role === 'subcontractor' ? 'Subcontractor Portal' :
      role === 'client' ? 'Client Portal' : 'Admin Portal';
    const subject = `Welcome to GroundOps - Set Up Your ${roleTitle} Account`;

    // ── Read the user doc to get stored invitationTempPassword ──────────────
    const db = await getServerDb();
    const collectionName =
      role === 'subcontractor' ? 'subcontractors' :
      role === 'client' ? 'clients' : 'adminUsers';

    const userSnap = await getDoc(doc(db, collectionName, uid));
    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const userData = userSnap.data();
    const name = fullName || userData?.fullName || 'there';
    const tempPassword: string | undefined = userData?.invitationTempPassword;

    // ── Path A: invitationTempPassword stored — build our custom setup token ─
    if (tempPassword) {
      const setupToken = Buffer.from(
        JSON.stringify({
          email, uid, tempPassword, role,
          fullName: name,
          timestamp: Date.now(),
          type: 'password_setup',
        })
      ).toString('base64');

      const resetLink = `${BASE_URL}/set-password?token=${encodeURIComponent(setupToken)}`;
      await sendBrandedEmail({ email, name, roleTitle, portalName, resetLink, subject, uid, role });
      return NextResponse.json({ success: true, message: 'Invitation email resent successfully' });
    }

    // ── Path B: no stored temp password — try Admin SDK to generate reset link
    let resetLink: string | null = null;
    try {
      // Dynamic import so the module doesn't crash if env vars are missing
      const { getAdminAuth } = await import('@/lib/firebase-admin');
      const adminAuth = getAdminAuth();
      resetLink = await adminAuth.generatePasswordResetLink(email, {
        url: `${BASE_URL}/portal-login`,
      });
    } catch {
      // Admin SDK not configured or failed — will fall back below
    }

    if (resetLink) {
      await sendBrandedEmail({ email, name, roleTitle, portalName, resetLink, subject, uid, role });
      return NextResponse.json({ success: true, message: 'Invitation email resent successfully' });
    }

    // ── Path C: Admin SDK not available — generate new temp password via REST,
    //    store it, and send our branded email.
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Firebase API key not configured.' }, { status: 500 });
    }

    // Generate a new temp password
    const newTempPassword =
      Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

    // Sign in as the user's account using Firebase's OOB approach:
    // We first send a password reset OOB code, then use the Admin REST flow
    // to update the user's password. Since Admin SDK is unavailable, we use
    // the Firebase Auth emulator-style workaround via the accounts:update endpoint
    // with the SYNC admin credentials to get an OAuth token.
    // If that fails we send Firebase's native reset email as a last resort.

    // Try to use FIREBASE_SYNC credentials to impersonate — note: regular users
    // cannot update other users' passwords via REST, so this will fail gracefully.
    let updatedViaRest = false;
    try {
      // Sign in as sync admin to get idToken
      const signInRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: process.env.FIREBASE_SYNC_EMAIL,
            password: process.env.FIREBASE_SYNC_PASSWORD,
            returnSecureToken: true,
          }),
        }
      );
      // Regular users can't update other accounts — skip if this path won't work
      updatedViaRest = false;
    } catch {
      updatedViaRest = false;
    }

    if (!updatedViaRest) {
      // Last resort: send Firebase's native password reset email.
      // The user can reset their password via Firebase's link, then log in normally.
      await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
        }
      );

      await logEmail({
        type: 'invitation',
        to: email,
        subject: 'Password Reset - GroundOps (legacy account)',
        status: 'sent',
        context: { fullName: name, role, roleTitle, uid, method: 'firebase-native-reset' },
      });

      return NextResponse.json({
        success: true,
        // Return a specific flag so the frontend can show a better message
        legacyReset: true,
        message:
          'A password reset email has been sent via Firebase. To send our branded invitation email for this account, please add FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY to your Vercel environment variables, or delete and recreate this account.',
      });
    }

    return NextResponse.json({ success: true, message: 'Invitation email resent successfully' });
  } catch (error: any) {
    console.error('Error resending invitation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to resend invitation' },
      { status: 500 }
    );
  }
}

async function sendBrandedEmail({
  email, name, roleTitle, portalName, resetLink, subject, uid, role,
}: {
  email: string; name: string; roleTitle: string; portalName: string;
  resetLink: string; subject: string; uid: string; role: string;
}) {
  const emailHtml = emailLayout({
    title: 'Welcome to GroundOps',
    preheader: `You've been invited to join GroundOps as a ${roleTitle}`,
    body: `
      <p style="margin:0 0 20px 0;">Hello <strong>${name}</strong>,</p>
      <p style="margin:0 0 20px 0;color:#5A6C7A;">You've been invited to join <strong>GroundOps</strong> as a <strong>${roleTitle}</strong>. Set up your password to get started.</p>
      ${alertBox(`You'll have access to the <strong>${portalName}</strong> once your account is activated.`, 'info')}
      ${ctaButton('Set Up Your Password', resetLink)}
      <p style="margin:24px 0 0 0;font-size:13px;color:#8A9CAB;text-align:center;">This invitation link expires in 24 hours. If you did not expect this invitation, you can safely ignore this email.</p>
    `,
  });

  await sendEmail({ to: email, subject, html: emailHtml });
  await logEmail({
    type: 'invitation',
    to: email,
    subject,
    status: 'sent',
    context: { name, role, roleTitle, uid },
  });
}
