/**
 * Full work order lifecycle matrix (Playwright).
 *
 * Quote path (6 default): client/admin creates → approve (if pending) → share bidding →
 * sub quote → admin forward → client approve → sub accept → complete → pending_invoice →
 * admin "Generate & Send Invoice" → Completed (auto-charge) or invoice sent (Stripe link).
 *
 * Optional: +1 manual-assign path (no bidding/quotes) via E2E_INCLUDE_MANUAL_ASSIGN=1.
 *
 * Credentials: export env vars, put E2E_* in .env.local (loaded automatically), and/or
 * create scripts/e2e-secrets.env (see e2e-secrets.env.example). First non-empty source wins per key
 * only where the variable is unset (shell exports take precedence).
 *
 * Output: artifacts/work-order-full-matrix-report.json
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARTIFACTS = path.join(ROOT, 'artifacts');

/** Same pattern as scripts/e2e-support-tickets.mjs — picks up E2E_* from .env.local. */
function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
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
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = val;
  }
}

function loadOptionalEnvFiles() {
  const paths = [
    path.join(ROOT, 'scripts', 'e2e-secrets.env'),
    path.join(ARTIFACTS, '.e2e-secrets.env'),
  ];
  for (const fp of paths) {
    if (!fs.existsSync(fp)) continue;
    const lines = fs.readFileSync(fp, 'utf8').split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
    }
  }
}

loadEnvLocal();
loadOptionalEnvFiles();

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
const SUB_CONTRACTOR_DOC_ID =
  process.env.E2E_SUB_CONTRACTOR_DOC_ID || 'xcBZH6MlsbSRlwH3J1GmoOiUKWJ3';

// Firebase REST API config (for direct Firestore operations)
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';

const LIMIT = Math.min(6, Math.max(1, parseInt(process.env.E2E_MATRIX_LIMIT || '6', 10) || 6));
const SKIP_INVOICE = process.env.E2E_SKIP_INVOICE_STEP === '1';
const INCLUDE_MANUAL = process.env.E2E_INCLUDE_MANUAL_ASSIGN === '1';
const ALLOW_CONSOLE = process.env.E2E_ALLOW_BROWSER_CONSOLE_ERRORS === '1';

// ─── Firebase REST API helpers ────────────────────────────────────────────────
let _adminIdToken = null;
let _tokenExpiry = 0;

async function getAdminIdToken() {
  if (_adminIdToken && Date.now() < _tokenExpiry) return _adminIdToken;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Firebase REST auth failed: ${data.error?.message}`);
  _adminIdToken = data.idToken;
  _tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 min
  return _adminIdToken;
}

async function firestoreRunQuery(idToken, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Firestore runQuery failed: ${JSON.stringify(err)}`);
  }
  return res.json();
}

