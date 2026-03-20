#!/usr/bin/env node
/**
 * Creates a test work order for mperasso1@icloud.com and triggers
 * the automated new-work-order email notification.
 *
 * Usage: node scripts/create-test-wo-email.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, '..');

// ── Load .env.local ───────────────────────────────────────────────────────────
function loadEnv() {
  const lines = readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([^=]+)=["']?([^"'\n]*)["']?$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const ENV     = loadEnv();
const API_KEY = ENV.NEXT_PUBLIC_FIREBASE_API_KEY;
const PROJECT = ENV.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const APP_URL = (ENV.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app').replace(/\/$/, '');

const AUTH_URL = `https://identitytoolkit.googleapis.com/v1`;
const FS_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const CLIENT_ID    = '8mylICiCy8Oq5cR89DhFH5IgEUi1';
const CLIENT_EMAIL = 'mperasso1@icloud.com';

// ── Helpers ───────────────────────────────────────────────────────────────────
async function post(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res  = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || JSON.stringify(data));
  return data;
}

async function fsGet(path, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res  = await fetch(`${FS_URL}/${path}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || JSON.stringify(data));
  return data;
}

async function fsQuery(colPath, token, ...conditions) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: colPath }],
      where: conditions.length === 1
        ? conditions[0]
        : { compositeFilter: { op: 'AND', filters: conditions } },
      limit: 10,
    },
  };
  const res  = await fetch(`${FS_URL}:runQuery`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function fsCreate(col, docId, fields, token) {
  const url = `${FS_URL}/${col}?documentId=${docId}`;
  return post(url, { fields }, token);
}

const sv  = v => ({ stringValue:    String(v) });
const bv  = v => ({ booleanValue:   Boolean(v) });
const av  = arr => ({ arrayValue:   { values: arr } });
const tv  = v => ({ timestampValue: v instanceof Date ? v.toISOString() : v });
const now = () => tv(new Date());
const uuid = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

function fieldVal(field) {
  if (!field) return null;
  return field.stringValue ?? field.integerValue ?? field.booleanValue ?? field.timestampValue ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Test Work Order + Email Trigger');
  console.log('══════════════════════════════════════════════════════════\n');

  // 1. Sign in as sync/admin account
  console.log('1. Signing in as admin...');
  const authData = await post(`${AUTH_URL}/accounts:signInWithPassword?key=${API_KEY}`, {
    email: ENV.FIREBASE_SYNC_EMAIL,
    password: ENV.FIREBASE_SYNC_PASSWORD,
    returnSecureToken: true,
  });
  const token = authData.idToken;
  console.log(`   ✅  Signed in as ${ENV.FIREBASE_SYNC_EMAIL}\n`);

  // 2. Fetch client document
  console.log('2. Fetching client...');
  const clientDoc = await fsGet(`clients/${CLIENT_ID}`, token);
  const clientName = fieldVal(clientDoc.fields?.fullName) || 'M Perasso';
  console.log(`   ✅  Client: ${clientName} (${CLIENT_EMAIL})\n`);

  // 3. Find a location for this client
  console.log('3. Finding client location...');
  const locResults = await fsQuery('locations', token, {
    fieldFilter: {
      field: { fieldPath: 'clientId' },
      op: 'EQUAL',
      value: { stringValue: CLIENT_ID },
    },
  });

  let locationId   = '';
  let locationName = '';

  const locDocs = (locResults || []).filter(r => r.document);
  if (locDocs.length > 0) {
    const locFields = locDocs[0].document.fields;
    locationId   = locDocs[0].document.name.split('/').pop();
    locationName = fieldVal(locFields?.locationName) || fieldVal(locFields?.name) || 'Client Location';
    console.log(`   ✅  Location: ${locationName} (${locationId})\n`);
  } else {
    console.log('   ⚠️   No location found — work order will have no location\n');
  }

  // 4. Build and create work order
  console.log('4. Creating work order in Firestore...');
  const workOrderNumber = `WO-${Date.now().toString().slice(-8).toUpperCase()}`;
  const workOrderId     = uuid();

  const timelineEvent = {
    mapValue: { fields: {
      type:      sv('created'),
      timestamp: now(),
      userId:    sv('system'),
      userName:  sv('Admin (Test Script)'),
      userRole:  sv('admin'),
      details:   sv('Test work order created via create-test-wo-email.mjs to verify automated emails'),
      metadata:  { mapValue: { fields: { source: sv('test_script') } } },
    }},
  };

  const woFields = {
    workOrderNumber:           sv(workOrderNumber),
    title:                     sv('Outlet Not Working'),
    description:               sv('TEST — Multiple outlets in the conference room are not working. Breaker appears fine. Please inspect and repair.'),
    category:                  sv('Electrical'),
    priority:                  sv('medium'),
    status:                    sv('pending'),
    clientId:                  sv(CLIENT_ID),
    clientName:                sv(clientName),
    clientEmail:               sv(CLIENT_EMAIL),
    locationId:                sv(locationId),
    locationName:              sv(locationName),
    images:                    av([]),
    isMaintenanceRequestOrder: bv(false),
    createdAt:                 now(),
    updatedAt:                 now(),
    timeline:                  av([timelineEvent]),
    systemInformation: { mapValue: { fields: {
      createdBy: { mapValue: { fields: {
        id:        sv('system'),
        name:      sv('Admin (Test Script)'),
        role:      sv('admin'),
        timestamp: now(),
      }}},
    }}},
  };

  await fsCreate('workOrders', workOrderId, woFields, token);
  console.log(`   ✅  Work order created: ${workOrderNumber} (id: ${workOrderId})\n`);

  // 5. Trigger email notification
  console.log('5. Triggering email notification via API...');
  const emailPayload = {
    workOrderId,
    workOrderNumber,
    title:        'Outlet Not Working',
    clientName,
    locationName,
    priority:     'medium',
    workOrderType: 'standard',
    description:  'TEST — Multiple outlets in the conference room are not working. Breaker appears fine. Please inspect and repair.',
  };

  const emailRes = await fetch(`${APP_URL}/api/email/send-work-order-notification`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(emailPayload),
  });
  const emailData = await emailRes.json();

  if (!emailRes.ok) {
    console.error(`   ❌  Email API error (${emailRes.status}):`, JSON.stringify(emailData));
  } else {
    console.log(`   ✅  Email API response:`, JSON.stringify(emailData));
    console.log(`   📧  Sent: ${emailData.sent ?? '?'} | Failed: ${emailData.failed ?? '?'}\n`);
  }

  console.log('══════════════════════════════════════════════════════════');
  console.log(`  DONE`);
  console.log(`  Work Order : ${workOrderNumber}`);
  console.log(`  Client     : ${clientName} (${CLIENT_EMAIL})`);
  console.log(`  Location   : ${locationName}`);
  console.log(`  Portal URL : ${APP_URL}/admin-portal/work-orders/${workOrderId}`);
  console.log('══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌  Script failed:', err.message);
  process.exit(1);
});
