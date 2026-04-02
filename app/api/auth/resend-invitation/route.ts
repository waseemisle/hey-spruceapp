import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
import { doc, getDoc, updateDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
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

    const collectionName =
      role === 'subcontractor' ? 'subcontractors' :
      role === 'client' ? 'clients' : 'adminUsers';

    // Read the user document via server-side client SDK
    const db = await getServerDb();
    const userSnap = await getDoc(doc(db, collectionName, uid));
    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const userData = userSnap.data();
    const name = fullName || userData?.fullName || 'there';

    // Generate a fresh placeholder temp password for the token payload.
    const tempPassword =
      Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

    // Ensure the Firebase Auth user exists with the correct uid via Admin SDK.
    // If it has been deleted or never properly created, recreate it with the SAME uid
    // so portal-login (which looks up Firestore by user.uid) keeps working.
    const adminAuth = getAdminAuth();
    try {
      await adminAuth.updateUser(uid, { password: tempPassword, email });
    } catch (authErr: any) {
      if (authErr.code === 'auth/user-not-found') {
        // Recreate with the exact same uid so Firestore doc ID stays in sync
        await adminAuth.createUser({ uid, email, password: tempPassword });
      } else {
        throw authErr;
      }
    }

    // Build a fresh token with a new timestamp (gives the user a fresh 24-hour window).
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
    ).toString('base64url');

    // Persist the new token back to Firestore
    try {
      await updateDoc(doc(db, collectionName, uid), {
        userinviteemailid: freshToken,
        invitationTempPassword: tempPassword,
      });
    } catch (updateErr) {
      console.warn('Could not update userinviteemailid in Firestore:', updateErr);
    }

    const resetLink = `${BASE_URL}/set-password?token=${freshToken}`;
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
