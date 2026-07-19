import { expect, test } from '@playwright/test';
import english from '@/messages/en.json';
import russian from '@/messages/ru.json';
import { SETTINGS_SECTION_IDS } from '@/lib/settings-routes';

const healthFixture = {
  status: 'degraded',
  timestamp: '2026-07-19T09:00:00.000Z',
  system: { uptime: 93720, memory: { used: 536870912, total: 1073741824, percentage: 50 } },
  security: {
    recentEvents: { total: 7, byType: { login_failed: 5, csrf_violation: 2 }, bySeverity: { medium: 5, high: 2 } },
    last24Hours: { failedLogins: 5, blockedIps: 1, csrfViolations: 2, suspiciousActivity: 0 },
  },
  storage: { available: true, writable: true },
  mailProvider: { available: true, responseTime: 34 },
  stalwart: { reachable: true, queue: { total: 3, hasEntries: true }, reports: null },
  checks: { storage: true, mailProvider: true, security: true },
};

const statisticsFixture = {
  totalMessages: 128,
  totalUnread: 14,
  totalSent: 36,
  totalDrafts: 2,
  messagesByDay: [
    { date: '2026-07-17', incoming: 12, outgoing: 4 },
    { date: '2026-07-18', incoming: 8, outgoing: 6 },
    { date: '2026-07-19', incoming: 15, outgoing: 7 },
  ],
  topSenders: [{ email: 'generated.sender@example.test', count: 9 }],
  labelStats: {},
  folderStats: [{ id: 'inbox', name: 'Inbox', role: 'inbox', unreadCount: 14 }],
};

const settingsFixture = {
  signature: '',
  theme: 'system',
  autoReply: { enabled: false, subject: '', message: '' },
};

for (const locale of ['ru', 'en'] as const) {
  for (const screen of ['monitoring', 'statistics'] as const) {
    test(`${screen} fixture: ${locale}`, async ({ page }) => {
      await page.route('**/api/settings', (route) => route.fulfill({ json: { theme: 'light' } }));
      await page.route('**/api/monitoring?detailed=true', (route) => route.fulfill({ json: healthFixture }));
      await page.route('**/api/mail/statistics', (route) => route.fulfill({ json: statisticsFixture }));

      await page.goto(`/${locale}/visual-regression/settings/${screen}`);
      await page.evaluate(() => document.fonts.ready);

      const fixture = page.getByTestId(`settings-${screen}-fixture`);
      await expect(fixture).toBeVisible();
      await expect(fixture.getByRole('heading').first()).toBeVisible();
      await expect(fixture).toHaveScreenshot(`settings-${screen}-${locale}.png`, { animations: 'disabled' });

      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }
}

test('monitoring exposes a retry action on failure', async ({ page }) => {
  await page.route('**/api/settings', (route) => route.fulfill({ json: { theme: 'light' } }));
  await page.route('**/api/monitoring?detailed=true', (route) => route.fulfill({ status: 503, json: { error: 'secret upstream detail' } }));
  await page.goto('/en/visual-regression/settings/monitoring');

  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByText('secret upstream detail')).toHaveCount(0);
});

test('statistics exposes a retry action on invalid data', async ({ page }) => {
  await page.route('**/api/settings', (route) => route.fulfill({ json: { theme: 'light' } }));
  await page.route('**/api/mail/statistics', (route) => route.fulfill({ json: { invalid: true } }));
  await page.goto('/ru/visual-regression/settings/statistics');

  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
});

for (const locale of ['ru', 'en'] as const) {
  test(`every settings route resolves its ${locale} catalog label`, async ({ page }) => {
    const messages = locale === 'ru' ? russian : english;
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, json: { error: 'generated failure' } }));
    await page.route('**/api/settings', (route) => route.fulfill({ json: settingsFixture }));

    for (const section of SETTINGS_SECTION_IDS) {
      if (section === 'monitoring' || section === 'statistics') continue;
      await page.goto(`/${locale}/visual-regression/settings/${section}`);
      await expect(page.getByRole('heading', { name: messages.settings.shell.title, exact: true })).toBeVisible();
      await expect(page.getByText(messages.settings.tabs[section], { exact: true }).first()).toBeVisible();
      await expect(page.getByText(/MISSING_MESSAGE|IntlError/)).toHaveCount(0);
    }
  });
}
