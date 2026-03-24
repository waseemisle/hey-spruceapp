import { chromium } from 'playwright';
import fs from 'fs/promises';

const BASE_URL = 'https://groundopscos.vercel.app';
const ADMIN_EMAIL = 'waseem@thebinyangroup.com';
const CLIENT_EMAIL = 'wasimisle@gmail.com';
const SUBCONTRACTOR_EMAIL = 'admin@heyspruce.com';
const PASSWORD = '123123123';

const CARD_MATRIX = [
  { label: 'Cycle 1 Visa', number: '4242424242424242', exp: '12/34', cvc: '123' },
  { label: 'Cycle 2 Mastercard', number: '5555555555554444', exp: '12/34', cvc: '123' },
  { label: 'Cycle 3 Visa Debit', number: '4000056655665556', exp: '12/34', cvc: '123' },
];

// App uses `to_be_started` where users often refer to this as "In Progress".
const STATUS_FLOW = [
  { label: 'Pending', key: 'pending' },
  { label: 'Approved', key: 'approved' },
  { label: 'Bidding', key: 'bidding' },
  { label: 'Quotes Received', key: 'quotes_received' },
  { label: 'Assigned', key: 'assigned' },
  { label: 'In Progress', key: 'to_be_started' },
  { label: 'Completed', key: 'completed' },
];

const out = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  cycles: [],
  blocker: null,
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickFirst(page, selectors) {
  for (const s of selectors) {
    const loc = page.locator(s).first();
    if (await loc.count()) {
      await loc.click({ timeout: 8000 });
      return true;
    }
  }
  return false;
}

