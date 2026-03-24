/**
 * Work order lifecycle smoke + console error capture (Playwright).
 *
 * Required env:
 *   E2E_BASE_URL (default https://groundopscos.vercel.app)
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 *   E2E_SUB_EMAIL, E2E_SUB_PASSWORD
 *
 * Test data (your sandbox):
 *   Company nffggNElicRzjFOaVfHF, Location y5NircRoMX77Luf4Uhxg,
 *   Client 8mylICiCy8Oq5cR89DhFH5IgEUi1 (mperasso1@icloud.com),
 *   Sub xcBZH6MlsbSRlwH3J1GmoOiUKWJ3 (waseemisle@gmail.com)
 *
 * Full matrix (manual or extend this script):
 *   - 3× client-created standard: /client-portal/work-orders/create
 *   - 3× admin-created (2 standard guided or modal, 1 maintenance = modal + "Maintenance Request Order")
 *   Then per order: approve → share bidding → sub quote → admin send quote → client accept → sub accept → sub complete → invoice / auto-charge
 *
 * Run: E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... ... node scripts/e2e-work-order-lifecycle.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';

const BASE_URL = process.env.E2E_BASE_URL || 'https://groundopscos.vercel.app';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL || '';
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD || '';
const SUB_EMAIL = process.env.E2E_SUB_EMAIL || '';
const SUB_PASSWORD = process.env.E2E_SUB_PASSWORD || '';

const out = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  consoleErrors: [],
  pageErrors: [],
  steps: [],
};

function attachListeners(page, label) {
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error') {
      out.consoleErrors.push({ page: label, text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    out.pageErrors.push({ page: label, message: err.message, stack: err.stack?.slice(0, 500) });
  });
}

async function login(page, email, password, label) {
  attachListeners(page, label);
  await page.goto(`${BASE_URL}/portal-login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input#email, input[type="email"]').first().fill(email);
  await page.locator('input#password, input[type="password"]').first().fill(password);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !CLIENT_EMAIL || !CLIENT_PASSWORD || !SUB_EMAIL || !SUB_PASSWORD) {
    console.error(
      'Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD, E2E_SUB_EMAIL, E2E_SUB_PASSWORD'
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  const client = await ctx.newPage();
  const sub = await ctx.newPage();

  try {
    await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD, 'admin');
    out.steps.push({ ok: true, who: 'admin', url: admin.url() });

    await admin.goto(`${BASE_URL}/admin-portal/work-orders`, { waitUntil: 'domcontentloaded' });
    await admin.waitForTimeout(2000);
    out.steps.push({ ok: true, who: 'admin', screen: 'work-orders-list' });

    await admin.goto(`${BASE_URL}/admin-portal/work-orders/create/guided`, { waitUntil: 'domcontentloaded' });
    await admin.waitForTimeout(2000);
    out.steps.push({ ok: true, who: 'admin', screen: 'guided-create' });

    await login(client, CLIENT_EMAIL, CLIENT_PASSWORD, 'client');
    await client.goto(`${BASE_URL}/client-portal/work-orders`, { waitUntil: 'domcontentloaded' });
    await client.waitForTimeout(2000);
    out.steps.push({ ok: true, who: 'client', screen: 'work-orders' });

    await client.goto(`${BASE_URL}/client-portal/work-orders/create`, { waitUntil: 'domcontentloaded' });
    await client.waitForTimeout(2000);
    out.steps.push({ ok: true, who: 'client', screen: 'create' });

    await login(sub, SUB_EMAIL, SUB_PASSWORD, 'sub');
    await sub.goto(`${BASE_URL}/subcontractor-portal/bidding`, { waitUntil: 'domcontentloaded' });
    await sub.waitForTimeout(2000);
    out.steps.push({ ok: true, who: 'sub', screen: 'bidding' });

    await sub.goto(`${BASE_URL}/subcontractor-portal/assigned`, { waitUntil: 'domcontentloaded' });
    await sub.waitForTimeout(2000);
    out.steps.push({ ok: true, who: 'sub', screen: 'assigned' });
  } finally {
    out.finishedAt = new Date().toISOString();
    await fs.mkdir('artifacts', { recursive: true });
    await fs.writeFile('artifacts/work-order-lifecycle-smoke.json', JSON.stringify(out, null, 2));
    await browser.close();
  }

  const bad = out.consoleErrors.length + out.pageErrors.length;
  if (bad > 0) {
    console.error(JSON.stringify(out, null, 2));
    process.exit(2);
  }
  console.log('Smoke OK — no console/page errors on loaded screens. Report: artifacts/work-order-lifecycle-smoke.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