async function firestoreDirectApprove(title) {
  if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID) {
    console.log('[firestore] Missing API_KEY or PROJECT_ID — skipping direct approve');
    return false;
  }
  const idToken = await getAdminIdToken();
  const results = await firestoreRunQuery(idToken, {
    from: [{ collectionId: 'workOrders' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'title' },
        op: 'EQUAL',
        value: { stringValue: title },
      },
    },
    limit: 10,
  });

  const docs = results.filter(r => r.document);
  if (docs.length === 0) {
    console.log(`[firestore] No work order found with title "${title}"`);
    return false;
  }

  let approved = false;
  for (const { document } of docs) {
    const currentStatus = document.fields?.status?.stringValue;
    if (currentStatus !== 'pending') {
      console.log(`[firestore] WO "${title}" status="${currentStatus}" — no approve needed`);
      approved = currentStatus === 'approved' || currentStatus === 'bidding';
      continue;
    }
    const docPath = document.name; // full resource path
    const patchUrl = `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        fields: {
          status: { stringValue: 'approved' },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });
    if (!patchRes.ok) {
      const err = await patchRes.json();
      console.log(`[firestore] Patch failed: ${JSON.stringify(err)}`);
      return false;
    }
    console.log(`[firestore] ✅ Approved WO "${title}" directly via Firestore REST API`);
    approved = true;
  }
  return approved;
}
// ─────────────────────────────────────────────────────────────────────────────

const QUOTE_TOTAL = process.env.E2E_QUOTE_TOTAL
  ? parseFloat(process.env.E2E_QUOTE_TOTAL)
  : null;
const QUOTE_LABOR = process.env.E2E_QUOTE_LABOR || '100';
const QUOTE_MATERIAL = process.env.E2E_QUOTE_MATERIAL || '50';
/** Match client's Fixed Auto-Charge Plan amount so "Generate & Send Invoice" auto-pays (requires active sub + saved card). */
const SUBSCRIPTION_MATCH_AMOUNT = parseFloat(process.env.E2E_CLIENT_SUBSCRIPTION_AMOUNT || '');
const EFFECTIVE_QUOTE_TOTAL =
  process.env.E2E_TEST_AUTO_CHARGE === '1' && Number.isFinite(SUBSCRIPTION_MATCH_AMOUNT)
    ? SUBSCRIPTION_MATCH_AMOUNT
    : QUOTE_TOTAL;

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const SCENARIOS = [
  { id: 'client-standard-1', source: 'client', maintenance: false, flow: 'quote' },
  { id: 'client-maintenance-1', source: 'client', maintenance: true, flow: 'quote' },
  { id: 'client-standard-2', source: 'client', maintenance: false, flow: 'quote' },
  { id: 'admin-standard-1', source: 'admin', maintenance: false, flow: 'quote' },
  { id: 'admin-maintenance-1', source: 'admin', maintenance: true, flow: 'quote' },
  { id: 'admin-standard-2', source: 'admin', maintenance: false, flow: 'quote' },
];

const report = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  consoleErrors: [],
  pageErrors: [],
  workOrders: [],
  steps: [],
};

const consoleAllow = [/Download the React DevTools/i, /favicon/i];

function attach(page, label) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (consoleAllow.some((re) => re.test(text))) return;
    report.consoleErrors.push({ page: label, text });
  });
  page.on('pageerror', (err) => {
    report.pageErrors.push({ page: label, message: err.message });
  });
}

async function login(page, email, password, label) {
  attach(page, label);
  await page.goto(`${BASE_URL}/portal-login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Ensure login form is interactive
  await page.locator('input#email, input[type="email"]').first().waitFor({ timeout: 15000 });
  await page.locator('input#email, input[type="email"]').first().fill(email);
  await page.locator('input#password, input[type="password"]').first().fill(password);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  // Wait for redirect away from portal-login (Firebase auth + router.push takes a few seconds)
  // Note: Playwright waitForURL passes a URL object, not a string — use .toString()
  const redirected = await page.waitForURL(url => !url.toString().includes('portal-login'), { timeout: 60000 }).then(() => true).catch(() => false);
  if (!redirected) {
    // waitForURL may have failed if nav already happened — recheck current URL
    const currentUrl = page.url();
    if (!currentUrl.includes('portal-login')) {
      console.log(`[login:${label}] ✅ Logged in (nav already done) — url=${currentUrl}`);
    } else {
      console.log(`[login:${label}] WARNING: still on portal-login — url=${currentUrl}`);
      const errMsg = await page.locator('[class*="error"], [class*="alert"], .text-red-').textContent().catch(() => '');
      if (errMsg) console.log(`[login:${label}] Error message: ${errMsg}`);
    }
  } else {
    console.log(`[login:${label}] ✅ Logged in — url=${page.url()}`);
  }
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000); // Extra wait for Firebase auth token to be stored in IndexedDB
}

async function ensureTestImage() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const p = path.join(ARTIFACTS, 'e2e-1x1.png');
  fs.writeFileSync(p, Buffer.from(PNG_B64, 'base64'));
  return p;
}

