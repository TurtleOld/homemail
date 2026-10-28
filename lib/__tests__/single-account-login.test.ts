import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  setCredentials: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  createSession: mocks.createSession,
  getSession: mocks.getSession,
}));
vi.mock('@/lib/storage', () => ({ setCredentials: mocks.setCredentials }));
vi.mock('@/lib/auth-config', () => ({ isPasswordLoginEnabled: () => true }));
vi.mock('@/lib/security-logger', () => ({
  SecurityLogger: { logLoginSuccess: vi.fn(), logLoginFailed: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/stalwart-base-url', () => ({
  getStalwartBaseUrlCandidates: () => ['http://stalwart:8080'],
}));
vi.mock('@/providers/stalwart-jmap/jmap-client', () => ({
  JMAPClient: class {
    async getSession() {
      const accountId = 'user@example.com';
      return {
        primaryAccounts: { mail: accountId },
        accounts: { [accountId]: { name: 'User' } },
      };
    }
  },
}));

import { POST } from '@/app/api/auth/login/route';

/** Builds a JSON login request for the given body. */
function loginRequest(body: Record<string, unknown>) {
  return new NextRequest('https://app.example.test/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('single-account password login', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('opens a new session for the entered mailbox when a session already exists', async () => {
    mocks.getSession.mockResolvedValue({
      sessionId: 'existing-session',
      accountId: 'first@example.com',
      email: 'first@example.com',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });

    const request = loginRequest({
      email: 'user@example.com',
      password: 'secret',
      addAccount: true,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      account: { id: 'user@example.com', email: 'user@example.com', displayName: 'User' },
    });
    expect(body).not.toHaveProperty('addedAccount');
    expect(mocks.setCredentials).toHaveBeenCalledWith(
      'user@example.com',
      'user@example.com',
      'secret'
    );
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.createSession).toHaveBeenCalledWith(
      'user@example.com',
      'user@example.com',
      request
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
