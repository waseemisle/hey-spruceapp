#!/usr/bin/env node
/**
 * Comprehensive seed script for groundopss Firebase project
 * Creates: admin, client, subcontractor users + full test data
 *
 * Usage:
 *   node scripts/seed-test-data.mjs
 *
 * Reads credentials from .env.local automatically.
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = join(ROOT, '.env.local');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([^=]+)="?([^"]*)"?$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const ENV = loadEnv();
const API_KEY   = ENV.NEXT_PUBLIC_FIREBASE_API_KEY;
const PROJECT   = ENV.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const BASE_URL  = 'http://localhost:3000';

if (!API_KEY || !PROJECT) {
  console.error('❌  Missing NEXT_PUBLIC_FIREBASE_API_KEY or NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local');
  process.exit(1);
}

// ── Test user credentials ────────────────────────────────────────────────────
const USERS = {
  admin: {
    email:    'admin@groundopss-test.com',
    password: 'Test1234!',
    fullName: 'Test Admin',
    phone:    '+1 555-000-0001',
    role:     'admin',
  },
  client: {
    email:       'client@groundopss-test.com',
    password:    'Test1234!',
    fullName:    'Test Client',
    phone:       '+1 555-000-0002',
    role:        'client',
    companyName: 'Acme Property Group',
    status:      'approved',
  },
  subcontractor: {
    email:        'sub@groundopss-test.com',
    password:     'Test1234!',
    fullName:     'Test Subcontractor',
    phone:        '+1 555-000-0003',
    role:         'subcontractor',
    businessName: 'Quick Fix Services LLC',
    licenseNumber:'LIC-TEST-001',
    skills:       ['Plumbing', 'Electrical', 'HVAC'],
    status:       'approved',
  },
};

// ── Firebase REST helpers ────────────────────────────────────────────────────
const AUTH_URL = `https://identitytoolkit.googleapis.com/v1`;
const FS_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function post(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || JSON.stringify(data));
  return data;
}

async function patch(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || JSON.stringify(data));
  return data;
}

async function createAuthUser(email, password) {
  const data = await post(`${AUTH_URL}/accounts:signUp?key=${API_KEY}`, {
    email, password, returnSecureToken: true,
  });
  return { uid: data.localId, idToken: data.idToken };
}

async function signIn(email, password) {
  const data = await post(`${AUTH_URL}/accounts:signInWithPassword?key=${API_KEY}`, {
    email, password, returnSecureToken: true,
  });
  return { uid: data.localId, idToken: data.idToken };
}

async function deleteAuthUser(idToken) {
  try {
    await post(`${AUTH_URL}/accounts:delete?key=${API_KEY}`, { idToken });
  } catch (e) { /* ignore */ }
}

async function fsCreate(collection, docId, fields, token) {
  const url = `${FS_URL}/${collection}?documentId=${docId}`;
  return post(url, { fields }, token);
}

async function fsPatch(collection, docId, fields, token) {
  const fieldPaths = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const url = `${FS_URL}/${collection}/${docId}?${fieldPaths}`;
  return patch(url, { fields }, token);
}

// ── Firestore value helpers ──────────────────────────────────────────────────
const sv  = v => ({ stringValue:    String(v) });
const bv  = v => ({ booleanValue:   Boolean(v) });
const nv  = v => ({ integerValue:   String(v) });
const dv  = v => ({ doubleValue:    Number(v) });
const tv  = v => ({ timestampValue: v instanceof Date ? v.toISOString() : v });
const av  = arr => ({ arrayValue:   { values: arr } });
const now = ()  => tv(new Date());
const uuid = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

// ── Step 1: Patch firestore.rules for bootstrapping ──────────────────────────
const RULES_PATH = join(ROOT, 'firestore.rules');
const ORIG_RULES = readFileSync(RULES_PATH, 'utf8');

function patchRules() {
  // Allow signed-in users to write their own adminUsers doc (bootstrap only)
  const patched = ORIG_RULES.replace(
    '// Admin users - admins can read/write; users can read their own doc\n    match /adminUsers/{userId} {\n      allow read: if isSignedIn() && (isAdmin() || userId == request.auth.uid);\n      allow write: if isSignedIn() && isAdmin();',
    '// Admin users - admins can read/write; users can read their own doc\n    match /adminUsers/{userId} {\n      allow read: if isSignedIn() && (isAdmin() || userId == request.auth.uid);\n      allow write: if isSignedIn() && (isAdmin() || userId == request.auth.uid); // BOOTSTRAP'
  );
  writeFileSync(RULES_PATH, patched);
  console.log('📝  Patched firestore.rules (allow adminUsers self-write for bootstrap)');
}

