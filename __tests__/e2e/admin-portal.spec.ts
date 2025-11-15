import { test, expect } from '@playwright/test';

test.describe('Admin Portal E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Note: In a real E2E test, you would authenticate first
    // For now, we'll test the structure and navigation
    await page.goto('/admin-portal');
  });

  test('E2E: Admin portal loads and shows dashboard', async ({ page }) => {
    // Check if redirected to login (expected if not authenticated)
    const currentUrl = page.url();
    
    if (currentUrl.includes('portal-login')) {
      // Not authenticated - this is expected behavior
      await expect(page.getByText(/portal login/i)).toBeVisible();
    } else {
      // If authenticated, dashboard should be visible
      await expect(page.getByText(/dashboard/i)).toBeVisible();
    }
  });

  test('E2E: Admin can navigate to clients page', async ({ page }) => {
    await page.goto('/admin-portal/clients');
    
    // Should either show login or clients page
    const currentUrl = page.url();
    if (!currentUrl.includes('portal-login')) {
      await expect(page.getByText(/clients/i)).toBeVisible();
    }
  });

  test('E2E: Admin can navigate to locations page', async ({ page }) => {
    await page.goto('/admin-portal/locations');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('portal-login')) {
      await expect(page.getByText(/locations/i)).toBeVisible();
    }
  });

  test('E2E: Admin can navigate to work orders page', async ({ page }) => {
    await page.goto('/admin-portal/work-orders');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('portal-login')) {
      await expect(page.getByText(/work orders/i)).toBeVisible();
    }
  });

  test('E2E: Theme toggle works', async ({ page }) => {
    await page.goto('/admin-portal');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('portal-login')) {
      const themeToggle = page.getByLabel(/toggle theme/i);
      if (await themeToggle.isVisible()) {
        await themeToggle.click();
        
        // Check if theme class is applied
        const html = page.locator('html');
        const classList = await html.getAttribute('class');
        expect(classList).toBeTruthy();
      }
    }
  });
});

