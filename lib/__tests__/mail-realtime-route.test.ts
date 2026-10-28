import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProvider: vi.fn(),
  subscribeToUpdates: vi.fn(),
  getMessage: vi.fn(),
  processNewMessage: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/get-provider', () => ({
  getMailProvider: mocks.getProvider,
  getMailProviderForAccount: mocks.getProvider,
}));
vi.mock('@/lib/process-new-message', () => ({ processNewMessage: mocks.processNewMessage }));

import { GET } from '@/app/api/mail/realtime/route';

describe('mail realtime SSE route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MAIL_PROVIDER = 'stalwart';
    mocks.getSession.mockResolvedValue({ accountId: 'account-1' });
    mocks.getProvider.mockReturnValue({
      subscribeToUpdates: mocks.subscribeToUpdates,
      getMessage: mocks.getMessage,
    });
    mocks.subscribeToUpdates.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('forwards message.new without running auto-sort rules', async () => {
    const abort = new AbortController();
    const response = await GET(
      new NextRequest('https://app.example.test/api/mail/realtime', { signal: abort.signal })
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    // First chunk is the "connected" event, emitted before subscriptions start.
    await reader.read();

    const onEvent = mocks.subscribeToUpdates.mock.calls[0][1];
    await onEvent({ type: 'message.new', data: { messageId: 'message-1', folderId: 'inbox' } });

    const { value } = await reader.read();
    expect(decoder.decode(value)).toContain('event: message.new');

    // The old in-route processing waited 500ms before fetching the message.
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(mocks.processNewMessage).not.toHaveBeenCalled();
    expect(mocks.getMessage).not.toHaveBeenCalled();

    abort.abort();
  });
});
