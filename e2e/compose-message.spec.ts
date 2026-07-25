import { test } from '@playwright/test';

// Reaching /mail requires a real session cookie, which is AES-256-GCM
// signed server-side after a live Stalwart JMAP handshake (see
// lib/session.ts) — it cannot be faked via page.route mocks, and no seeded
// Stalwart test account exists in this environment. Covered by manual/
// staging verification instead; revisit once a seeded test account exists.
test.describe('Составление письма', () => {
  test.skip('должен открывать форму составления письма', async () => {});
  test.skip('должен поддерживать отложенную отправку', async () => {});
  test.skip('должен отправлять письмо', async () => {});
});