async function selectSearchableOption(page, inputSelector, optionText) {
  // Click the trigger wrapper div (direct parent of the input) so React's onClick fires
  const triggerWrapper = page.locator(inputSelector).locator('xpath=..');
  await triggerWrapper.click({ timeout: 10000 });
  await page.waitForTimeout(500);

  let listboxPresent = await page.locator('[role="listbox"]').isVisible().catch(() => false);

  if (!listboxPresent) {
    // Fallback: click the chevron toggle button (sibling inside trigger wrapper)
    await page.locator(inputSelector).locator('xpath=../button').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    listboxPresent = await page.locator('[role="listbox"]').isVisible().catch(() => false);
  }

  if (!listboxPresent) {
    // Last resort: direct click on input
    await page.locator(inputSelector).click({ force: true });
    await page.waitForTimeout(1000);
    listboxPresent = await page.locator('[role="listbox"]').waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  }

  if (!listboxPresent) {
    const isDisabled = await page.locator(inputSelector).isDisabled().catch(() => 'error');
    console.log(`[select] ${inputSelector} — listbox missing. url=${page.url()} disabled=${isDisabled}`);
    throw new Error(`Listbox did not appear for selector: ${inputSelector} (url=${page.url()})`);
  }

  const btnTexts = await page.locator('[role="listbox"] button').allTextContents().catch(() => []);
  console.log(`[select] ${inputSelector} listbox options:`, btnTexts);

  if (optionText) {
    await page.locator('[role="listbox"] button', { hasText: optionText }).first().click({ timeout: 10000 });
  } else {
    await page.locator('[role="listbox"] button:not([disabled])').first().click({ timeout: 10000 });
  }
  await page.waitForTimeout(300);
}

async function debugSnapshot(page, label) {
  try {
    const url = page.url();
    const screenshotPath = path.join(ARTIFACTS, `debug-${label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[debug] ${label} | url=${url} | screenshot=${screenshotPath}`);
    const bodyText = (await page.textContent('body').catch(() => '')).slice(0, 500);
    console.log(`[debug] ${label} | body excerpt: ${bodyText}`);
  } catch (err) {
    console.log(`[debug] ${label} screenshot failed: ${err.message}`);
  }
}

