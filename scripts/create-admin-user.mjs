#!/usr/bin/env node
// Script to create an admin user via Firebase REST API + Mailgun invitation email
// Usage: Set env vars (e.g. from .env.local) then: node scripts/create-admin-user.mjs

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'heyspruce.com';
const MAILGUN_FROM = process.env.MAILGUN_FROM || 'matthew@heyspruce.com';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://hey-spruce-appv2.vercel.app';

const email = 'waseemisle@gmail.com';
const fullName = 'Waseem';
const phone = '';
const role = 'admin';

async function run() {
  if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID) {
    console.error('Set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID (e.g. from .env.local).');
    process.exit(1);
  }
  if (!MAILGUN_API_KEY) {
    console.error('Set MAILGUN_API_KEY to send the invitation email.');
    process.exit(1);
  }
  console.log(`Creating admin account for ${email}...`);

  // Step 1: Create Firebase Auth user with a temp password
  const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

  const signUpRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: tempPassword, returnSecureToken: true }),
    }
  );

  if (!signUpRes.ok) {
    const err = await signUpRes.json();
    console.error('Firebase Auth error:', err.error?.message || JSON.stringify(err));
    process.exit(1);
  }

  const authData = await signUpRes.json();
  const uid = authData.localId;
  const idToken = authData.idToken;
  console.log(`✅ Firebase Auth user created. UID: ${uid}`);

  // Step 2: Create Firestore document in adminUsers collection
  const setupToken = Buffer.from(JSON.stringify({
    email,
    uid,
    tempPassword,
    role,
    timestamp: Date.now(),
    type: 'password_setup',
  })).toString('base64');

  const userDoc = {
    fields: {
      email: { stringValue: email },
      role: { stringValue: role },
      fullName: { stringValue: fullName },
      phone: { stringValue: phone },
      createdAt: { timestampValue: new Date().toISOString() },
      updatedAt: { timestampValue: new Date().toISOString() },
    },
  };

  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/adminUsers?documentId=${uid}`;

  const fsRes = await fetch(firestoreUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(userDoc),
  });

  if (!fsRes.ok) {
    const err = await fsRes.json();
    console.error('Firestore error:', JSON.stringify(err));
    process.exit(1);
  }
  console.log('✅ Firestore adminUsers document created');

  // Step 3: Send invitation email via Mailgun
  const resetLink = `${BASE_URL}/set-password?token=${encodeURIComponent(setupToken)}`;

  const emailHtml = `
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Welcome to GroundOps</title></head>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to GroundOps!</h1>
    </div>
    <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
      <p style="font-size: 16px;">Hello ${fullName},</p>
      <p style="font-size: 16px;">You've been invited to join GroundOps as an <strong>Admin User</strong>. To get started, set up your password by clicking the button below:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}"
           style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
          Set Up Password
        </a>
      </div>
      <p style="font-size: 14px; color: #6b7280;">Or copy this link: <span style="color: #10b981; word-break: break-all;">${resetLink}</span></p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="font-size: 14px; color: #6b7280;"><strong>Your Account Details:</strong></p>
      <ul style="font-size: 14px; color: #6b7280;">
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Role:</strong> Admin User</li>
        <li><strong>Portal:</strong> Admin Portal</li>
      </ul>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">If you didn't expect this invitation, you can safely ignore this email. This link will expire in 24 hours.</p>
    </div>
    <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} GroundOps LLC. All rights reserved.</p>
    </div>
  </body>
</html>`;

  // Mailgun API (US region uses api.mailgun.net)
  const formData = new URLSearchParams();
  formData.append('from', `GroundOps <${MAILGUN_FROM}>`);
  formData.append('to', email);
  formData.append('subject', 'Welcome to GroundOps - Set Up Your Admin Account');
  formData.append('html', emailHtml);

  const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}`,
    },
    body: formData,
  });

  if (!mgRes.ok) {
    const err = await mgRes.text();
    console.error('Mailgun error:', err);
    console.log('⚠️  Account was created but invitation email failed. Manual link:');
    console.log(resetLink);
  } else {
    const mgData = await mgRes.json();
    console.log('✅ Invitation email sent:', mgData.message || mgData.id);
  }

  console.log('\n=== Admin account created successfully ===');
  console.log(`Email: ${email}`);
  console.log(`UID:   ${uid}`);
  console.log(`Setup link: ${resetLink}`);
}

run().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
