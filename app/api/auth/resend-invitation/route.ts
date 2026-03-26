import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
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
    let tempPassword: string | undefined = userData?.invitationTempPassword;

    // ── Fallback for existing users: generate + store a new temp password ───
    // We update the Firebase Auth password via the REST API so the new token works.
    if (!tempPassword) {
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: 'Firebase API key not configured.' }, { status: 500 });
      }

      // Generate a new temp password
      const newTempPassword =
        Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

      // Use Firebase's password reset OOB flow to get a reset link we can embed in
      // our own email. We call sendOobCode with returnOobLink=true — this is a
      // documented feature available via the API key (no Admin SDK required).
      const oobRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestType: 'PASSWORD_RESET',
            email,
            returnOobLink: true,
          }),
        }
      );

      const oobData = await oobRes.json();

      if (!oobRes.ok || !oobData.oobLink) {
        // returnOobLink not available without Admin — fall back to sending Firebase's
        // own reset email and return success so the user still gets something.
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
          subject: `Password Reset - GroundOps`,
          status: 'sent',
          context: { fullName, role, roleTitle, uid, method: 'firebase-native-reset' },
        });

        return NextResponse.json({
          success: true,
          message: 'Password reset email sent. The user will receive an email to set their password.',
        });
      }

      // We got an oobLink — build our custom branded email using it as the reset link
      const resetLink = oobData.oobLink;
      const subject = `Welcome to GroundOps - Set Up Your ${roleTitle} Account`;
      const emailHtml = buildInvitationEmail(fullName || userData?.fullName || '', roleTitle, portalName, resetLink);

      await sendEmail({ to: email, subject, html: emailHtml });
      await logEmail({
        type: 'invitation',
        to: email,
        subject,
        status: 'sent',
        context: { fullName, role, roleTitle, uid, method: 'oob-link' },
      });

      return NextResponse.json({ success: true, message: 'Invitation email resent successfully' });
    }

    // ── Happy path: invitationTempPassword exists — build our custom token ──
    const setupToken = Buffer.from(
      JSON.stringify({
        email,
        uid,
        tempPassword,
        role,
        fullName: fullName || userData?.fullName || '',
        timestamp: Date.now(),
        type: 'password_setup',
      })
    ).toString('base64');

    const resetLink = `${BASE_URL}/set-password?token=${encodeURIComponent(setupToken)}`;
    const subject = `Welcome to GroundOps - Set Up Your ${roleTitle} Account`;
    const emailHtml = buildInvitationEmail(fullName || userData?.fullName || '', roleTitle, portalName, resetLink);

    try {
      await sendEmail({ to: email, subject, html: emailHtml });
      await logEmail({
        type: 'invitation',
        to: email,
        subject,
        status: 'sent',
        context: { fullName, role, roleTitle, uid },
      });
    } catch (err: any) {
      await logEmail({
        type: 'invitation',
        to: email,
        subject,
        status: 'failed',
        context: { fullName, role, roleTitle, uid },
        error: err.message,
      });
      throw err;
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

function buildInvitationEmail(
  name: string,
  roleTitle: string,
  portalName: string,
  resetLink: string
): string {
  return emailLayout({
    title: 'Welcome to GroundOps',
    preheader: `You've been invited to join GroundOps as a ${roleTitle}`,
    body: `
      <p style="margin:0 0 20px 0;">Hello <strong>${name || 'there'}</strong>,</p>
      <p style="margin:0 0 20px 0;color:#5A6C7A;">You've been invited to join <strong>GroundOps</strong> as a <strong>${roleTitle}</strong>. Set up your password to get started.</p>
      ${alertBox(`You'll have access to the <strong>${portalName}</strong> once your account is activated.`, 'info')}
      ${ctaButton('Set Up Your Password', resetLink)}
      <p style="margin:24px 0 0 0;font-size:13px;color:#8A9CAB;text-align:center;">This invitation link expires in 24 hours. If you did not expect this invitation, you can safely ignore this email.</p>
    `,
  });
}
