import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProvider: vi.fn(),
  getMessage: vi.fn(),
  readStorage: vi.fn(),
  protectMessage: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/get-provider', () => ({
  getMailProviderForAccount: mocks.getProvider,
  getMailProvider: mocks.getProvider,
}));
vi.mock('@/lib/storage', () => ({ readStorage: mocks.readStorage }));
vi.mock('@/lib/protected-message-content', () => ({ protectMessageForDelivery: mocks.protectMessage }));

import { GET } from '@/app/api/mail/messages/[id]/route';

const message = {
  id: 'message-1',
  body: { html: '<img src="https://images.example/a.png">' },
  labels: [],
};

describe('mail message protected-content boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MAIL_PROVIDER = 'stalwart';
    mocks.getSession.mockResolvedValue({ accountId: 'account-1' });
    mocks.getProvider.mockReturnValue({ getMessage: mocks.getMessage });
    mocks.getMessage.mockResolvedValue({ ...message });
    mocks.readStorage.mockResolvedValue({});
    mocks.protectMessage.mockReturnValue({ ...message, body: { html: '<img src="/internal">' } });
  });

  it('rewrites through the authenticated mailbox scope', async () => {
    const response = await GET(new NextRequest('https://app.example.test/api/mail/messages/message-1'), {
      params: Promise.resolve({ id: 'message-1' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.protectMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'message-1' }), 'account-1', {
      remoteImagesEnabled: true,
    });
  });
});
