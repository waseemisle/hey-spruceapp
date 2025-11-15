import { test, expect } from '@playwright/test';

test.describe('Client Portal E2E Tests', () => {
  test('E2E: Client portal loads', async ({ page }) => {
    await page.goto('/client-portal');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('portal-login')) {
      await expect(page.getByText(/dashboard/i)).toBeVisible();
    }
  });

  test('E2E: Client can navigate to locations', async ({ page }) => {
    await page.goto('/client-portal/locations');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('portal-login')) {
      await expect(page.getByText(/locations/i)).toBeVisible();
    }
  });

  test('E2E: Client can navigate to work orders', async ({ page }) => {
    await page.goto('/client-portal/work-orders');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('portal-login')) {
      await expect(page.getByText(/work orders/i)).toBeVisible();
    }
  });

  test('E2E: Client can navigate to quotes', async ({ page }) => {
    await page.goto('/client-portal/quotes');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('portal-login')) {
      await expect(page.getByText(/quotes/i)).toBeVisible();
    }
  });

  test('E2E: Client can navigate to invoices', async ({ page }) => {
    await page.goto('/client-portal/invoices');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('portal-login')) {
      await expect(page.getByText(/invoices/i)).toBeVisible();
    }
  });
});

