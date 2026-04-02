import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
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

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Firebase API key not configured.' }, { status: 500 });
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

    // Generate a fresh temp password for the new invitation token.
    const newTempPassword =
      Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

    // Update the Firebase Auth user's password to the new tempPassword using REST API.
    // We try available stored credentials in order: the invitation temp password,
    // then the user's actual password (if they had previously set one).
    // If neither works (user may not exist in Auth), we create them fresh.
    let authUpdated = false;

    const storedTempPw: string = userData?.invitationTempPassword || '';
    const storedPassword: string = userData?.password || '';

    for (const tryPw of [storedTempPw, storedPassword].filter(Boolean)) {
      try {
        const signInRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: tryPw, returnSecureToken: true }),
          }
        );

        if (signInRes.ok) {
          const { idToken } = await signInRes.json();
          const updateRes = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken, password: newTempPassword }),
            }
          );
          if (updateRes.ok) {
            authUpdated = true;
            break;
          }
        }
      } catch {
        // try next credential
      }
    }

    if (!authUpdated) {
      // User doesn't exist in Firebase Auth (or no stored credentials match) — create them.
      const signUpRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: newTempPassword, returnSecureToken: true }),
        }
      );

      const signUpData = await signUpRes.json();

      if (signUpRes.ok) {
        authUpdated = true;
      } else if (signUpData.error?.message === 'EMAIL_EXISTS') {
        // User exists in Auth but none of our stored credentials work.
        // This can happen if their password was changed outside our system.
        // Return a clear error so the admin knows to have the user use "forgot password".
        return NextResponse.json(
          { error: 'Unable to reset credentials for this user. Please ask them to use the "Forgot Password" flow or contact support.' },
          { status: 409 }
        );
      } else {
        throw new Error(signUpData.error?.message || 'Failed to create Firebase Auth user');
      }
    }

    // Build a fresh token with the new tempPassword and a new timestamp (fresh 24-hour window).
    const freshToken = Buffer.from(
      JSON.stringify({
        email,
        uid,
        tempPassword: newTempPassword,
        role,
        fullName: name,
        timestamp: Date.now(),
        type: 'password_setup',
      })
    ).toString('base64url');

    // Persist the new token and tempPassword back to Firestore
    try {
      await updateDoc(doc(db, collectionName, uid), {
        userinviteemailid: freshToken,
        invitationTempPassword: newTempPassword,
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