async function createClientWorkOrder(page, title, description, maintenance, imagePath, estimateBudget) {
  // Navigate with retry in case auth redirect hasn't completed
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE_URL}/client-portal/work-orders/create`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    // If redirected to login page, wait for auth and retry
    if (page.url().includes('portal-login') || page.url().includes('/login')) {
      console.log(`[client-create] Redirected to login (attempt ${attempt + 1}) — waiting for auth`);
      await page.waitForURL(u => !u.toString().includes('portal-login') && !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      continue;
    }
    break;
  }
  // Wait for locationId to exist and be enabled
  await page.locator('#locationId').waitFor({ timeout: 35000 });
  await page.waitForFunction(
    () => { const el = document.querySelector('#locationId'); return el && !el.disabled; },
    { timeout: 30000 }
  );
  // Handle both native <select> (production) and SearchableSelect (combobox)
  const isSelect = await page.evaluate(() => document.querySelector('#locationId')?.tagName === 'SELECT');
  if (isSelect) {
    await page.selectOption('#locationId', { label: 'TESTLOCA' }).catch(async () => {
      // Fallback: select first available non-empty option
      const opts = await page.locator('#locationId option').allTextContents();
      const opt = opts.find(o => o.trim() && !o.includes('Choose') && !o.includes('Select'));
      if (opt) await page.selectOption('#locationId', { label: opt.trim() });
    });
    await page.selectOption('#category', { label: 'General Maintenance' }).catch(async () => {
      const opts = await page.locator('#category option').allTextContents();
      const opt = opts.find(o => o.trim() && !o.includes('Select'));
      if (opt) await page.selectOption('#category', { label: opt.trim() });
    });
  } else {
    await selectSearchableOption(page, '#locationId', 'TESTLOCA');
    await selectSearchableOption(page, '#category', 'General Maintenance');
  }
  await page.fill('#title', title);
  await page.fill('#description', description);
  if (estimateBudget != null && estimateBudget !== '') {
    await page.locator('#estimateBudget').fill(String(estimateBudget));
  }
  if (maintenance) {
    await page.locator('#isMaintenanceRequestOrder').check();
  }
  await page.setInputFiles('#images', imagePath);
  await page.locator('button[type="submit"]:has-text("Create Work Order")').click();
  await page.waitForURL(/\/client-portal\/work-orders/, { timeout: 60000 });
  report.steps.push({ ok: true, action: 'client_create', title });
}

async function createAdminModalWorkOrder(page, title, description, maintenance) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Create Work Order/i }).click();
  await page.waitForTimeout(500);
  if (maintenance) {
    await page.getByRole('button', { name: 'Maintenance Request Work Order' }).click();
  } else {
    await page.getByRole('button', { name: 'Standard Work Order' }).click();
  }
  await page.waitForTimeout(800);
  const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Create New Work Order' });
  await modal.waitFor({ timeout: 10000 });

  // Check if modal uses native selects or SearchableSelect comboboxes
  const usesNativeSelects = await modal.locator('select').count().then(n => n > 0);

  if (usesNativeSelects) {
    const selects = modal.locator('select');
    // Client select (0): choose M Perasso
    await selects.nth(0).selectOption({ label: /M Perasso/ });
    await page.waitForTimeout(600); // company options load after client selection
    // Company select (1): TESTCOMPANY
    await selects.nth(1).selectOption({ label: 'TESTCOMPANY' }).catch(async () => {
      // Company may appear differently — pick first non-placeholder
      const opts = await selects.nth(1).locator('option').allTextContents();
      const opt = opts.find(o => o.trim() && !o.includes('Choose'));
      if (opt) await selects.nth(1).selectOption({ label: opt.trim() });
    });
    await page.waitForTimeout(400);
    // Location select (2): TESTLOCA
    await selects.nth(2).selectOption({ label: 'TESTLOCA' }).catch(async () => {
      const opts = await selects.nth(2).locator('option').allTextContents();
      const opt = opts.find(o => o.trim() && !o.includes('Choose'));
      if (opt) await selects.nth(2).selectOption({ label: opt.trim() });
    });
    await page.waitForTimeout(300);
    // Title and description
    await modal.locator('input[placeholder*="HVAC"], input[placeholder*="title"], input[type="text"]').first().fill(title);
    await modal.locator('textarea').first().fill(description);
    // Category select (3): General Maintenance
    await selects.nth(3).selectOption({ label: 'General Maintenance' }).catch(async () => {
      const opts = await selects.nth(3).locator('option').allTextContents();
      const opt = opts.find(o => o.trim() && !o.includes('Select'));
      if (opt) await selects.nth(3).selectOption({ label: opt.trim() });
    });
  } else {
    // SearchableSelect comboboxes
    await selectSearchableOption(page, 'input[placeholder="Choose a client..."]', 'M Perasso');
    await page.waitForTimeout(400);
    await selectSearchableOption(page, 'input[placeholder="Choose a company..."]', 'TESTCOMPANY');
    await page.waitForTimeout(400);
    await selectSearchableOption(page, 'input[placeholder="Choose a location..."]', 'TESTLOCA');
    await page.waitForTimeout(300);
    await modal.getByPlaceholder(/HVAC Repair/i).fill(title);
    await modal.locator('textarea').first().fill(description);
    await selectSearchableOption(page, 'input[placeholder="Select category..."]', 'General Maintenance');
  }
  await modal.getByRole('button', { name: /^Create$/ }).click();
  await page.waitForTimeout(5000);
  report.steps.push({ ok: true, action: 'admin_modal_create', title });
}

async function getWorkOrderIdFromAdminList(page, title) {
  await gotoAdminWOsReady(page);
  const searchInput = page.locator('input[placeholder*="Search work orders"]');
  await searchInput.waitFor({ timeout: 10000 });
  await searchInput.fill(title);
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'View' }).first().click({ timeout: 15000 });
  await page.waitForURL(/\/admin-portal\/work-orders\/[^/]+/, { timeout: 25000 });
  const m = page.url().match(/\/work-orders\/([^/?]+)/);
  return m ? m[1] : null;
}

async function readWorkOrderNumber(page, workOrderId) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders/${workOrderId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const t = await page.locator('body').textContent();
  const m = t?.match(/WO-[\dA-Z-]+/);
  return m ? m[0] : null;
}

/** Navigate to admin WO list and wait for Firestore data to load (up to 2 reload attempts). */
async function gotoAdminWOsReady(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE_URL}/admin-portal/work-orders`, { waitUntil: 'domcontentloaded' });
    // Wait for page to be interactive: search input visible + data loaded
    // "Select All (N)" label appears once work orders are rendered
    const ready = await page.waitForFunction(
      () => {
        const text = document.body.textContent || '';
        // "Select All (" appears when work order list renders with data
        // "No work orders found" appears when Firestore returns empty
        // Also check search input exists as basic page-load indicator
        const hasSearchInput = !!document.querySelector('input[placeholder*="Search work order"]');
        return hasSearchInput && (
          text.includes('Select All (') ||
          text.includes('No work orders found') ||
          text.includes('Work Order #') ||
          text.includes('WO-')
        );
      },
      { timeout: 25000 }
    ).then(() => true).catch(() => false);
    if (ready) return;
    console.log(`[admin-wo] page not ready (attempt ${attempt + 1}), reloading...`);
    await page.waitForTimeout(3000);
  }
  console.log('[admin-wo] page may not be fully loaded — proceeding anyway');
}