function restoreRules() {
  writeFileSync(RULES_PATH, ORIG_RULES);
  console.log('📝  Restored original firestore.rules');
}

function deployRules() {
  console.log('🚀  Deploying Firestore rules + indexes to groundopss...');
  try {
    const out = execSync('firebase deploy --only firestore --project groundopss 2>&1', {
      cwd: ROOT, encoding: 'utf8',
    });
    console.log(out);
    if (out.includes('Deploy complete!') || out.includes('released rules')) {
      console.log('✅  Firestore rules + indexes deployed');
    } else {
      throw new Error('Deploy output did not confirm success:\n' + out);
    }
  } catch (e) {
    // execSync throws on non-zero exit, but firebase CLI sometimes exits non-zero even on success
    const output = e.stdout || e.output?.join('') || e.message || '';
    if (output.includes('Deploy complete!') || output.includes('released rules')) {
      console.log('✅  Firestore rules + indexes deployed (firebase CLI exited non-zero but deploy succeeded)');
      return;
    }
    console.error('❌  Firebase deploy failed:', e.message);
    throw e;
  }
}

// ── Step 2: Delete existing test users (idempotent) ──────────────────────────
async function cleanupUser(email, password) {
  try {
    const { idToken } = await signIn(email, password);
    await deleteAuthUser(idToken);
    console.log(`🗑   Removed existing auth user: ${email}`);
  } catch (e) {
    // Not found / wrong password — skip
  }
}

// ── Step 3: Create a user and their Firestore document ───────────────────────
async function createUser(user) {
  const { uid, idToken } = await createAuthUser(user.email, user.password);
  console.log(`✅  Auth user created: ${user.email} (uid: ${uid})`);

  const collection =
    user.role === 'admin'         ? 'adminUsers' :
    user.role === 'client'        ? 'clients'    :
    'subcontractors';

  const fields = {
    email:     sv(user.email),
    role:      sv(user.role),
    fullName:  sv(user.fullName),
    phone:     sv(user.phone),
    createdAt: now(),
    updatedAt: now(),
  };

  if (user.role === 'client') {
    fields.companyName = sv(user.companyName);
    fields.status      = sv(user.status);
  }
  if (user.role === 'subcontractor') {
    fields.businessName   = sv(user.businessName);
    fields.licenseNumber  = sv(user.licenseNumber);
    fields.skills         = av(user.skills.map(sv));
    fields.status         = sv(user.status);
  }

  await fsCreate(collection, uid, fields, idToken);
  console.log(`✅  Firestore /${collection}/${uid} created`);

  return { uid, idToken };
}

