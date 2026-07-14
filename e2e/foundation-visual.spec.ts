import { expect, test } from '@playwright/test';

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`foundation fixture: ${locale}, ${theme}`, async ({ page }) => {
      await page.route('**/api/settings', async (route) => {
        await route.fulfill({ json: { theme } });
      });

      await page.goto(`/${locale}/visual-regression/foundation`);
      await page.evaluate(() => document.fonts.ready);

      const fixture = page.getByTestId('foundation-fixture');
      await expect(fixture).toHaveScreenshot(`foundation-${locale}-${theme}.png`, {
        animations: 'disabled',
      });
    });
  }
}
