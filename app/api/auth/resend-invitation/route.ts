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

    // If the caller-supplied email differs from the email stored on the user doc,
    // this is an email-change request: sign in with the OLD email + stored creds,
    // then update Auth to the NEW email + new temp password in a single update.
    const currentEmail: string = (userData?.email || email).trim();
    const targetEmail: string = email.trim();
    const emailChanged = currentEmail.toLowerCase() !== targetEmail.toLowerCase();

    // Generate a fresh temp password for the new invitation token.
    const newTempPassword =
      Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

    // Update the Firebase Auth user's password (and email, if changed) to the new
    // tempPassword. Admin SDK is REQUIRED for email changes because the REST
    // accounts:update endpoint enforces "verify before update email" when the
    // project has email-verification-required enabled. REST is only used as a
    // fallback for same-email resends (password rotation).
    let authUpdated = false;

    try {
      const adminAuth = getAdminAuth();
      const updatePayload: {
        email?: string;
        emailVerified?: boolean;
        password: string;
      } = { password: newTempPassword };
      if (emailChanged) {
        updatePayload.email = targetEmail;
        updatePayload.emailVerified = false;
      }
      await adminAuth.updateUser(uid, updatePayload);
      authUpdated = true;
    } catch (adminErr: any) {
      const code: string = adminErr?.errorInfo?.code || adminErr?.code || '';
      const message: string = adminErr?.errorInfo?.message || adminErr?.message || '';

      if (code === 'auth/email-already-exists') {
        return NextResponse.json(
          { error: 'That email address is already in use by another account.' },
          { status: 409 }
        );
      }
      if (code === 'auth/invalid-email') {
        return NextResponse.json(
          { error: 'The new email address is not valid.' },
          { status: 400 }
        );
      }
      if (code === 'auth/user-not-found') {
        // Firestore has the doc but Auth doesn't — will create via signUp below.
        console.log('[resend-invitation] Auth user not found for uid', uid, '— will create via signUp');
      } else if (emailChanged) {
        // Email change REQUIRES Admin SDK. If it failed for any other reason,
        // the REST fallback will also fail (OPERATION_NOT_ALLOWED: verify before
        // update email), so surface the real root cause instead.
        console.error('[resend-invitation] Admin SDK updateUser failed during email change:', code, message);
        return NextResponse.json(
          {
            error:
              `Email change failed via Admin SDK: ${message || code || 'unknown error'}. ` +
              'Check that FIREBASE_OAUTH_CLIENT_ID, FIREBASE_OAUTH_CLIENT_SECRET, and ' +
              'FIREBASE_REFRESH_TOKEN are set in the server environment (Vercel).',
          },
          { status: 500 }
        );
      } else {
        // Pure resend (no email change) — fall through to REST sign-in + password rotation.
        console.warn('[resend-invitation] Admin SDK updateUser failed, falling back to REST:', code || message);
      }
    }

    const storedTempPw: string = userData?.invitationTempPassword || '';
    const storedPassword: string = userData?.password || '';

    for (const tryPw of authUpdated ? [] as string[] : [storedTempPw, storedPassword].filter(Boolean)) {
      try {
        const signInRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentEmail, password: tryPw, returnSecureToken: true }),
          }
        );

        if (signInRes.ok) {
          const { idToken } = await signInRes.json();
          // REST fallback intentionally does NOT send `email` in the payload.
          // Email changes must go through Admin SDK above; including `email`
          // here would trigger OPERATION_NOT_ALLOWED when email-verification
          // is enforced on the project.
          const updatePayload: Record<string, any> = { idToken, password: newTempPassword };
          const updateRes = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatePayload),
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
          body: JSON.stringify({ email: targetEmail, password: newTempPassword, returnSecureToken: true }),
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
        email: targetEmail,
        uid,
        tempPassword: newTempPassword,
        role,
        fullName: name,
        timestamp: Date.now(),
        type: 'password_setup',
      })
    ).toString('base64url');

    // Persist the new token and tempPassword back to Firestore.
    // If the email was changed, persist the new email on the user doc too.
    try {
      const firestoreUpdate: Record<string, any> = {
        userinviteemailid: freshToken,
        invitationTempPassword: newTempPassword,
      };
      if (emailChanged) firestoreUpdate.email = targetEmail;
      await updateDoc(doc(db, collectionName, uid), firestoreUpdate);
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
      await sendEmail({ to: targetEmail, subject, html: emailHtml });
      await logEmail({
        type: 'invitation',
        to: targetEmail,
        subject,
        status: 'sent',
        context: { name, role, roleTitle, uid, emailChanged, previousEmail: emailChanged ? currentEmail : undefined },
      });
    } catch (err: any) {
      await logEmail({
        type: 'invitation',
        to: targetEmail,
        subject,
        status: 'failed',
        context: { name, role, roleTitle, uid, emailChanged, previousEmail: emailChanged ? currentEmail : undefined },
        error: err.message,
      });
      throw err;
    }

    return NextResponse.json({
      success: true,
      message: emailChanged
        ? 'Email updated and invitation sent to the new address'
        : 'Invitation email resent successfully',
      emailChanged,
      email: targetEmail,
    });
  } catch (error: any) {
    console.error('Error resending invitation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to resend invitation' },
      { status: 500 }
    );
  }
}
