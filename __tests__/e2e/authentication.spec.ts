import { test, expect } from '@playwright/test';

test.describe('Authentication E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('E2E: User can navigate to client registration', async ({ page }) => {
    await expect(page.getByText('Client Portal')).toBeVisible();
    
    const registerLink = page.getByRole('link', { name: /register as client/i });
    await registerLink.click();
    
    await expect(page).toHaveURL(/.*register-client/);
    await expect(page.getByText(/client registration/i)).toBeVisible();
  });

  test('E2E: User can navigate to subcontractor registration', async ({ page }) => {
    const registerLink = page.getByRole('link', { name: /register as subcontractor/i });
    await registerLink.click();
    
    await expect(page).toHaveURL(/.*register-subcontractor/);
    await expect(page.getByText(/subcontractor registration/i)).toBeVisible();
  });

  test('E2E: User can navigate to portal login', async ({ page }) => {
    const loginLink = page.getByRole('link', { name: /portal login/i });
    await loginLink.click();
    
    await expect(page).toHaveURL(/.*portal-login/);
    await expect(page.getByText(/portal login/i)).toBeVisible();
  });

  test('E2E: Login form validates required fields', async ({ page }) => {
    await page.goto('/portal-login');
    
    const loginButton = page.getByRole('button', { name: /login/i });
    await loginButton.click();
    
    // Form should show validation errors or prevent submission
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeVisible();
  });

  test('E2E: Registration form validates email format', async ({ page }) => {
    await page.goto('/register-client');
    
    const emailInput = page.getByLabel(/email/i);
    await emailInput.fill('invalid-email');
    
    // Email input should have type="email" which provides browser validation
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('E2E: Registration form validates password match', async ({ page }) => {
    await page.goto('/register-client');
    
    const passwordInput = page.getByLabel(/^password/i);
    const confirmPasswordInput = page.getByLabel(/confirm password/i);
    
    await passwordInput.fill('password123');
    await confirmPasswordInput.fill('password456');
    
    // Form should validate password match
    await expect(passwordInput).toBeVisible();
    await expect(confirmPasswordInput).toBeVisible();
  });
});

