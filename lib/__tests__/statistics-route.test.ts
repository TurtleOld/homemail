import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProvider: vi.fn(),
  readStorage: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/get-provider', () => ({
  getMailProviderForAccount: mocks.getProvider,
  getMailProvider: mocks.getProvider,
}));
vi.mock('@/lib/storage', () => ({ readStorage: mocks.readStorage }));

import { GET } from '@/app/api/mail/statistics/route';

describe('mail statistics read-only failure boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MAIL_PROVIDER = 'stalwart';
    mocks.readStorage.mockResolvedValue({});
  });

  it('rejects a request with no session credentials', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.getProvider).not.toHaveBeenCalled();
  });

  it('returns a controlled failure when Stalwart is unavailable', async () => {
    mocks.getSession.mockResolvedValue({ accountId: 'mailbox@example.test' });
    mocks.getProvider.mockReturnValue({ getFolders: vi.fn().mockRejectedValue(new Error('network down')) });
    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
  });

  it('returns a controlled failure for an invalid provider response', async () => {
    mocks.getSession.mockResolvedValue({ accountId: 'mailbox@example.test' });
    mocks.getProvider.mockReturnValue({ getFolders: vi.fn().mockResolvedValue(null) });
    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
  });
});
