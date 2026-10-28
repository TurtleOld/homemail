import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getJmapSession: vi.fn(),
  createSession: vi.fn(),
  setCredentials: vi.fn(),
  logLoginSuccess: vi.fn(),
  logLoginFailed: vi.fn(),
  logLoginBlocked: vi.fn(),
}));

vi.mock('@/providers/stalwart-jmap/jmap-client', () => ({
  JMAPClient: vi.fn(function (this: { getSession: typeof mocks.getJmapSession }) {
    this.getSession = mocks.getJmapSession;
  }),
}));
vi.mock('@/lib/session', () => ({ createSession: mocks.createSession }));
vi.mock('@/lib/storage', () => ({ setCredentials: mocks.setCredentials }));
vi.mock('@/lib/auth-config', () => ({ isPasswordLoginEnabled: () => true }));
vi.mock('@/lib/security-logger', () => ({
  SecurityLogger: {
    logLoginSuccess: mocks.logLoginSuccess,
    logLoginFailed: mocks.logLoginFailed,
    logLoginBlocked: mocks.logLoginBlocked,
  },
}));
vi.mock('@/lib/client-ip', () => ({ getClientIp: () => '203.0.113.10' }));
vi.mock('@/lib/stalwart-base-url', () => ({
  getStalwartBaseUrlCandidates: () => ['https://mail.example.test'],
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/auth/login/route';
import { __resetBruteForceStoreForTests } from '@/lib/brute-force-protection';

function loginRequest(email = 'user@example.test', password = 'secret') {
  return new NextRequest('https://app.example.test/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

describe('basic login brute-force protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetBruteForceStoreForTests();
  });

  it('blocks further attempts after repeated authentication failures', async () => {
    mocks.getJmapSession.mockRejectedValue(new Error('JMAP session failed: 401 Unauthorized'));

    for (let attempt = 0; attempt < 5; attempt++) {
      const email = attempt % 2 === 0 ? 'user@example.test' : 'User@example.test';
      const response = await POST(loginRequest(email));
      expect(response.status).toBe(401);
    }

    expect(mocks.getJmapSession).toHaveBeenCalledTimes(5);

    const blocked = await POST(loginRequest());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect((await blocked.json()).error).toMatch(/failed login attempts/i);
    expect(mocks.getJmapSession).toHaveBeenCalledTimes(5);
    expect(mocks.logLoginBlocked).toHaveBeenCalled();
  });

  it('keeps the account usable after a successful login', async () => {
    mocks.getJmapSession.mockRejectedValue(new Error('JMAP session failed: 401 Unauthorized'));
    for (let attempt = 0; attempt < 4; attempt++) {
      expect((await POST(loginRequest())).status).toBe(401);
    }

    mocks.getJmapSession.mockResolvedValueOnce({
      primaryAccounts: { mail: 'mail-1' },
      accounts: { 'mail-1': { name: 'User' } },
    });
    expect((await POST(loginRequest())).status).toBe(200);
    expect(mocks.logLoginSuccess).toHaveBeenCalled();

    mocks.getJmapSession.mockRejectedValue(new Error('JMAP session failed: 401 Unauthorized'));
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await POST(loginRequest())).status).toBe(401);
    }
    expect((await POST(loginRequest())).status).toBe(429);
  });

  it('does not count an unreachable server as a failed attempt', async () => {
    mocks.getJmapSession.mockRejectedValue(new Error('fetch failed'));
    for (let attempt = 0; attempt < 6; attempt++) {
      expect((await POST(loginRequest())).status).toBe(401);
    }
    expect(mocks.getJmapSession).toHaveBeenCalledTimes(6);
  });
});
