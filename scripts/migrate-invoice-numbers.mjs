#!/usr/bin/env node
/**
 * Normalize documents in the `invoices` collection so `invoiceNumber` matches INV-########
 * (8 digits), the same pattern as generateInvoiceNumber() in lib/invoice-number.ts.
 *
 * Mappings:
 * - Already INV-\\d{8} → unchanged
 * - SPRUCE-XXXXXXXX or SPRUCE-SUB-XXXXXXXX (8 alphanumerics from legacy generators) → INV-XXXXXXXX
 * - Anything else → new INV-######## (unique within this run)
 *
 * Prerequisites:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json
 *
 * Usage:
 *   node scripts/migrate-invoice-numbers.mjs --dry-run
 *   node scripts/migrate-invoice-numbers.mjs
 */

import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const CANONICAL = /^INV-\d{8}$/;
const LEGACY_SPRUCE = /^SPRUCE-(?:SUB-)?([A-Z0-9]{8})$/i;

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return { dryRun, credPath };
}

function allocNumber(used) {
  let n;
  let salt = 0;
  do {
    n = `INV-${(Date.now() + salt++).toString().slice(-8)}`;
  } while (used.has(n));
  used.add(n);
  return n;
}

function targetNumber(raw, used) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { next: allocNumber(used), reason: 'empty_or_non_string' };
  }
  const s = raw.trim();
  if (CANONICAL.test(s)) {
    return { next: s, reason: 'already_canonical' };
  }
  const m = s.match(LEGACY_SPRUCE);
  if (m) {
    const suffix = m[1].toUpperCase();
    if (/^\d{8}$/.test(suffix)) {
      const next = `INV-${suffix}`;
      if (used.has(next)) return { next: allocNumber(used), reason: 'legacy_collision' };
      used.add(next);
      return { next, reason: 'spruce_prefix' };
    }
  }
  return { next: allocNumber(used), reason: 'nonstandard' };
}

async function main() {
  const { dryRun, credPath } = parseArgs();
  if (!credPath) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON path.');
    process.exit(1);
  }

  const sa = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) {
    initializeApp({ credential: cert(sa) });
  }
  const db = getFirestore();
  const snap = await db.collection('invoices').get();

  const used = new Set();
  for (const doc of snap.docs) {
    const num = doc.data().invoiceNumber;
    if (typeof num === 'string' && CANONICAL.test(num.trim())) {
      used.add(num.trim());
    }
  }

  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const raw = data.invoiceNumber;
    const { next, reason } = targetNumber(raw, used);
    if (next === (typeof raw === 'string' ? raw.trim() : raw)) {
      skipped++;
      continue;
    }
    console.log(`${dryRun ? '[dry-run] ' : ''}${doc.id}: "${raw}" → "${next}" (${reason})`);
    if (!dryRun) {
      await doc.ref.update({
        invoiceNumber: next,
        updatedAt: new Date(),
      });
    }
    updated++;
  }

  console.log(
    `\nDone. ${dryRun ? 'Would update' : 'Updated'}: ${updated}, unchanged: ${skipped}, total docs: ${snap.size}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
