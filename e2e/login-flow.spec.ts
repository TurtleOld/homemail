import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('h1')).toContainText('Вход в почту');

  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  await page.waitForURL('/mail', { timeout: 5000 });
  await expect(page.locator('text=Почта')).toBeVisible();
});

test('mail inbox flow', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  await page.waitForURL('/mail');

  await expect(page.locator('text=Входящие')).toBeVisible();

  const firstMessage = page.locator('[data-testid="message-item"]').first();
  if (await firstMessage.count() > 0) {
    await firstMessage.click();
    await expect(page.locator('text=Ответить')).toBeVisible();
  }
});

test('compose and send', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  await page.waitForURL('/mail');

  await page.click('text=Написать');

  await page.fill('input[placeholder="Кому"]', 'recipient@example.com');
  await page.fill('input[placeholder="Тема"]', 'Test Subject');

  await page.waitForTimeout(2000);

  await page.click('button:has-text("Отправить")');

  await expect(page.locator('text=Письмо отправлено')).toBeVisible({ timeout: 10000 });
});