// ── Step 4: Seed test data as admin ─────────────────────────────────────────
async function seedData(adminToken, adminUid, clientUid, subUid) {

  // ── Categories ──────────────────────────────────────────────────────────
  const catIds = {};
  for (const name of ['Plumbing', 'Electrical', 'HVAC', 'Landscaping', 'General Maintenance']) {
    const id = uuid();
    await fsCreate('categories', id, { name: sv(name), createdAt: now() }, adminToken);
    catIds[name] = id;
  }
  console.log('✅  Created 5 categories');

  // ── Company / Subsidiary ────────────────────────────────────────────────
  const companyId = uuid();
  await fsCreate('companies', companyId, {
    name:      sv('Acme Property Group HQ'),
    clientId:  sv(clientUid),
    address:   sv('100 Corporate Blvd, Austin TX 78701'),
    createdAt: now(),
    updatedAt: now(),
  }, adminToken);

  const subId = uuid();
  await fsCreate('subsidiaries', subId, {
    name:      sv('Acme North Austin'),
    clientId:  sv(clientUid),
    companyId: sv(companyId),
    address:   sv('200 North Loop, Austin TX 78756'),
    createdAt: now(),
    updatedAt: now(),
  }, adminToken);
  console.log('✅  Created company + subsidiary');

  // ── Location ────────────────────────────────────────────────────────────
  const locId = uuid();
  await fsCreate('locations', locId, {
    name:         sv('Main Office - Austin'),
    address:      sv('123 Main St, Austin TX 78701'),
    city:         sv('Austin'),
    state:        sv('TX'),
    zip:          sv('78701'),
    clientId:     sv(clientUid),
    companyId:    sv(companyId),
    subsidiaryId: sv(subId),
    createdAt:    now(),
    updatedAt:    now(),
  }, adminToken);
  console.log('✅  Created location');

  // ── Work Orders ─────────────────────────────────────────────────────────
  const wo1Id = uuid();
  await fsCreate('workOrders', wo1Id, {
    title:                      sv('Fix leaking pipe in bathroom'),
    description:                sv('There is a leaking pipe under sink #2 in the 2nd floor bathroom. Water is pooling on the floor.'),
    status:                     sv('pending'),
    priority:                   sv('high'),
    category:                   sv('Plumbing'),
    categoryId:                 sv(catIds['Plumbing']),
    clientId:                   sv(clientUid),
    locationId:                 sv(locId),
    companyId:                  sv(companyId),
    isMaintenanceRequestOrder:  bv(false),
    createdAt:                  now(),
    updatedAt:                  now(),
    timeline: av([]),
  }, adminToken);

  const wo2Id = uuid();
  await fsCreate('workOrders', wo2Id, {
    title:                      sv('HVAC annual maintenance'),
    description:                sv('Annual inspection and filter replacement for all 4 HVAC units on rooftop.'),
    status:                     sv('in_progress'),
    priority:                   sv('medium'),
    category:                   sv('HVAC'),
    categoryId:                 sv(catIds['HVAC']),
    clientId:                   sv(clientUid),
    locationId:                 sv(locId),
    companyId:                  sv(companyId),
    assignedSubcontractor:      sv(subUid),
    isMaintenanceRequestOrder:  bv(false),
    createdAt:                  now(),
    updatedAt:                  now(),
    timeline: av([]),
  }, adminToken);

  const wo3Id = uuid();
  await fsCreate('workOrders', wo3Id, {
    title:                      sv('Electrical panel inspection'),
    description:                sv('Inspect and test main electrical panel in server room. Check all breakers.'),
    status:                     sv('completed'),
    priority:                   sv('low'),
    category:                   sv('Electrical'),
    categoryId:                 sv(catIds['Electrical']),
    clientId:                   sv(clientUid),
    locationId:                 sv(locId),
    companyId:                  sv(companyId),
    assignedSubcontractor:      sv(subUid),
    isMaintenanceRequestOrder:  bv(false),
    createdAt:                  now(),
    updatedAt:                  now(),
    timeline: av([]),
  }, adminToken);
  console.log('✅  Created 3 work orders (pending, in_progress, completed)');

  // ── Maintenance Request Work Order ──────────────────────────────────────
  const wo4Id = uuid();
  await fsCreate('workOrders', wo4Id, {
    title:                      sv('Emergency: Water leak in lobby'),
    description:                sv('Tenant reported water dripping from ceiling in main lobby. Urgent response needed.'),
    status:                     sv('pending'),
    priority:                   sv('urgent'),
    category:                   sv('Plumbing'),
    categoryId:                 sv(catIds['Plumbing']),
    clientId:                   sv(clientUid),
    locationId:                 sv(locId),
    companyId:                  sv(companyId),
    isMaintenanceRequestOrder:  bv(true),
    createdAt:                  now(),
    updatedAt:                  now(),
    timeline: av([]),
  }, adminToken);
  console.log('✅  Created 1 maintenance request work order');

  // ── Quote ───────────────────────────────────────────────────────────────
  const q1Id = uuid();
  await fsCreate('quotes', q1Id, {
    workOrderId:      sv(wo2Id),
    subcontractorId:  sv(subUid),
    clientId:         sv(clientUid),
    amount:           dv(1250.00),
    laborCost:        dv(800.00),
    materialCost:     dv(450.00),
    description:      sv('HVAC annual maintenance — 4 units, includes labor and filters'),
    status:           sv('submitted'),
    notes:            sv('Will bring all tools and replacement filters. Estimated 6 hours.'),
    createdAt:        now(),
    updatedAt:        now(),
  }, adminToken);

  const q2Id = uuid();
  await fsCreate('quotes', q2Id, {
    workOrderId:      sv(wo1Id),
    subcontractorId:  sv(subUid),
    clientId:         sv(clientUid),
    amount:           dv(350.00),
    laborCost:        dv(250.00),
    materialCost:     dv(100.00),
    description:      sv('Plumbing repair — replace P-trap and supply lines under sink #2'),
    status:           sv('approved'),
    notes:            sv('Parts are in stock. Can complete same day.'),
    createdAt:        now(),
    updatedAt:        now(),
  }, adminToken);
  console.log('✅  Created 2 quotes (submitted + approved)');

  // ── Invoices ────────────────────────────────────────────────────────────
  const inv1Id = uuid();
  await fsCreate('invoices', inv1Id, {
    invoiceNumber:    sv('INV-TEST-001'),
    workOrderId:      sv(wo3Id),
    subcontractorId:  sv(subUid),
    clientId:         sv(clientUid),
    status:           sv('sent'),
    totalAmount:      dv(875.00),
    lineItems: av([
      { mapValue: { fields: {
        description: sv('Electrical panel inspection'),
        quantity:    nv(1),
        unitPrice:   dv(750.00),
        total:       dv(750.00),
      }}},
      { mapValue: { fields: {
        description: sv('Materials and supplies'),
        quantity:    nv(1),
        unitPrice:   dv(125.00),
        total:       dv(125.00),
      }}},
    ]),
    notes:    sv('Thank you for your business! Payment due within 30 days.'),
    dueDate:  sv(new Date(Date.now() + 30 * 864e5).toISOString()),
    createdAt: now(),
    updatedAt: now(),
  }, adminToken);

  const inv2Id = uuid();
  await fsCreate('invoices', inv2Id, {
    invoiceNumber:    sv('INV-TEST-002'),
    workOrderId:      sv(wo2Id),
    subcontractorId:  sv(subUid),
    clientId:         sv(clientUid),
    status:           sv('paid'),
    totalAmount:      dv(1250.00),
    lineItems: av([
      { mapValue: { fields: {
        description: sv('HVAC maintenance service'),
        quantity:    nv(4),
        unitPrice:   dv(200.00),
        total:       dv(800.00),
      }}},
      { mapValue: { fields: {
        description: sv('Replacement filters (4 units)'),
        quantity:    nv(4),
        unitPrice:   dv(112.50),
        total:       dv(450.00),
      }}},
    ]),
    notes:    sv('Paid in full. Thank you!'),
    dueDate:  sv(new Date(Date.now() - 5 * 864e5).toISOString()),
    paidAt:   now(),
    createdAt: now(),
    updatedAt: now(),
  }, adminToken);

  const inv3Id = uuid();
  await fsCreate('invoices', inv3Id, {
    invoiceNumber:    sv('INV-TEST-003'),
    clientId:         sv(clientUid),
    status:           sv('draft'),
    totalAmount:      dv(350.00),
    lineItems: av([
      { mapValue: { fields: {
        description: sv('Plumbing repair — sink #2'),
        quantity:    nv(1),
        unitPrice:   dv(350.00),
        total:       dv(350.00),
      }}},
    ]),
    notes:    sv('Draft invoice pending client approval.'),
    dueDate:  sv(new Date(Date.now() + 15 * 864e5).toISOString()),
    createdAt: now(),
    updatedAt: now(),
  }, adminToken);
  console.log('✅  Created 3 invoices (sent, paid, draft)');

  // ── Recurring Work Order ─────────────────────────────────────────────────
  const rwoId = uuid();
  await fsCreate('recurringWorkOrders', rwoId, {
    title:       sv('Monthly Landscaping'),
    description: sv('Monthly lawn mowing, trimming, and general ground maintenance.'),
    category:    sv('Landscaping'),
    categoryId:  sv(catIds['Landscaping']),
    clientId:    sv(clientUid),
    locationId:  sv(locId),
    companyId:   sv(companyId),
    status:      sv('active'),
    recurrencePattern: { mapValue: { fields: {
      type:       sv('monthly'),
      dayOfMonth: nv(1),
    }}},
    nextExecution: tv(new Date(Date.now() + 10 * 864e5)),
    createdAt:     now(),
    updatedAt:     now(),
  }, adminToken);
  console.log('✅  Created 1 recurring work order');

  // ── Assigned Job ─────────────────────────────────────────────────────────
  const jobId = uuid();
  await fsCreate('assignedJobs', jobId, {
    workOrderId:     sv(wo2Id),
    subcontractorId: sv(subUid),
    clientId:        sv(clientUid),
    locationId:      sv(locId),
    title:           sv('HVAC annual maintenance'),
    status:          sv('in_progress'),
    assignedAt:      now(),
    updatedAt:       now(),
  }, adminToken);
  console.log('✅  Created 1 assigned job for subcontractor');

  // ── Bidding Work Order ───────────────────────────────────────────────────
  const bidId = uuid();
  await fsCreate('biddingWorkOrders', bidId, {
    workOrderId:     sv(wo1Id),
    subcontractorId: sv(subUid),
    status:          sv('open'),
    sharedAt:        now(),
    dueDate:         tv(new Date(Date.now() + 3 * 864e5)),
  }, adminToken);
  console.log('✅  Created 1 bidding opportunity for subcontractor');

  // ── Notifications ─────────────────────────────────────────────────────────
  for (const [userId, msg] of [
    [adminUid,  'New work order submitted by Test Client'],
    [clientUid, 'Your work order "Fix leaking pipe" has been received'],
    [subUid,    'You have a new bidding opportunity available'],
  ]) {
    await fsCreate('notifications', uuid(), {
      userId:    sv(userId),
      message:   sv(msg),
      read:      bv(false),
      createdAt: now(),
    }, adminToken);
  }
  console.log('✅  Created 3 notifications (one per user)');

  return {
    categoryIds: catIds,
    companyId, subId, locId,
    workOrderIds: [wo1Id, wo2Id, wo3Id, wo4Id],
    quoteIds: [q1Id, q2Id],
    invoiceIds: [inv1Id, inv2Id, inv3Id],
    rwoId, jobId, bidId,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  GroundOps Test Data Seeder — Firebase project: groundopss');
  console.log('══════════════════════════════════════════════════════════\n');

  // 1. Patch rules + deploy
  patchRules();
  try {
    deployRules();
  } catch (e) {
    restoreRules();
    process.exit(1);
  }

  // Small wait for rules propagation
  await new Promise(r => setTimeout(r, 3000));

  let adminUid, clientUid, subUid, adminToken;

  try {
    // 2. Clean up any pre-existing test users
    console.log('\n── Cleaning up existing test accounts ──');
    for (const u of Object.values(USERS)) await cleanupUser(u.email, u.password);

    // 3. Create users
    console.log('\n── Creating test users ──');
    const adminData  = await createUser(USERS.admin);
    adminUid  = adminData.uid;
    adminToken = adminData.idToken;

    const clientData = await createUser(USERS.client);
    clientUid = clientData.uid;

    const subData    = await createUser(USERS.subcontractor);
    subUid    = subData.uid;

    // 4. Seed test data (all as admin)
    console.log('\n── Seeding test data ──');
    const refs = await seedData(adminToken, adminUid, clientUid, subUid);

    // 5. Restore + redeploy original rules
    console.log('\n── Restoring security rules ──');
    restoreRules();
    deployRules();

    // 6. Verify logins work
    console.log('\n── Verifying logins ──');
    for (const u of Object.values(USERS)) {
      try {
        await signIn(u.email, u.password);
        console.log(`✅  Login verified: ${u.email}`);
      } catch (e) {
        console.error(`❌  Login FAILED for ${u.email}: ${e.message}`);
      }
    }

    // 7. Summary
    console.log(`
══════════════════════════════════════════════════════════
  ✅  SEED COMPLETE — Firebase project: ${PROJECT}
══════════════════════════════════════════════════════════

  TEST USERS (all use password: Test1234!)
  ─────────────────────────────────────────────────────────
  👤  Admin
      Email:    ${USERS.admin.email}
      Password: ${USERS.admin.password}
      Portal:   http://localhost:3000/portal-login → Admin Portal

  👤  Client
      Email:    ${USERS.client.email}
      Password: ${USERS.client.password}
      Company:  ${USERS.client.companyName}
      Portal:   http://localhost:3000/portal-login → Client Portal

  👤  Subcontractor
      Email:    ${USERS.subcontractor.email}
      Password: ${USERS.subcontractor.password}
      Business: ${USERS.subcontractor.businessName}
      Portal:   http://localhost:3000/portal-login → Subcontractor Portal

  TEST DATA CREATED
  ─────────────────────────────────────────────────────────
  📂  5 Categories
  🏢  1 Company + 1 Subsidiary
  📍  1 Location
  📋  4 Work Orders (pending, in_progress, completed, maintenance-request)
  💬  2 Quotes (submitted, approved)
  🧾  3 Invoices (sent, paid, draft)
  🔄  1 Recurring Work Order (monthly)
  🔨  1 Assigned Job
  🏷   1 Bidding Opportunity
  🔔  3 Notifications

  LOGIN URL: http://localhost:3000/portal-login
══════════════════════════════════════════════════════════
`);
  } catch (err) {
    console.error('\n❌  Seed failed:', err.message || err);
    // Always restore rules on failure
    try { restoreRules(); deployRules(); } catch (_) {}
    process.exit(1);
  }
}

main();
