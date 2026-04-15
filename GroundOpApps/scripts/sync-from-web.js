#!/usr/bin/env node
// Sync "verbatim" files from the Next.js web repo into the mobile codebase.
// Run before each build so mobile types/constants never drift.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');       // hey-spruceapp
const MOB  = path.join(ROOT, 'GroundOpApps', 'mobile');

const COPIES = [
  ['types/index.ts',                 'types/index.ts'],
  ['lib/problem-taxonomy.ts',        'lib/problem-taxonomy.ts'],
  ['lib/invoice-number.ts',          'lib/invoice-number.ts'],
  ['lib/appy-client.ts',             'lib/appy-client.ts'],
  ['lib/subcontractor-ids.ts',       'lib/subcontractor-ids.ts'],
];

for (const [src, dst] of COPIES) {
  const s = path.join(ROOT, src);
  const d = path.join(MOB, dst);
  if (!fs.existsSync(s)) { console.warn('✗ missing', src); continue; }
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.copyFileSync(s, d);
  console.log('✓', dst);
}
