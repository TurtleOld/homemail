import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cookieJar = vi.hoisted(() => new Map<string, string>());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      if (value === '') {
        cookieJar.delete(name);
      } else {
        cookieJar.set(name, value);
      }
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

describe('session logout', () => {
  type SessionModule = typeof import('../session');
  type StorageModule = typeof import('../storage');

  let session: SessionModule;
  let storage: StorageModule;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = path.join(os.tmpdir(), `test-session-logout-${process.pid}-${Date.now()}`);
    process.env.DATA_DIR = dataDir;
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
    vi.resetModules();
    session = await import('../session');
    storage = await import('../storage');
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('rejects the pre-logout cookie even after the same user logs in again', async () => {
    await session.createSession('user@example.com', 'user@example.com');

    const preLogoutCookie = cookieJar.get('mail_session');
    expect(preLogoutCookie).toBeTruthy();
    expect(await session.getSession()).not.toBeNull();

    await session.deleteSession();

    expect(cookieJar.has('mail_session')).toBe(false);
    expect(await storage.getSessionByCookie(preLogoutCookie!)).toBeNull();

    // Simulate a stolen copy of the cookie: the browser cookie was cleared,
    // but an attacker still holds the original value.
    cookieJar.set('mail_session', preLogoutCookie!);
    expect(await session.getSession()).toBeNull();
    // getSession must not recreate the deleted session in sessions.json.
    expect(await storage.getSessionByCookie(preLogoutCookie!)).toBeNull();

    await session.createSession('user@example.com', 'user@example.com');
    const freshCookie = cookieJar.get('mail_session');
    expect(freshCookie).toBeTruthy();
    expect(freshCookie).not.toBe(preLogoutCookie);
    expect(await session.getSession()).not.toBeNull();

    // The owner's new login must not revive the old cookie.
    cookieJar.set('mail_session', preLogoutCookie!);
    expect(await session.getSession()).toBeNull();
    expect(await storage.getSessionByCookie(preLogoutCookie!)).toBeNull();

    cookieJar.set('mail_session', freshCookie!);
    expect(await session.getSession()).not.toBeNull();
  });
});
