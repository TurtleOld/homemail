import { test, expect } from '@playwright/test';

test.describe('login flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/config', (route) => route.fulfill({
      json: { authMode: 'basic', passwordLoginEnabled: true },
    }));
  });

  // A successful login sets an AES-256-GCM session cookie signed server-side
  // with SESSION_SECRET (see lib/session.ts) after a real Stalwart JMAP
  // handshake — it cannot be faked via page.route mocks, and no seeded
  // Stalwart test account exists in this environment. Covered by manual/
  // staging verification instead; revisit once a seeded test account exists.
  test.skip('logs in with email and password', async ({ page }) => {
    await page.goto('/ru/login');
    await page.getByLabel('Логин').fill('test@example.com');
    await page.getByLabel('Пароль').fill('password123');
    await page.getByRole('button', { name: 'Войти по логину и паролю' }).click();
    await page.waitForURL('**/ru/mail');
  });

  test('shows an error for a rejected login', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => route.fulfill({
      status: 401,
      json: { error: 'Неверный логин или пароль' },
    }));

    await page.goto('/ru/login');
    await expect(page.getByRole('heading', { name: 'Добро пожаловать' })).toBeVisible();

    await page.getByLabel('Логин').fill('test@example.com');
    await page.getByLabel('Пароль').fill('wrong-password');
    await page.getByRole('button', { name: 'Войти по логину и паролю' }).click();

    await expect(page.getByText('Неверный логин или пароль')).toBeVisible();
    await expect(page).toHaveURL(/\/ru\/login/);
  });
});
