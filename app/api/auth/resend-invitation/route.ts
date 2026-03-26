import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, ctaButton, alertBox } from '@/lib/email-template';

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, role, uid } = await request.json();

    if (!email || !role || !uid) {
      return NextResponse.json({ error: 'email, role, and uid are required' }, { status: 400 });
    }

    // Read the user document to retrieve the stored invitationTempPassword
    const db = await getServerDb();
    const collectionName =
      role === 'subcontractor' ? 'subcontractors' :
      role === 'client' ? 'clients' :
      'adminUsers';

    const userSnap = await getDoc(doc(db, collectionName, uid));
    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'User not found in Firestore.' }, { status: 404 });
    }

    const userData = userSnap.data();
    const tempPassword = userData?.invitationTempPassword;

    if (!tempPassword) {
      return NextResponse.json(
        { error: 'No invitation token found for this user. Please delete and recreate the account to generate a new invitation.' },
        { status: 400 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://groundopscos.vercel.app';

    // Build a fresh token (new timestamp so the 24-hour check passes)
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

    const resetLink = `${baseUrl}/set-password?token=${encodeURIComponent(setupToken)}`;

    const roleTitle =
      role === 'subcontractor' ? 'Subcontractor' : role === 'client' ? 'Client' : 'Admin User';
    const portalName =
      role === 'subcontractor' ? 'Subcontractor Portal' :
      role === 'client' ? 'Client Portal' : 'Admin Portal';

    const emailHtml = emailLayout({
      title: 'Welcome to GroundOps',
      preheader: `You've been invited to join GroundOps as a ${roleTitle}`,
      body: `
        <p style="margin:0 0 20px 0;">Hello <strong>${fullName || userData?.fullName || 'there'}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">You've been invited to join <strong>GroundOps</strong> as a <strong>${roleTitle}</strong>. Set up your password to get started.</p>
        ${alertBox('You\'ll have access to the <strong>' + portalName + '</strong> once your account is activated.', 'info')}
        ${ctaButton('Set Up Your Password', resetLink)}
        <p style="margin:24px 0 0 0;font-size:13px;color:#8A9CAB;text-align:center;">This invitation link expires in 24 hours. If you did not expect this invitation, you can safely ignore this email.</p>
      `,
    });

    const subject = `Welcome to GroundOps - Set Up Your ${roleTitle} Account`;

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