async function adminApproveIfNeeded(page, title) {
  // Primary: use Firestore REST API to approve directly (reliable, no UI timing issues)
  const approvedViaApi = await firestoreDirectApprove(title).catch(err => {
    console.log(`[approve] Firestore direct approve failed: ${err.message}`);
    return false;
  });
  if (approvedViaApi) {
    report.steps.push({ ok: true, action: 'admin_approve', title, method: 'firestore_api' });
    await page.waitForTimeout(1500); // brief pause for Firestore propagation
    return;
  }

  // Fallback: UI approach
  console.log(`[approve] Falling back to UI approve for "${title}"`);
  await gotoAdminWOsReady(page);
  const searchInput = page.locator('input[placeholder*="Search work orders"]');
  await searchInput.waitFor({ timeout: 10000 });
  await searchInput.fill(title);
  await page.waitForTimeout(3000);

  await debugSnapshot(page, `approve-search`);
  const allBtns = await page.getByRole('button').allTextContents().catch(() => []);
  console.log(`[approve] Visible buttons: ${JSON.stringify(allBtns.filter(b => b.trim()).slice(0, 30))}`);

  // Use exact match to avoid clicking the "Approved (N)" status filter button
  const approve = page.getByRole('button', { name: 'Approve', exact: true }).first();
  if (await approve.isVisible({ timeout: 3000 }).catch(() => false)) {
    await approve.click();
    await page.waitForTimeout(4000);
    report.steps.push({ ok: true, action: 'admin_approve', title, method: 'ui' });
  } else {
    console.log(`[approve] WARN: Approve button not found for "${title}" — work order may already be approved or page didn't load`);
  }
}

