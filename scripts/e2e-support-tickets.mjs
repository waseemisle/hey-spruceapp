/**
 * End-to-end support ticket flow (API):
 * - Mint ID tokens via Firebase Admin (custom token → REST signInWithCustomToken)
 * - Client creates N tickets
 * - Admin comments, transitions status, resolves, closes
 *
 * Requires .env.local:
 *   - FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)
 *   - FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (service account)
 *   - NEXT_PUBLIC_FIREBASE_API_KEY
 *
 * Usage:
 *   npm run seed:support-tickets
 *   BASE_URL=https://groundopscos.vercel.app npm run seed:support-tickets
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvLocal() {
  const p = path.join(root, '.env.local');
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    val = val.replace(/\\n/g, '\n');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

const CLIENT_EMAIL = process.env.E2E_SUPPORT_CLIENT_EMAIL || 'mperasso1@icloud.com';
const ADMIN_EMAIL = process.env.E2E_SUPPORT_ADMIN_EMAIL || 'waseem@shurehw.com';
const BASE_URL = (process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const TICKET_COUNT = Math.min(50, Math.max(1, parseInt(process.env.E2E_SUPPORT_TICKET_COUNT || '10', 10)));

async function initAdmin() {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');

  if (getApps().length) {
    return { auth: getAuth() };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  } else if (projectId) {
    console.warn('Using ADC (gcloud auth application-default login). For reliability, set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.');
    initializeApp({ projectId });
  } else {
    throw new Error(
      'Set FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID) in .env.local.\n' +
      'For production/remote runs, also set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY (service account).'
    );
  }

  return { auth: getAuth() };
}

async function idTokenForUser(adminAuth, email) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY missing in .env.local');

  const user = await adminAuth.getUserByEmail(email);
  const custom = await adminAuth.createCustomToken(user.uid);

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!data.idToken) {
    throw new Error(`signInWithCustomToken failed for ${email}: ${JSON.stringify(data)}`);
  }
  return data.idToken;
}

async function apiPost(idToken, pathname, body) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${pathname} ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

const categories = ['general', 'billing', 'technical', 'work-order', 'account', 'bug-report', 'feature-request'];
const priorities = ['low', 'medium', 'high', 'urgent'];
const types = ['question', 'problem', 'task', 'incident'];

async function main() {
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`Client=${CLIENT_EMAIL} Admin=${ADMIN_EMAIL} tickets=${TICKET_COUNT}\n`);

  const { auth: adminAuth } = await initAdmin();

  const [clientToken, adminToken] = await Promise.all([
    idTokenForUser(adminAuth, CLIENT_EMAIL),
    idTokenForUser(adminAuth, ADMIN_EMAIL),
  ]);

  const ticketIds = [];

  for (let i = 0; i < TICKET_COUNT; i++) {
    const payload = {
      title: `[E2E ${new Date().toISOString().slice(0, 10)}] Test ticket ${i + 1}/${TICKET_COUNT}`,
      description: `Automated support flow test. Index ${i + 1}. Created by e2e-support-tickets.mjs`,
      category: categories[i % categories.length],
      priority: priorities[i % priorities.length],
      type: types[i % types.length],
    };
    const created = await apiPost(clientToken, '/api/support-tickets/create', payload);
    if (!created.ticketId) throw new Error(`create missing ticketId: ${JSON.stringify(created)}`);
    ticketIds.push(created.ticketId);
    console.log(`✓ Created ${created.ticketId}`);
  }

  for (let i = 0; i < ticketIds.length; i++) {
    const id = ticketIds[i];
    await apiPost(adminToken, '/api/support-tickets/comment', {
      ticketId: id,
      body: `Admin reply (step 1) — investigating ticket ${i + 1}.`,
    });
    console.log(`✓ Admin comment on ${id}`);

    await apiPost(adminToken, '/api/support-tickets/update-status', {
      ticketId: id,
      status: 'in-progress',
    });
    console.log(`✓ Status in-progress ${id}`);

    await apiPost(adminToken, '/api/support-tickets/update-status', {
      ticketId: id,
      status: 'waiting-on-client',
    });
    console.log(`✓ Status waiting-on-client ${id}`);

    await apiPost(adminToken, '/api/support-tickets/update-status', {
      ticketId: id,
      status: 'in-progress',
    });
    console.log(`✓ Status in-progress (again) ${id}`);

    await apiPost(adminToken, '/api/support-tickets/update-status', {
      ticketId: id,
      status: 'resolved',
    });
    console.log(`✓ Status resolved ${id}`);

    await apiPost(adminToken, '/api/support-tickets/update-status', {
      ticketId: id,
      status: 'closed',
    });
    console.log(`✓ Status closed ${id}`);
  }

  console.log(`\nDone. ${ticketIds.length} tickets exercised (create → comment → status chain → closed).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
