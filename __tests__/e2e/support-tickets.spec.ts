/**
 * E2E: Full support ticket flow
 * - Client creates a ticket
 * - Admin views, comments, changes status, closes
 *
 * Set in .env.test or env:
 *   E2E_SUPPORT_CLIENT_EMAIL, E2E_SUPPORT_CLIENT_PASSWORD
 *   E2E_SUPPORT_ADMIN_EMAIL, E2E_SUPPORT_ADMIN_PASSWORD
 *
 * Or use test accounts after: node scripts/seed-test-data.mjs
 *   client@groundopss-test.com / Test1234!
 *   admin@groundopss-test.com / Test1234!
 */

import { test, expect } from '@playwright/test';

const CLIENT_EMAIL = process.env.E2E_SUPPORT_CLIENT_EMAIL || 'client@groundopss-test.com';
const CLIENT_PASSWORD = process.env.E2E_SUPPORT_CLIENT_PASSWORD || 'Test1234!';
const ADMIN_EMAIL = process.env.E2E_SUPPORT_ADMIN_EMAIL || 'admin@groundopss-test.com';
const ADMIN_PASSWORD = process.env.E2E_SUPPORT_ADMIN_PASSWORD || 'Test1234!';

test.describe('Support Tickets E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/portal-login');
  });

  test('E2E: Client creates ticket, admin responds and closes', async ({ page }) => {
    const ticketTitle = `[E2E Test ${Date.now()}] Support flow verification`;

    // --- Client: Login and create ticket ---
    await page.getByLabel(/email/i).fill(CLIENT_EMAIL);
    await page.getByLabel(/password/i).fill(CLIENT_PASSWORD);
    await page.getByRole('button', { name: /login/i }).click();

    await expect(page).toHaveURL(/client-portal/, { timeout: 10000 });
    await page.goto('/client-portal/support-tickets');

    await expect(page.getByText(/support ticket/i)).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /create new ticket/i }).click();
    await page.getByLabel(/title/i).fill(ticketTitle);
    await page.getByLabel(/description/i).fill('E2E automated test - please resolve and close.');
    await page.getByRole('button', { name: /create|submit/i }).click();

    await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 8000 });
    const ticketRow = page.getByRole('row', { name: new RegExp(ticketTitle) });
    await ticketRow.click();

    await expect(page).toHaveURL(/\/support-tickets\/TKT-/);
    const ticketUrl = page.url();
    const ticketIdMatch = ticketUrl.match(/\/support-tickets\/(TKT-\d+)/);
    const ticketId = ticketIdMatch ? ticketIdMatch[1] : null;
    expect(ticketId).toBeTruthy();

    // Logout (navigate to login and sign in as admin)
    await page.goto('/portal-login');

    // --- Admin: Login and handle ticket ---
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /login/i }).click();

    await expect(page).toHaveURL(/admin-portal/, { timeout: 10000 });
    await page.goto('/admin-portal/support-tickets');

    await expect(page.getByText(/support ticket/i)).toBeVisible({ timeout: 10000 });
    await page.getByText(ticketTitle).click();

    await expect(page.getByText(ticketTitle)).toBeVisible();

    // Add comment
    await page.getByPlaceholder(/add a comment|write a reply/i).fill('Admin response: Verified and resolving.');
    await page.getByRole('button', { name: /post|send|comment/i }).click();
    await expect(page.getByText(/admin response: verified/i)).toBeVisible({ timeout: 5000 });

    // Change status to in-progress
    await page.getByRole('button', { name: /status|change status/i }).first().click();
    await page.getByRole('option', { name: /in progress/i }).click();
    await expect(page.getByText(/in progress|in-progress/i)).toBeVisible({ timeout: 3000 });

    // Resolve
    await page.getByRole('button', { name: /status|change status/i }).first().click();
    await page.getByRole('option', { name: /resolved/i }).click();
    await expect(page.getByText(/resolved/i)).toBeVisible({ timeout: 3000 });

    // Close
    await page.getByRole('button', { name: /status|change status/i }).first().click();
    await page.getByRole('option', { name: /closed/i }).click();
    await expect(page.getByText(/closed/i)).toBeVisible({ timeout: 3000 });
  });

  test('E2E: Support tickets page loads for client', async ({ page }) => {
    await page.getByLabel(/email/i).fill(CLIENT_EMAIL);
    await page.getByLabel(/password/i).fill(CLIENT_PASSWORD);
    await page.getByRole('button', { name: /login/i }).click();

    await expect(page).toHaveURL(/client-portal/, { timeout: 10000 });
    await page.goto('/client-portal/support-tickets');

    await expect(page.getByText(/support ticket/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /create new ticket/i })).toBeVisible();
  });

  test('E2E: Support tickets page loads for admin', async ({ page }) => {
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /login/i }).click();

    await expect(page).toHaveURL(/admin-portal/, { timeout: 10000 });
    await page.goto('/admin-portal/support-tickets');

    await expect(page.getByText(/support ticket/i)).toBeVisible({ timeout: 10000 });
  });
});
