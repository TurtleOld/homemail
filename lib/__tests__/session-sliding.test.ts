import { beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;
const cookieJar = new Map<string, string>();
const cookieStore = {
  get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name)! } : undefined),
  set: vi.fn((name: string, value: string) => cookieJar.set(name, value)),
};
const stored = new Map<string, { sessionId: string; accountId: string; email: string; expiresAt: number; cookieValue: string }>();

vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
vi.mock('../storage', () => ({
  getSessionByCookie: async (value: string) =>
    [...stored.values()].find((s) => s.cookieValue === value && s.expiresAt > Date.now()) ?? null,
  saveSession: async (s: { sessionId: string } & Record<string, unknown>) => { stored.set(s.sessionId, s as never); },
  deleteSession: async (id: string) => { stored.delete(id); },
}));

describe('session sliding expiry', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'x'.repeat(32);
    cookieJar.clear();
    stored.clear();
    cookieStore.set.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('keeps an active session alive past 30 days and expires an idle one', async () => {
    const { createSession, getSession } = await import('../session');
    await createSession('user@example.com', 'user@example.com');

    for (let day = 0; day < 60; day += 20) {
      vi.advanceTimersByTime(20 * DAY);
      expect(await getSession()).not.toBeNull();
    }

    vi.advanceTimersByTime(31 * DAY);
    expect(await getSession()).toBeNull();
  });

  it('does not rewrite the session more than once a day', async () => {
    const { createSession, getSession } = await import('../session');
    await createSession('user@example.com', 'user@example.com');
    cookieStore.set.mockClear();

    vi.advanceTimersByTime(DAY / 2);
    await getSession();
    expect(cookieStore.set).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DAY);
    await getSession();
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
  });
});