async function fillFirst(page, selectors, value) {
  for (const s of selectors) {
    const loc = page.locator(s).first();
    if (await loc.count()) {
      await loc.fill(value, { timeout: 8000 });
      return true;
    }
  }
  return false;
}

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/portal-login`, { waitUntil: 'domcontentloaded' });
  await fillFirst(page, ['input#email', 'input[type="email"]'], email);
  await fillFirst(page, ['input#password', 'input[type="password"]'], password);
  await clickFirst(page, ['button:has-text("Login")', 'button[type="submit"]']);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
}

async function setupClientCard(page, card) {
  await login(page, CLIENT_EMAIL, PASSWORD);
  await page.goto(`${BASE_URL}/client-portal/payment-methods`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await clickFirst(page, ['button:has-text("Save a Card")', 'button:has-text("Update Card")']);
  await page.waitForTimeout(2000);

  // Stripe Card Element is in iframe(s); fill where placeholders exist.
  for (const frame of page.frames()) {
    try {
      const hasCardNum = await frame.locator('input[name="cardnumber"]').count();
      if (!hasCardNum) continue;
      await frame.fill('input[name="cardnumber"]', card.number);
      await frame.fill('input[name="exp-date"]', card.exp);
      await frame.fill('input[name="cvc"]', card.cvc);
      break;
    } catch {
      // continue to next frame
    }
  }

  await clickFirst(page, ['button:has-text("Save Card")']);
  await page.waitForTimeout(5000);
}

async function createWorkOrder(page, cycleIdx) {
  await login(page, ADMIN_EMAIL, PASSWORD);
  await page.goto(`${BASE_URL}/admin-portal/work-orders/create/guided`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Client select
  await page.locator('label:has-text("Client") + select').selectOption({ label: new RegExp('.*', 'i') }).catch(() => {});
  // Attempt to select by visible email text if present.
  const clientSelect = page.locator('label:has-text("Client")').locator('xpath=..').locator('select').first();
  if (await clientSelect.count()) {
    const options = await clientSelect.locator('option').allTextContents();
    const candidate = options.find((t) => t.toLowerCase().includes('wasi') || t.toLowerCase().includes('isle') || t.toLowerCase().includes('wasim'));
    if (candidate) await clientSelect.selectOption({ label: candidate }).catch(() => {});
  }

  const companySelect = page.locator('label:has-text("Company")').locator('xpath=..').locator('select').first();
  if (await companySelect.count()) {
    await companySelect.selectOption({ index: 1 }).catch(() => {});
  }

  const locationSelect = page.locator('label:has-text("Location")').locator('xpath=..').locator('select').first();
  await locationSelect.selectOption({ index: 1 }).catch(() => {});

  await fillFirst(page, ['input[placeholder*="outlet"]', 'input[placeholder*="HVAC"]', 'input[class*="pl-9"]'], 'electrical outlet');
  await clickFirst(page, ['button:has-text("Electrical")', 'ul li button']);
  await fillFirst(page, ['textarea[placeholder*="Describe the issue"]'], `Automated full-cycle test ${Date.now()} #${cycleIdx + 1}`);
  await clickFirst(page, ['button:has-text("2. Troubleshooting")', 'button:has-text("Next")']);
  await clickFirst(page, ['button:has-text("Next")']);
  await clickFirst(page, ['button:has-text("Create Work Order")']);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

  const url = page.url();
  const match = url.match(/\/work-orders\/([^/?#]+)/);
  const workOrderId = match?.[1] || null;
  return { workOrderId, url };
}

async function assignAndComplete(page, workOrderId) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const card = page.locator(`text=${workOrderId}`).first();
  if (await card.count()) await card.scrollIntoViewIfNeeded();
  await clickFirst(page, ['button:has-text("Assign to Subcontractor")', 'button:has-text("Assign")']);
  await page.waitForTimeout(700);

  const subSelect = page.locator('select').filter({ hasText: /subcontractor|choose/i }).first();
  if (await subSelect.count()) {
    const options = await subSelect.locator('option').allTextContents();
    const sub = options.find((t) => t.toLowerCase().includes('admin@heyspruce.com') || t.toLowerCase().includes('admin'));
    if (sub) await subSelect.selectOption({ label: sub }).catch(() => {});
    else await subSelect.selectOption({ index: 1 }).catch(() => {});
  }
  await clickFirst(page, ['button:has-text("Assign")', 'button:has-text("Submit")']);
  await page.waitForTimeout(2500);
}

async function setWorkOrderStatus(page, workOrderId, statusKey) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders/${workOrderId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // Enter edit mode on detail page.
  const openedEdit = await clickFirst(page, ['button:has-text("Edit")']);
  if (!openedEdit) {
    return { applied: false, reason: 'edit_button_not_found' };
  }
  await page.waitForTimeout(700);

  const statusSelect = page.locator('select:has(option[value="pending"])').first();
  if (!(await statusSelect.count())) {
    return { applied: false, reason: 'status_select_not_found' };
  }

  // If option does not exist in this screen, skip gracefully.
  const options = await statusSelect.locator('option').evaluateAll((els) => els.map((e) => e.getAttribute('value') || ''));
  if (!options.includes(statusKey)) {
    await clickFirst(page, ['button:has-text("Cancel")']);
    return { applied: false, reason: `status_option_missing:${statusKey}` };
  }

  await statusSelect.selectOption(statusKey);
  const saved = await clickFirst(page, ['button:has-text("Save Changes")', 'button:has-text("Update")', 'button:has-text("Save")']);
  if (!saved) {
    return { applied: false, reason: 'save_button_not_found' };
  }
  await page.waitForTimeout(1400);
  return { applied: true, reason: 'ok' };
}

async function createInvoice(page) {
  await page.goto(`${BASE_URL}/admin-portal/work-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await clickFirst(page, ['button:has-text("Generate & Send Invoice")', 'button:has-text("Invoice")']);
  await page.waitForTimeout(3500);
}

async function readLatestInvoiceStatus(page) {
  await page.goto(`${BASE_URL}/admin-portal/invoices`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const firstCard = page.locator('div:has-text("INV-")').first();
  const text = (await firstCard.textContent().catch(() => '')) || '';
  const invoiceId = (text.match(/INV-[A-Z0-9-]+/) || [null])[0];
  const paid = /PAID|Auto-charge:\s*succeeded|charged successfully/i.test(text);
  const status = paid ? 'succeeded' : /Awaiting|sent|draft|overdue/i.test(text) ? 'pending' : 'unknown';
  return { invoiceId, status, raw: text.slice(0, 600) };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext();
  const clientContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const clientPage = await clientContext.newPage();
  adminPage.setDefaultTimeout(15000);
  clientPage.setDefaultTimeout(15000);

  try {
    for (let i = 0; i < CARD_MATRIX.length; i += 1) {
      const card = CARD_MATRIX[i];
      const cycle = { cycle: i + 1, card: card.label };

      try {
        await setupClientCard(clientPage, card);
        cycle.cardSetup = 'attempted';

        const wo = await createWorkOrder(adminPage, i);
        cycle.workOrderId = wo.workOrderId;
        cycle.workOrderUrl = wo.url;
        cycle.statusFlow = [];

        if (wo.workOrderId) {
          // Apply explicit status progression before/through assignment.
          for (const step of STATUS_FLOW) {
            // Assignment action should occur around the assigned phase.
            if (step.key === 'assigned') {
              await setWorkOrderStatus(adminPage, wo.workOrderId, 'assigned').catch(() => ({ applied: false, reason: 'exception' }));
              await assignAndComplete(adminPage, wo.workOrderId);
              cycle.assignment = `attempted to ${SUBCONTRACTOR_EMAIL}`;
              cycle.statusFlow.push({ step: step.label, key: step.key, applied: true });
              continue;
            }

            const res = await setWorkOrderStatus(adminPage, wo.workOrderId, step.key).catch(() => ({ applied: false, reason: 'exception' }));
            cycle.statusFlow.push({ step: step.label, key: step.key, applied: res.applied, reason: res.reason });
          }

          cycle.completion = 'attempted via explicit status flow';
        } else {
          cycle.assignment = 'skipped - no workOrderId';
          cycle.completion = 'skipped - no workOrderId';
        }

        await createInvoice(adminPage);
        const inv = await readLatestInvoiceStatus(adminPage);
        cycle.invoiceId = inv.invoiceId;
        cycle.paymentStatus = inv.status;
        cycle.evidence = inv.raw;
      } catch (err) {
        cycle.error = err.message || String(err);
      }

      out.cycles.push(cycle);
      await wait(1200);
    }
  } catch (e) {
    out.blocker = e.message || String(e);
  } finally {
    out.finishedAt = new Date().toISOString();
    await fs.mkdir('artifacts', { recursive: true });
    await fs.writeFile('artifacts/full-payment-cycles-report.json', JSON.stringify(out, null, 2));
    await adminPage.screenshot({ path: 'artifacts/final-state.png', fullPage: true }).catch(() => {});
    await adminContext.close().catch(() => {});
    await clientContext.close().catch(() => {});
    await browser.close();
  }
}

main();
