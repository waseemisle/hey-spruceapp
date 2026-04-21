import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, ctaButton, alertBox } from '@/lib/email-template';

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://groundopscos.vercel.app';

// Collections whose docs reference the client's uid via a `clientId` field.
// Data in these collections is preserved by rewriting the clientId to the new uid.
const CLIENT_REF_COLLECTIONS = [
  'workOrders',
  'invoices',
  'quotes',
  'recurringWorkOrders',
  'biddingWorkOrders',
  'locations',
  'maint_requests',
  'assignedJobs',
  'scheduledInvoices',
  'paymentMethods',
  'supportTickets',
];

async function migrateCollection(
  db: any,
  collectionName: string,
  field: string,
  oldUid: string,
  newUid: string,
): Promise<{ collection: string; field: string; updated: number; error?: string }> {
  try {
    const q = query(collection(db, collectionName), where(field, '==', oldUid));
    const snap = await getDocs(q);
    let updated = 0;
    for (const docSnap of snap.docs) {
      await updateDoc(docSnap.ref, { [field]: newUid, updatedAt: serverTimestamp() });
      updated++;
    }
    return { collection: collectionName, field, updated };
  } catch (err: any) {
    console.warn(`[migrate-client-email] Failed to migrate ${collectionName}.${field}:`, err?.message || err);
    return { collection: collectionName, field, updated: 0, error: err?.message || String(err) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid: oldUid, newEmail, fullName } = await request.json();

    if (!oldUid || !newEmail) {
      return NextResponse.json({ error: 'uid and newEmail are required' }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Firebase API key not configured.' }, { status: 500 });
    }

    const db = await getServerDb();

    const oldClientSnap = await getDoc(doc(db, 'clients', oldUid));
    if (!oldClientSnap.exists()) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    const oldData = oldClientSnap.data() || {};
    const oldEmail: string = String(oldData.email || '').trim();
    const targetEmail: string = String(newEmail).trim();

    if (!targetEmail) {
      return NextResponse.json({ error: 'newEmail cannot be empty.' }, { status: 400 });
    }

    if (oldEmail.toLowerCase() === targetEmail.toLowerCase()) {
      return NextResponse.json({ error: 'New email is the same as the current email.' }, { status: 400 });
    }

    // Step 1: Create the new Firebase Auth user first. If the new email is
    // already taken, this fails fast before we touch any data.
    const newTempPassword =
      Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

    const signUpRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          password: newTempPassword,
          returnSecureToken: true,
        }),
      },
    );

    if (!signUpRes.ok) {
      const err = await signUpRes.json().catch(() => ({}));
      const code = err?.error?.message || '';
      if (code === 'EMAIL_EXISTS') {
        return NextResponse.json(
          { error: 'That email address is already in use by another account.' },
          { status: 409 },
        );
      }
      if (code === 'INVALID_EMAIL') {
        return NextResponse.json(
          { error: 'The new email address is not valid.' },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: `Failed to create new auth user: ${code || 'unknown error'}` },
        { status: 500 },
      );
    }

    const signUpData = await signUpRes.json();
    const newUid: string = signUpData.localId;

    // Step 2: Best-effort delete of the old Firebase Auth user. We need the
    // user's idToken for REST accounts:delete, so we try stored temp password
    // then stored password. If both fail, the old Auth account becomes
    // orphaned (won't block anything but should be cleaned up manually in the
    // Firebase console). We do NOT abort migration for this reason.
    const storedTempPw: string = oldData.invitationTempPassword || '';
    const storedPassword: string = oldData.password || '';

    let oldAuthDeleted = false;
    for (const tryPw of [storedTempPw, storedPassword].filter(Boolean)) {
      try {
        const signInRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: oldEmail, password: tryPw, returnSecureToken: true }),
          },
        );
        if (!signInRes.ok) continue;

        const { idToken } = await signInRes.json();
        const deleteRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          },
        );
        if (deleteRes.ok) {
          oldAuthDeleted = true;
          break;
        }
      } catch {
        // try next credential
      }
    }

    // Step 3: Build a fresh invitation token for the NEW uid.
    const name = fullName || oldData.fullName || 'there';
    const freshToken = Buffer.from(
      JSON.stringify({
        email: targetEmail,
        uid: newUid,
        tempPassword: newTempPassword,
        role: 'client',
        fullName: name,
        timestamp: Date.now(),
        type: 'password_setup',
      }),
    ).toString('base64url');

    // Step 4: Create the new Firestore client doc at clients/{newUid} with
    // all of the old client's fields preserved. Override identity fields.
    const newClientData: Record<string, any> = {
      ...oldData,
      uid: newUid,
      email: targetEmail,
      fullName: name,
      invitationTempPassword: newTempPassword,
      userinviteemailid: freshToken,
      // Preserve original createdAt if present; bump updatedAt.
      createdAt: oldData.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      previousUid: oldUid,
      previousEmail: oldEmail,
      migratedAt: serverTimestamp(),
    };
    // These fields are never stored on the doc — strip if they leaked in.
    delete newClientData.id;

    await setDoc(doc(db, 'clients', newUid), newClientData);

    // Step 5: Migrate every collection that references the client via clientId.
    const migrationResults: Array<{ collection: string; field: string; updated: number; error?: string }> = [];
    for (const coll of CLIENT_REF_COLLECTIONS) {
      migrationResults.push(await migrateCollection(db, coll, 'clientId', oldUid, newUid));
    }
    // Notifications use userId, not clientId.
    migrationResults.push(await migrateCollection(db, 'notifications', 'userId', oldUid, newUid));

    // Step 6: Delete the old Firestore client doc. References have been moved;
    // none of the user's data is lost.
    let oldClientDocDeleted = false;
    try {
      await deleteDoc(doc(db, 'clients', oldUid));
      oldClientDocDeleted = true;
    } catch (err: any) {
      console.warn('[migrate-client-email] Failed to delete old client doc:', err?.message || err);
    }

    // Step 7: Send the fresh invitation email to the new address.
    const resetLink = `${BASE_URL}/set-password?token=${freshToken}`;
    const subject = `Welcome to GroundOps - Set Up Your Client Account`;
    const emailHtml = emailLayout({
      title: 'Welcome to GroundOps',
      preheader: `You've been invited to join GroundOps as a Client`,
      body: `
        <p style="margin:0 0 20px 0;">Hello <strong>${name}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">You've been invited to join <strong>GroundOps</strong> as a <strong>Client</strong>. Set up your password to get started.</p>
        ${alertBox(`You'll have access to the <strong>Client Portal</strong> once your account is activated.`, 'info')}
        ${ctaButton('Set Up Your Password', resetLink)}
        <p style="margin:24px 0 0 0;font-size:13px;color:#8A9CAB;text-align:center;">This invitation link expires in 24 hours. If you did not expect this invitation, you can safely ignore this email.</p>
      `,
    });

    let invitationSent = false;
    try {
      await sendEmail({ to: targetEmail, subject, html: emailHtml });
      invitationSent = true;
      await logEmail({
        type: 'invitation',
        to: targetEmail,
        subject,
        status: 'sent',
        context: { name, role: 'client', roleTitle: 'Client', uid: newUid, emailChanged: true, previousEmail: oldEmail, previousUid: oldUid },
      });
    } catch (err: any) {
      await logEmail({
        type: 'invitation',
        to: targetEmail,
        subject,
        status: 'failed',
        context: { name, role: 'client', roleTitle: 'Client', uid: newUid, emailChanged: true, previousEmail: oldEmail, previousUid: oldUid },
        error: err?.message,
      });
    }

    return NextResponse.json({
      success: true,
      previousUid: oldUid,
      previousEmail: oldEmail,
      newUid,
      newEmail: targetEmail,
      oldAuthDeleted,
      oldClientDocDeleted,
      invitationSent,
      migration: migrationResults,
    });
  } catch (error: any) {
    console.error('[migrate-client-email] Unhandled error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to migrate client email' },
      { status: 500 },
    );
  }
}
