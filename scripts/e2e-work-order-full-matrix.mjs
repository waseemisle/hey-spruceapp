/**
 * Full work order lifecycle matrix (Playwright).
 *
 * Creates 6 work orders (3 client + 3 admin): standard / maintenance mix, runs
 * approve → share bidding → sub quote → admin forward to client → client approve
 * → sub accept → sub complete → expect pending_invoice (or completed if auto-pay).
 *
 * Required env:
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 *   E2E_SUB_EMAIL, E2E_SUB_PASSWORD
 *
 * Optional:
 *   E2E_BASE_URL (default https://groundopscos.vercel.app)
 *   E2E_CLIENT_UID=8mylICiCy8Oq5cR89DhFH5IgEUi1
 *   E2E_COMPANY_ID=nffggNElicRzjFOaVfHF
 *   E2E_LOCATION_ID=y5NircRoMX77Luf4Uhxg
 *   E2E_MATRIX_LIMIT=1   (only first scenario)
 *   E2E_HEADED=1         (non-headless)
 *
 * Output: artifacts/work-order-full-matrix-report.json
 *
 * Run:
 *   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... ... node scripts/e2e-work-order-full-matrix.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARTIFACTS = path.join(ROOT, 'artifacts');

const BASE_URL = process.env.E2E_BASE_URL || 'https://groundopscos.vercel.app';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL || '';
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD || '';
const SUB_EMAIL = process.env.E2E_SUB_EMAIL || '';
const SUB_PASSWORD = process.env.E2E_SUB_PASSWORD || '';

const CLIENT_UID = process.env.E2E_CLIENT_UID || '8mylICiCy8Oq5cR89DhFH5IgEUi1';
const COMPANY_ID = process.env.E2E_COMPANY_ID || 'nffggNElicRzjFOaVfHF';
const LOCATION_ID = process.env.E2E_LOCATION_ID || 'y5NircRoMX77Luf4Uhxg';

const LIMIT = Math.min(6, Math.max(1, parseInt(process.env.E2E_MATRIX_LIMIT || '6', 10) || 6));

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** @type {{ id: string, source: 'client'|'admin', maintenance: boolean }[]} */
const SCENARIOS = [
  { id: 'client-standard-1', source: 'client', maintenance: false },
  { id: 'client-maintenance-1', source: 'client', maintenance: true },
  { id: 'client-standard-2', source: 'client', maintenance: false },
  { id: 'admin-standard-1', source: 'admin', maintenance: false },
  { id: 'admin-maintenance-1', source: 'admin', maintenance: true },
  { id: 'admin-standard-2', source: 'admin', maintenance: false },
];

const report = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  consoleErrors: [],
  pageErrors: [],
  workOrders: [],
  steps: [],
};

function attach(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      report.consoleErrors.push({ page: label, text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    report.pageErrors.push({ page: label, message: err.message });
  });
}

