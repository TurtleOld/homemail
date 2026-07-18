import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  featureEnabled: vi.fn(),
  getFeatureFlags: vi.fn(),
  getSession: vi.fn(),
  getThread: vi.fn(),
  getMailProviderForAccount: vi.fn(),
  getMailProvider: vi.fn(),
  protectMessage: vi.fn((message) => message),
}));

vi.mock('@/lib/feature-flags', () => ({
  isRedesignFeatureEnabled: mocks.featureEnabled,
  getRedesignFeatureFlags: mocks.getFeatureFlags,
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
    mocks.featureEnabled.mockReturnValue(true);
    mocks.getFeatureFlags.mockReturnValue({ protectedMessageContent: false, remoteImageFetching: false });
    mocks.getSession.mockResolvedValue({ accountId: 'current-account' });
    mocks.getThread.mockResolvedValue({
      id: 'thread-1',
      messages: [],
      total: 0,
      truncated: false,
    });
    mocks.getMailProviderForAccount.mockReturnValue({ getThread: mocks.getThread });
  });

  it('is unavailable before authentication when the list-first flag is disabled', async () => {
    mocks.featureEnabled.mockReturnValue(false);

    const response = await GET(request(), { params: Promise.resolve({ threadId: 'thread-1' }) });

    expect(response.status).toBe(404);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getThread).not.toHaveBeenCalled();
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

  it('protects every message only when the protected-content flag is enabled', async () => {
    const message = { id: 'message-1', body: { html: '<img src="cid:logo">' } };
    mocks.getThread.mockResolvedValue({ id: 'thread-1', messages: [message], total: 1, truncated: false });
    mocks.getFeatureFlags.mockReturnValue({ protectedMessageContent: true, remoteImageFetching: false });

    const response = await GET(request(), { params: Promise.resolve({ threadId: 'thread-1' }) });

    expect(response.status).toBe(200);
    expect(mocks.protectMessage).toHaveBeenCalledWith(message, 'current-account', {
      remoteImagesEnabled: false,
    });
  });
});