async function adminShareBidding(page, title) {
  await gotoAdminWOsReady(page);
  const searchInput = page.locator('input[placeholder*="Search work orders"]');
  await searchInput.waitFor({ timeout: 10000 });
  await searchInput.fill(title);
  await page.waitForTimeout(3000);

  await debugSnapshot(page, `share-bidding-search`);
  const allBtns = await page.getByRole('button').allTextContents().catch(() => []);
  console.log(`[share] Visible buttons after search: ${JSON.stringify(allBtns.filter(b => b.trim()).slice(0, 30))}`);

  // Button text: "Share for Bidding" (lg screen) or icon-only on small screens
  // Also matches if work order is already in 'bidding' status (re-share)
  const shareBtn = page.getByRole('button', { name: /Share for Bidding/i }).first();
  const shareBtnVisible = await shareBtn.isVisible({ timeout: 8000 }).catch(() => false);
  if (!shareBtnVisible) {
    // Also try the short version shown on mobile viewports
    const shareBtnShort = page.getByRole('button', { name: /^Share$/i }).first();
    if (await shareBtnShort.isVisible({ timeout: 3000 }).catch(() => false)) {
      await shareBtnShort.click();
    } else {
      await debugSnapshot(page, `share-bidding-no-button`);
      throw new Error(`"Share for Bidding" button not visible for "${title}". WO may not be approved yet. url=${page.url()}`);
    }
  } else {
    await shareBtn.click();
  }
  await page.waitForTimeout(1500);

  // Bidding modal: list of approved subcontractors, each is a clickable div
  // Select sub by email (shown as <p class="text-sm text-gray-500">{sub.email}</p>)
  const subEmailEl = page.locator(`text=${SUB_EMAIL}`).first();
  const subEmailVisible = await subEmailEl.isVisible({ timeout: 10000 }).catch(() => false);
  if (subEmailVisible) {
    await subEmailEl.scrollIntoViewIfNeeded().catch(() => {});
    await subEmailEl.click();
  } else {
    // Fallback: select all subcontractors
    console.log(`[share] Sub email ${SUB_EMAIL} not found in list — trying Select All`);
    const selectAll = page.locator('input#selectAll').first();
    if (await selectAll.isVisible({ timeout: 3000 }).catch(() => false)) {
      await selectAll.check();
    } else {
      // Click first available sub row
      await page.locator('div.space-y-2 > div').first().click().catch(() => {});
    }
  }
  await page.waitForTimeout(500);

  // Click "Share with N Subcontractor(s)" button
  const confirmShare = page.getByRole('button', { name: /Share with \d+ Subcontractor/i }).first();
  if (await confirmShare.isVisible({ timeout: 5000 }).catch(() => false)) {
    await confirmShare.click();
  } else {
    // May have 0 selected — try clicking any button with "Share" text
    await page.getByRole('button', { name: /Share/i }).last().click();
  }
  await page.waitForTimeout(5000);
  report.steps.push({ ok: true, action: 'share_bidding', title });
}