async function login(page, email, password, label) {
  attach(page, label);
  await page.goto(`${BASE_URL}/portal-login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input#email, input[type="email"]').first().fill(email);
  await page.locator('input#password, input[type="password"]').first().fill(password);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

async function ensureTestImage() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const p = path.join(ARTIFACTS, 'e2e-1x1.png');
  fs.writeFileSync(p, Buffer.from(PNG_B64, 'base64'));
  return p;
}

async function createClientWorkOrder(page, title, description, maintenance, imagePath) {
  await page.goto(`${BASE_URL}/client-portal/work-orders/create`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.locator('#locationId').selectOption(LOCATION_ID);
  await page.locator('#category').selectOption({ index: 1 }).catch(() => {});
  await page.fill('#title', title);
  await page.fill('#description', description);
  if (maintenance) {
    await page.locator('#isMaintenanceRequestOrder').check();
  }
  await page.setInputFiles('#images', imagePath);
  await page.locator('button[type="submit"]:has-text("Create Work Order")').click();
  await page.waitForURL(/\/client-portal\/work-orders/, { timeout: 45000 });
  report.steps.push({ ok: true, action: 'client_create', title });
}

async function createAdminModalWorkOrder(page, title, description, maintenance) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Create Work Order/i }).click();
  await page.waitForTimeout(400);
  if (maintenance) {
    await page.getByRole('button', { name: 'Maintenance Request Work Order' }).click();
  } else {
    await page.getByRole('button', { name: 'Standard Work Order' }).click();
  }
  await page.waitForTimeout(600);
  const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Create New Work Order' });
  await modal.locator('select').nth(0).selectOption(CLIENT_UID);
  await modal.locator('select').nth(1).selectOption(COMPANY_ID);
  await modal.locator('select').nth(2).selectOption(LOCATION_ID);
  await modal.getByPlaceholder(/HVAC Repair/i).fill(title);
  await modal.locator('textarea').first().fill(description);
  await modal.locator('select').nth(3).selectOption({ index: 1 }).catch(() =>
    modal.locator('select').nth(4).selectOption({ index: 1 })
  );
  await modal.getByRole('button', { name: /^Create$/ }).click();
  await page.waitForTimeout(4000);
  report.steps.push({ ok: true, action: 'admin_modal_create', title });
}

async function getWorkOrderIdFromAdminList(page, title) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const search = page.locator('input[placeholder*="Search work orders"]');
  await search.fill(title);
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'View' }).first().click();
  await page.waitForURL(/\/admin-portal\/work-orders\/[^/]+/, { timeout: 20000 });
  const m = page.url().match(/\/work-orders\/([^/?]+)/);
  return m ? m[1] : null;
}

async function adminApproveIfNeeded(page, title) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.locator('input[placeholder*="Search work orders"]').fill(title);
  await page.waitForTimeout(2000);
  const approve = page.getByRole('button', { name: /Approve/i }).first();
  if (await approve.isVisible().catch(() => false)) {
    await approve.click();
    await page.waitForTimeout(2500);
    report.steps.push({ ok: true, action: 'admin_approve', title });
  }
}

async function adminShareBidding(page, title) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.locator('input[placeholder*="Search work orders"]').fill(title);
  await page.waitForTimeout(2000);
  const share = page.getByRole('button', { name: /Share for Bidding|Share/i }).first();
  await share.click();
  await page.waitForTimeout(800);
  const row = page.locator(`text=${SUB_EMAIL}`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Share with/ }).click();
  await page.waitForTimeout(4000);
  report.steps.push({ ok: true, action: 'share_bidding', title });
}

async function subcontractorSubmitQuote(page, title) {
  await page.goto(`${BASE_URL}/subcontractor-portal/bidding`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.locator('input.pl-10, input[placeholder*="Search"]').first().fill(title);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Submit Quote' }).first().click();
  await page.waitForTimeout(600);
  await page.fill('#estimatedDuration', '1 day');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const ds = tomorrow.toISOString().split('T')[0];
  await page.fill('#proposedServiceDate', ds);
  await page.fill('#proposedServiceTime', '10:00');
  const unitPrices = page.locator('input[placeholder="Unit Price *"]');
  const n = await unitPrices.count();
  for (let i = 0; i < n; i++) {
    await unitPrices.nth(i).fill(i === 0 ? '100' : '50');
  }
  await page.locator('button:has-text("Submit Quote")').last().click();
  await page.waitForTimeout(5000);
  report.steps.push({ ok: true, action: 'sub_quote', title });
}

async function adminForwardToClient(page, workOrderId) {
  await page.goto(`${BASE_URL}/admin-portal/quotes?workOrderId=${workOrderId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /Forward to Client/i }).first().click();
  await page.waitForTimeout(500);
  await page.locator('input[type="number"]').first().fill('0');
  await page.getByRole('button', { name: /Send to Client/i }).click();
  await page.waitForTimeout(3000);
  report.steps.push({ ok: true, action: 'forward_quote', workOrderId });
}

