import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('rate-limit reset', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rate limiter resets after successful login (simulated)', async () => {
    // Ensure config is deterministic for the test BEFORE importing the module
    process.env.RATE_LIMIT_LOGIN_MAX = '2';
    process.env.RATE_LIMIT_LOGIN_WINDOW = '60000';

    const { consumeRateLimit, previewRateLimit, resetRateLimit } = await import('../rate-limit');

    const ip = '1.2.3.4';

    // 2 failed attempts
    consumeRateLimit(ip, 'login');
    consumeRateLimit(ip, 'login');

    const blocked = previewRateLimit(ip, 'login');
    expect(blocked.allowed).toBe(false);

    // success should reset bucket
    resetRateLimit(ip, 'login');
    const after = previewRateLimit(ip, 'login');
    expect(after.allowed).toBe(true);
  });
});
