import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getThread: vi.fn(),
  getMailProviderForAccount: vi.fn(),
  getMailProvider: vi.fn(),
  protectMessage: vi.fn((message) => message),
}));

vi.mock('@/lib/protected-message-content', () => ({
  protectMessageForDelivery: mocks.protectMessage,
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/lib/get-provider', () => ({
  getMailProviderForAccount: mocks.getMailProviderForAccount,
  getMailProvider: mocks.getMailProvider,
}));

import { GET } from '@/app/api/mail/threads/[threadId]/route';

function request(query = '') {
  return new NextRequest(`https://app.example.test/api/mail/threads/thread-1${query}`);
}

describe('mail thread route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MAIL_PROVIDER = 'stalwart';
    mocks.getSession.mockResolvedValue({ accountId: 'current-account' });
    mocks.getThread.mockResolvedValue({
      id: 'thread-1',
      messages: [],
      total: 0,
      truncated: false,
    });
    mocks.getMailProviderForAccount.mockReturnValue({ getThread: mocks.getThread });
  });

  it('requires an authenticated session', async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await GET(request(), { params: Promise.resolve({ threadId: 'thread-1' }) });

    expect(response.status).toBe(401);
    expect(mocks.getThread).not.toHaveBeenCalled();
  });

  it('uses only the current session account and applies the bounded limit', async () => {
    const response = await GET(request('?limit=7'), {
      params: Promise.resolve({ threadId: 'thread-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.getMailProviderForAccount).toHaveBeenCalledWith('current-account');
    expect(mocks.getThread).toHaveBeenCalledWith('current-account', 'thread-1', 7);
  });

  it('rejects limits above the server boundary', async () => {
    const response = await GET(request('?limit=51'), {
      params: Promise.resolve({ threadId: 'thread-1' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.getThread).not.toHaveBeenCalled();
  });

  it('protects every message in the response', async () => {
    const message = { id: 'message-1', body: { html: '<img src="cid:logo">' } };
    mocks.getThread.mockResolvedValue({ id: 'thread-1', messages: [message], total: 1, truncated: false });

    const response = await GET(request(), { params: Promise.resolve({ threadId: 'thread-1' }) });

    expect(response.status).toBe(200);
    expect(mocks.protectMessage).toHaveBeenCalledWith(message, 'current-account', {
      remoteImagesEnabled: true,
    });
  });
});
