import { expect, test } from '@playwright/test';

test.describe('list-first mail fixtures', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/settings', async (route) => route.fulfill({
      json: { theme: 'light', locale: { language: 'en' } },
    }));
    await page.route('**/api/mail/labels', async (route) => route.fulfill({ json: [] }));
    await page.route('**/api/accounts', async (route) => route.fulfill({ json: { accounts: [] } }));
  });

  test('exposes full-width conversation rows and durable reader links', async ({ page }) => {
    await page.goto('/en/visual-regression/mail/list');
    const list = page.getByRole('region', { name: 'Message list' });
    await expect(list).toHaveAttribute('data-layout', 'list-first');
    await expect(page.getByRole('link', { name: 'Family trip: tickets and final schedule' }).first())
      .toHaveAttribute('href', /\/en\/mail\/messages\/m-104\?folder=inbox/);
  });

  test('keeps the mobile fixture within the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ru/visual-regression/mail/list');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await expect(page.getByRole('heading', { name: 'Входящие', level: 1 })).toBeVisible();
  });

  test('does not expose the reader shell to an unauthenticated request', async ({ page }) => {
    await page.goto('/en/mail/messages/example-message');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with OAuth' })).toBeVisible();
  });
});