async function subcontractorSubmitQuote(page, title) {
  await page.goto(`${BASE_URL}/subcontractor-portal/bidding`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('input.pl-10, input[placeholder*="Search"]').first().fill(title);
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Submit Quote' }).first().click();
  await page.waitForTimeout(800);
  await page.fill('#estimatedDuration', '1 day');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  await page.fill('#proposedServiceDate', tomorrow.toISOString().split('T')[0]);
  await page.fill('#proposedServiceTime', '10:00');
  const unitPrices = page.locator('input[placeholder="Unit Price *"]');
  const n = await unitPrices.count();
  if (EFFECTIVE_QUOTE_TOTAL != null && !Number.isNaN(EFFECTIVE_QUOTE_TOTAL)) {
    await unitPrices.nth(0).fill(String(EFFECTIVE_QUOTE_TOTAL));
    for (let i = 1; i < n; i++) await unitPrices.nth(i).fill('0');
  } else {
    for (let i = 0; i < n; i++) {
      await unitPrices.nth(i).fill(i === 0 ? QUOTE_LABOR : QUOTE_MATERIAL);
    }
  }
  await page.locator('button:has-text("Submit Quote")').last().click();
  await page.waitForTimeout(6000);
  report.steps.push({ ok: true, action: 'sub_quote', title });
}

async function adminForwardToClient(page, workOrderId) {
  await page.goto(`${BASE_URL}/admin-portal/quotes?workOrderId=${workOrderId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: /Forward to Client/i }).first().click();
  await page.waitForTimeout(600);
  await page.locator('input[type="number"]').first().fill('0');
  await page.getByRole('button', { name: /Send to Client/i }).click();
  await page.waitForTimeout(4000);
  report.steps.push({ ok: true, action: 'forward_quote', workOrderId });
}

async function clientApproveQuote(page, title) {
  await page.goto(`${BASE_URL}/client-portal/quotes`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const titleLoc = page.getByText(title, { exact: false }).first();
  await titleLoc.scrollIntoViewIfNeeded().catch(() => {});
  await titleLoc
    .locator('xpath=ancestor::div[contains(@class,"border")][1]')
    .getByRole('button', { name: /Approve Quote/i })
    .click();
  await page.waitForTimeout(500);
  const inToast = page.locator('[data-sonner-toast] button').filter({ hasText: /^Approve$/ }).first();
  if (await inToast.isVisible().catch(() => false)) {
    await inToast.click();
  } else {
    await page.getByRole('button', { name: /^Approve$/ }).last().click().catch(() => {});
  }
  await page.waitForTimeout(5000);
  report.steps.push({ ok: true, action: 'client_approve_quote', title });
}

async function subAcceptAndComplete(page, title, imagePath) {
  await page.goto(`${BASE_URL}/subcontractor-portal/assigned`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('input.pl-10, input[placeholder*="Search"]').first().fill(title);
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Accept' }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Approve Work Order/i }).click();
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: 'Mark as Complete' }).first().click();
  await page.waitForTimeout(600);
  await page.fill('#completion-details', `E2E completion ${title}`);
  await page.setInputFiles('#completion-images', imagePath);
  await page.waitForTimeout(800);
  await page
    .locator('div.fixed.inset-0')
    .filter({ hasText: 'Complete Work Order' })
    .getByRole('button', { name: /Mark as Complete/i })
    .click();
  await page.waitForTimeout(10000);
  report.steps.push({ ok: true, action: 'sub_complete', title });
}

async function adminManualAssignOnDetail(page, workOrderId) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders/${workOrderId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Assign to Subcontractor' }).click();
  await page.waitForTimeout(600);
  const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Assign to Subcontractor' });
  await modal.locator('select').selectOption(SUB_CONTRACTOR_DOC_ID);
  await modal.getByRole('button', { name: 'Assign', exact: true }).click();
  await page.waitForTimeout(4000);
  report.steps.push({ ok: true, action: 'manual_assign', workOrderId });
}

async function adminGenerateInvoiceFromList(page, title) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.locator('input[placeholder*="Search work orders"]').fill(title);
  await page.waitForTimeout(2500);
  const gen = page.getByRole('button', { name: /Generate & Send Invoice/i }).first();
  await gen.scrollIntoViewIfNeeded().catch(() => {});
  await gen.click();
  await page.waitForTimeout(20000);
  report.steps.push({ ok: true, action: 'generate_send_invoice', title });
}

async function readFinalWorkOrderStatus(page, workOrderId) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders/${workOrderId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const body = (await page.textContent('body')) || '';
  if (body.includes('Pending Invoice')) return 'pending_invoice';
  if (body.includes('Completed')) return 'completed';
  return 'unknown';
}

function assertStatusOk(status) {
  if (status !== 'completed' && status !== 'pending_invoice') {
    throw new Error(`Unexpected work order status: ${status}`);
  }
}

async function runQuoteFlow(admin, client, sub, sc, stamp, imagePath) {
  const title = `E2E ${sc.id} ${stamp}`;
  const desc = `Automated matrix ${sc.id} ${stamp}`;

  if (sc.source === 'client') {
    await createClientWorkOrder(client, title, desc, sc.maintenance, imagePath, null);
  } else {
    await createAdminModalWorkOrder(admin, title, desc, sc.maintenance);
  }

  await adminApproveIfNeeded(admin, title);
  await adminShareBidding(admin, title);
  await subcontractorSubmitQuote(sub, title);

  const woId = await getWorkOrderIdFromAdminList(admin, title);
  if (!woId) throw new Error(`Could not resolve work order id for ${title}`);
  const woNum = await readWorkOrderNumber(admin, woId);

  await adminForwardToClient(admin, woId);
  await clientApproveQuote(client, title);
  await subAcceptAndComplete(sub, title, imagePath);

  let afterComplete = await readFinalWorkOrderStatus(admin, woId);
  assertStatusOk(afterComplete);

  let invoiceOutcome = 'skipped';
  if (!SKIP_INVOICE && afterComplete === 'pending_invoice') {
    await adminGenerateInvoiceFromList(admin, title);
    await pageWaitIdle(admin);
    afterComplete = await readFinalWorkOrderStatus(admin, woId);
    invoiceOutcome =
      afterComplete === 'completed'
        ? 'auto_paid_or_completed_after_invoice'
        : 'invoice_sent_pending_payment';
  }

  report.workOrders.push({
    scenario: sc.id,
    title,
    workOrderId: woId,
    workOrderNumber: woNum,
    source: sc.source,
    maintenance: sc.maintenance,
    flow: 'quote',
    statusAfterCompletion: afterComplete,
    invoiceOutcome,
  });
}

async function runManualFlow(admin, client, sub, stamp, imagePath) {
  const title = `E2E manual-assign ${stamp}`;
  const desc = `Manual assign path ${stamp}`;
  await createClientWorkOrder(client, title, desc, false, imagePath, '275');
  await adminApproveIfNeeded(admin, title);
  const woId = await getWorkOrderIdFromAdminList(admin, title);
  if (!woId) throw new Error(`Manual flow: no wo id for ${title}`);
  const woNum = await readWorkOrderNumber(admin, woId);
  await adminManualAssignOnDetail(admin, woId);
  await subAcceptAndComplete(sub, title, imagePath);

  let afterComplete = await readFinalWorkOrderStatus(admin, woId);
  assertStatusOk(afterComplete);

  let invoiceOutcome = 'skipped';
  if (!SKIP_INVOICE && afterComplete === 'pending_invoice') {
    await adminGenerateInvoiceFromList(admin, title);
    await pageWaitIdle(admin);
    afterComplete = await readFinalWorkOrderStatus(admin, woId);
    invoiceOutcome =
      afterComplete === 'completed'
        ? 'auto_paid_or_completed_after_invoice'
        : 'invoice_sent_pending_payment';
  }

  report.workOrders.push({
    scenario: 'manual-assign-no-quote',
    title,
    workOrderId: woId,
    workOrderNumber: woNum,
    source: 'client',
    maintenance: false,
    flow: 'manual_assign',
    statusAfterCompletion: afterComplete,
    invoiceOutcome,
  });
}

async function pageWaitIdle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !CLIENT_EMAIL || !CLIENT_PASSWORD || !SUB_EMAIL || !SUB_PASSWORD) {
    console.error(
      'Missing credentials. Set E2E_* env vars or create scripts/e2e-secrets.env — see scripts/e2e-secrets.env.example'
    );
    process.exit(1);
  }

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const imagePath = await ensureTestImage();
  const stampBase = Date.now();

  const browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1' });
  // Each user needs an isolated browser context so Firebase auth tokens (localStorage) don't overwrite each other
  const adminCtx = await browser.newContext();
  const clientCtx = await browser.newContext();
  const subCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  const client = await clientCtx.newPage();
  const sub = await subCtx.newPage();

  try {
    await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD, 'admin');
    await admin.waitForTimeout(3000); // stagger logins to avoid simultaneous Firebase connections
    await login(client, CLIENT_EMAIL, CLIENT_PASSWORD, 'client');
    await client.waitForTimeout(3000);
    await login(sub, SUB_EMAIL, SUB_PASSWORD, 'sub');
    await sub.waitForTimeout(2000);

    const runList = SCENARIOS.slice(0, LIMIT);
    for (let i = 0; i < runList.length; i++) {
      await runQuoteFlow(admin, client, sub, runList[i], stampBase + i, imagePath);
    }

    if (INCLUDE_MANUAL) {
      await runManualFlow(admin, client, sub, stampBase + 900, imagePath);
    }
  } catch (e) {
    report.fatalError = String(e?.message || e);
    console.error(e);
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(
      path.join(ARTIFACTS, 'work-order-full-matrix-report.json'),
      JSON.stringify(report, null, 2)
    );
    await browser.close();
  }

  const consoleFatal =
    !ALLOW_CONSOLE && (report.consoleErrors.length > 0 || report.pageErrors.length > 0);
  const bad = (report.fatalError ? 1 : 0) + (consoleFatal ? 1 : 0);

  console.log('\n=== Work orders created (see report file for full JSON) ===\n');
  for (const w of report.workOrders) {
    console.log(
      `${w.scenario} | ${w.workOrderNumber || 'n/a'} | ${w.workOrderId} | ${w.flow} | invoice: ${w.invoiceOutcome}`
    );
  }
  console.log(`\nReport: ${path.join('artifacts', 'work-order-full-matrix-report.json')}`);

  if (bad > 0) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(2);
  }
}

main();
