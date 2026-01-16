import { test, expect } from '@playwright/test';

test.describe('Составление письма', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="text"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/mail');
  });

  test('должен открывать форму составления письма', async ({ page }) => {
    await page.click('button:has-text("Написать")');
    await expect(page.locator('text=Новое письмо')).toBeVisible();
  });

  test('должен сохранять черновик автоматически', async ({ page }) => {
    await page.click('button:has-text("Написать")');
    await page.fill('input[placeholder*="Кому"]', 'recipient@example.com');
    await page.fill('input[placeholder*="Тема"]', 'Тестовое письмо');
    
    await page.waitForTimeout(12000);
    
    await page.click('button:has-text("Отмена")');
    await page.click('button:has-text("Написать")');
    
    const toValue = await page.inputValue('input[placeholder*="Кому"]');
    expect(toValue).toContain('recipient@example.com');
  });

  test('должен поддерживать отложенную отправку', async ({ page }) => {
    await page.click('button:has-text("Написать")');
    await page.fill('input[placeholder*="Кому"]', 'recipient@example.com');
    await page.fill('input[placeholder*="Тема"]', 'Отложенное письмо');
    
    await page.check('input[id="scheduledSend"]');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    await page.fill('input[id="scheduledDate"]', dateStr);
    await page.fill('input[id="scheduledTime"]', '10:00');
    
    await page.click('button:has-text("Запланировать отправку")');
    
    await expect(page.locator('text=Письмо запланировано')).toBeVisible();
  });
});