async function clientApproveQuote(page, title) {
  await page.goto(`${BASE_URL}/client-portal/quotes`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const card = page.locator('.rounded-xl, [class*="rounded-xl"]').filter({ hasText: title }).first();
  await card.getByRole('button', { name: /Approve Quote/i }).click();
  await page.waitForTimeout(400);
  const toastApprove = page.locator('[data-sonner-toast], [data-sonner-toaster] button, .toast button').filter({ hasText: /^Approve$/ }).first();
  if (await toastApprove.isVisible().catch(() => false)) {
    await toastApprove.click();
  } else {
    await page.getByRole('button', { name: /^Approve$/ }).last().click().catch(() => {});
  }
  await page.waitForTimeout(4000);
  report.steps.push({ ok: true, action: 'client_approve_quote', title });
}

async function subAcceptAndComplete(page, title, imagePath) {
  await page.goto(`${BASE_URL}/subcontractor-portal/assigned`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('input.pl-10, input[placeholder*="Search"]').first().fill(title);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Accept' }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Approve Work Order/i }).click();
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: 'Mark as Complete' }).first().click();
  await page.waitForTimeout(500);
  await page.fill('#completion-details', `E2E completion ${title}`);
  await page.setInputFiles('#completion-images', imagePath);
  await page.waitForTimeout(800);
  await page
    .locator('div.fixed.inset-0')
    .filter({ hasText: 'Complete Work Order' })
    .getByRole('button', { name: /Mark as Complete/i })
    .click();
  await page.waitForTimeout(8000);
  report.steps.push({ ok: true, action: 'sub_complete', title });
}

async function assertAdminWorkOrderStatus(page, workOrderId, expectSubstring) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders/${workOrderId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const body = await page.textContent('body');
  if (expectSubstring && !body?.includes(expectSubstring)) {
    throw new Error(`Expected status text "${expectSubstring}" on WO ${workOrderId}`);
  }
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !CLIENT_EMAIL || !CLIENT_PASSWORD || !SUB_EMAIL || !SUB_PASSWORD) {
    console.error(
      'Missing env: E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD, E2E_SUB_EMAIL, E2E_SUB_PASSWORD'
    );
    process.exit(1);
  }

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const imagePath = await ensureTestImage();

  const browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1' });
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  const client = await ctx.newPage();
  const sub = await ctx.newPage();

  try {
    await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD, 'admin');
    await login(client, CLIENT_EMAIL, CLIENT_PASSWORD, 'client');
    await login(sub, SUB_EMAIL, SUB_PASSWORD, 'sub');

    const runList = SCENARIOS.slice(0, LIMIT);

    for (const sc of runList) {
      const stamp = Date.now();
      const title = `E2E ${sc.id} ${stamp}`;
      const desc = `Automated matrix run ${sc.id} ${stamp}`;

      if (sc.source === 'client') {
        await createClientWorkOrder(client, title, desc, sc.maintenance, imagePath);
      } else {
        await createAdminModalWorkOrder(admin, title, desc, sc.maintenance);
      }

      await adminApproveIfNeeded(admin, title);
      await adminShareBidding(admin, title);
      await subcontractorSubmitQuote(sub, title);

      const woId = await getWorkOrderIdFromAdminList(admin, title);
      if (!woId) throw new Error(`Could not resolve work order id for ${title}`);

      await adminForwardToClient(admin, woId);
      await clientApproveQuote(client, title);
      await subAcceptAndComplete(sub, title, imagePath);

      await assertAdminWorkOrderStatus(admin, woId, 'Pending Invoice').catch(async () => {
        await assertAdminWorkOrderStatus(admin, woId, 'Completed');
      });

      report.workOrders.push({
        scenario: sc.id,
        title,
        workOrderId: woId,
        source: sc.source,
        maintenance: sc.maintenance,
      });
    }
  } catch (e) {
    report.fatalError = String(e?.message || e);
    console.error(e);
  } finally {
    report.finishedAt = new Date().toISOString();
    const outPath = path.join(ARTIFACTS, 'work-order-full-matrix-report.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    await browser.close();
  }

  const bad = report.consoleErrors.length + report.pageErrors.length + (report.fatalError ? 1 : 0);
  console.log(`Report: ${path.join('artifacts', 'work-order-full-matrix-report.json')}`);
  console.log('Work orders:', JSON.stringify(report.workOrders, null, 2));
  if (bad > 0) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(2);
  }
}

main();
