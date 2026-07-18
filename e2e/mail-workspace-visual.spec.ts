import { expect, test } from '@playwright/test';

for (const screen of ['list', 'reader'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`mail ${screen} fixture: ${locale}, ${theme}`, async ({ page }) => {
        await page.route('**/api/settings', async (route) => route.fulfill({
          json: { theme, locale: { language: locale } },
        }));
        await page.route('**/api/mail/labels', async (route) => route.fulfill({ json: [] }));
        await page.route('**/api/accounts', async (route) => route.fulfill({ json: { accounts: [] } }));

        await page.goto(`/${locale}/visual-regression/mail/${screen}`);
        await page.evaluate(() => document.fonts.ready);

        await expect(page.getByTestId(`mail-${screen}-fixture`)).toHaveScreenshot(
          `mail-${screen}-${locale}-${theme}.png`,
          { animations: 'disabled' }
        );
      });
    }
  }
}
