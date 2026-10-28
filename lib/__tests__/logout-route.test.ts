import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  // Must be set before any module (in particular lib/storage) is imported,
  // because DATA_DIR is resolved at import time.
  // No imports available in vi.hoisted, so the path is assembled by hand.
  const dataDir = `${process.env.TMPDIR || '/tmp'}/homemail-logout-test-${process.pid}-${Date.now()}`;
  process.env.DATA_DIR = dataDir;

  return {
    dataDir,
    getSession: vi.fn(),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    revokeToken: vi.fn().mockResolvedValue(undefined),
    deleteToken: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  deleteSession: mocks.deleteSession,
}));

vi.mock('@/lib/oauth-jmap-client', () => ({
  OAuthJMAPClient: class {
    revokeToken = mocks.revokeToken;
  },
}));

vi.mock('@/lib/oauth-token-store', () => ({
  OAuthTokenStore: class {
    deleteToken = mocks.deleteToken;
  },
}));

import { POST } from '@/app/api/auth/logout/route';

const ACCOUNT_ID = 'user@example.test';
const HOUR = 60 * 60 * 1000;

function storedSession(sessionId: string) {
  return {
    sessionId,
    accountId: ACCOUNT_ID,
    email: ACCOUNT_ID,
    expiresAt: Date.now() + HOUR,
    cookieValue: `cookie-${sessionId}`,
  };
}

function sessionData(sessionId: string) {
  return {
    sessionId,
    accountId: ACCOUNT_ID,
    email: ACCOUNT_ID,
    expiresAt: Date.now() + HOUR,
    createdAt: Date.now(),
  };
}

async function readSessionsFile(): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(path.join(mocks.dataDir, 'sessions.json'), 'utf-8'));
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await fs.rm(mocks.dataDir, { recursive: true, force: true });
  });

  it('keeps the shared OAuth token until the last session of the account logs out', async () => {
    await fs.mkdir(mocks.dataDir, { recursive: true });
    await fs.writeFile(
      path.join(mocks.dataDir, 'sessions.json'),
      JSON.stringify({
        sess_first: storedSession('sess_first'),
        sess_second: storedSession('sess_second'),
      })
    );

    mocks.getSession.mockResolvedValueOnce(sessionData('sess_first'));
    const firstResponse = await POST();

    expect(firstResponse.status).toBe(200);
    // The second device still holds a session, so the account token must survive.
    expect(mocks.revokeToken).not.toHaveBeenCalled();
    expect(mocks.deleteToken).not.toHaveBeenCalled();
    expect(Object.keys(await readSessionsFile())).toEqual(['sess_second']);

    mocks.getSession.mockResolvedValueOnce(sessionData('sess_second'));
    const secondResponse = await POST();

    expect(secondResponse.status).toBe(200);
    expect(mocks.revokeToken).toHaveBeenCalledOnce();
    expect(mocks.deleteToken).toHaveBeenCalledOnce();
    expect(mocks.deleteToken).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(await readSessionsFile()).toEqual({});
  });
});
