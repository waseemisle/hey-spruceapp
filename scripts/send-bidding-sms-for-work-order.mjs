#!/usr/bin/env node
/**
 * Look up a work order (by Firestore id or WO- number), then POST /api/messaging/send
 * for each subcontractor in biddingSubcontractors (bidding-opportunity SMS).
 *
 * Usage:
 *   node scripts/send-bidding-sms-for-work-order.mjs WO-24455368
 *   node scripts/send-bidding-sms-for-work-order.mjs 24455368
 *
 * Requires .env.local: NEXT_PUBLIC_FIREBASE_*, FIREBASE_SYNC_EMAIL, FIREBASE_SYNC_PASSWORD,
 * and NEXT_PUBLIC_APP_URL (defaults to https://groundopscos.vercel.app).
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

function loadEnv() {
  const p = join(ROOT, '.env.local');
  if (!existsSync(p)) {
    console.error('Missing .env.local — cannot sign in to Firestore REST.');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^=#]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

const ENV = loadEnv();
const API_KEY = ENV.NEXT_PUBLIC_FIREBASE_API_KEY;
const PROJECT = ENV.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const APP_URL = (ENV.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app').replace(/\/$/, '');

const AUTH_URL = `https://identitytoolkit.googleapis.com/v1`;
const FS_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function post(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || JSON.stringify(data));
  return data;
}

async function fsGet(path, token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const res = await fetch(`${FS_URL}/${path}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || JSON.stringify(data));
  return data;
}

async function fsQuery(colPath, token, fieldPath, op, stringValue) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: colPath }],
      where: {
        fieldFilter: {
          field: { fieldPath },
          op,
          value: { stringValue },
        },
      },
      limit: 5,
    },
  };
  const res = await fetch(`${FS_URL}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

function fieldVal(field) {
  if (!field) return null;
  return (
    field.stringValue ??
    field.integerValue ??
    field.booleanValue ??
    field.timestampValue ??
    null
  );
}

function arrayOfStrings(field) {
  if (!field?.arrayValue?.values) return [];
  return field.arrayValue.values.map((v) => v.stringValue).filter(Boolean);
}

async function main() {
  const arg = (process.argv[2] || 'WO-24455368').trim();
  if (!API_KEY || !PROJECT) {
    console.error('NEXT_PUBLIC_FIREBASE_API_KEY / NEXT_PUBLIC_FIREBASE_PROJECT_ID missing in .env.local');
    process.exit(1);
  }
  if (!ENV.FIREBASE_SYNC_EMAIL || !ENV.FIREBASE_SYNC_PASSWORD) {
    console.error('FIREBASE_SYNC_EMAIL / FIREBASE_SYNC_PASSWORD missing in .env.local');
    process.exit(1);
  }

  console.log('Signing in...');
  const authData = await post(`${AUTH_URL}/accounts:signInWithPassword?key=${API_KEY}`, {
    email: ENV.FIREBASE_SYNC_EMAIL,
    password: ENV.FIREBASE_SYNC_PASSWORD,
    returnSecureToken: true,
  });
  const token = authData.idToken;

  let woId;
  let fields;

  if (/^WO-/i.test(arg)) {
    console.log(`Querying work order number ${arg}...`);
    const rows = await fsQuery('workOrders', token, 'workOrderNumber', 'EQUAL', arg);
    const hit = (rows || []).find((r) => r.document);
    if (!hit) {
      console.error('No work order found with that number.');
      process.exit(1);
    }
    woId = hit.document.name.split('/').pop();
    fields = hit.document.fields;
  } else {
    console.log(`Fetching work order id ${arg}...`);
    const doc = await fsGet(`workOrders/${arg}`, token);
    woId = arg;
    fields = doc.fields;
  }

  const workOrderNumber = fieldVal(fields?.workOrderNumber) || arg;
  const title = fieldVal(fields?.title) || 'Work order';
  const locationName = fieldVal(fields?.locationName) || '';
  const category = fieldVal(fields?.category) || '';
  const priority = fieldVal(fields?.priority) || '';
  const biddingSubs = arrayOfStrings(fields?.biddingSubcontractors);

  if (!biddingSubs.length) {
    console.error('This work order has no biddingSubcontractors — share it for bidding in the UI first, or add subs.');
    process.exit(1);
  }

  const shareBatchId = `manual-${Date.now()}`;
  console.log(`WO ${workOrderNumber} (${woId}) — sending bidding SMS to ${biddingSubs.length} sub(s), batch ${shareBatchId}`);

  for (const subcontractorId of biddingSubs) {
    const body = {
      type: 'bidding-opportunity',
      subcontractorId,
      context: {
        workOrderId: woId,
        workOrderNumber,
        workOrderTitle: title,
        locationName,
        category,
        priority,
        shareBatchId,
      },
    };
    const res = await fetch(`${APP_URL}/api/messaging/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    console.log(`  ${subcontractorId}: HTTP ${res.status}`, JSON.stringify(json));
  }

  console.log('\nDone. Check SMS logs and the subcontractor phone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
