import { expect, test } from '@playwright/test';

test.describe('product shell fixture', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/settings', async (route) => {
      await route.fulfill({ json: { theme: 'light' } });
    });
  });

  test('exposes landmarks and keyboard focus in both locales', async ({ page }) => {
    for (const locale of ['en', 'ru'] as const) {
      await page.goto(`/${locale}/visual-regression/foundation`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('navigation')).toBeVisible();
      await expect(page.getByRole('main')).toBeVisible();

      await page.keyboard.press('Tab');
      const focused = page.locator(':focus-visible');
      await expect(focused).toBeVisible();
    }
  });

  test('uses the responsive drawer without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/visual-regression/foundation');

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('button', { name: 'Close navigation' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible();

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflows).toBe(false);

    await page.getByRole('button', { name: 'Close navigation' }).click();
    await expect(page.getByRole('button', { name: 'Close navigation' })).toBeHidden();
  });

  test('keeps the dedicated Contacts workspace unavailable while the shell flag is off', async ({ page }) => {
    const response = await page.goto('/en/contacts');
    expect(response?.status()).toBe(404);
  });
});
