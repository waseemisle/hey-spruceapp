import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getAdminAuth } from '@/lib/firebase-admin';
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

    // Read the user document
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

    // ── Decode stored userinviteemailid to get the original tempPassword ──────
    const storedToken: string | undefined =
      userData?.userinviteemailid || userData?.invitationTempPassword
        ? undefined  // handled below
        : undefined;

    // Try userinviteemailid first (full base64 token stored on creation)
    let tempPassword: string | undefined;

    if (userData?.userinviteemailid) {
      try {
        const decoded = JSON.parse(
          Buffer.from(userData.userinviteemailid, 'base64').toString('utf8')
        );
        tempPassword = decoded.tempPassword;
      } catch {
        // malformed — fall through to invitationTempPassword
      }
    }

    // Fall back to raw invitationTempPassword field (older field)
    if (!tempPassword && userData?.invitationTempPassword) {
      tempPassword = userData.invitationTempPassword;
    }

    if (!tempPassword) {
      // No stored invitation data — generate a fresh temp password, update Auth, and persist it
      const newTempPassword =
        Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

      await getAdminAuth().updateUser(uid, { password: newTempPassword });

      const newToken = Buffer.from(
        JSON.stringify({
          email,
          uid,
          tempPassword: newTempPassword,
          role,
          fullName: name,
          timestamp: Date.now(),
          type: 'password_setup',
        })
      ).toString('base64');

      const db2 = await getServerDb();
      await updateDoc(doc(db2, collectionName, uid), {
        invitationTempPassword: newTempPassword,
        userinviteemailid: newToken,
      });

      tempPassword = newTempPassword;
    }

    // Build a fresh token with a new timestamp so the 24-hour expiry passes
    const freshToken = Buffer.from(
      JSON.stringify({
        email,
        uid,
        tempPassword,
        role,
        fullName: name,
        timestamp: Date.now(),
        type: 'password_setup',
      })
    ).toString('base64');

    const resetLink = `${BASE_URL}/set-password?token=${encodeURIComponent(freshToken)}`;
    const subject = `Welcome to GroundOps - Set Up Your ${roleTitle} Account`;

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

    try {
      await sendEmail({ to: email, subject, html: emailHtml });
      await logEmail({
        type: 'invitation',
        to: email,
        subject,
        status: 'sent',
        context: { name, role, roleTitle, uid },
      });
    } catch (err: any) {
      await logEmail({
        type: 'invitation',
        to: email,
        subject,
        status: 'failed',
        context: { name, role, roleTitle, uid },
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
