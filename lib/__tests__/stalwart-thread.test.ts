import { describe, expect, it, vi } from 'vitest';
import type { MessageDetail } from '@/lib/types';
import { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';

function detail(id: string): MessageDetail {
  return {
    id,
    threadId: 'thread-1',
    from: { email: 'sender@example.test' },
    to: [{ email: 'recipient@example.test' }],
    subject: 'Thread subject',
    date: new Date('2026-07-18T10:00:00Z'),
    body: { text: id },
    attachments: [],
    flags: {
      unread: false,
      starred: false,
      important: false,
      hasAttachments: false,
    },
  };
}

describe('Stalwart thread loading', () => {
  it('keeps detail loading to five concurrent requests and the latest 50 messages', async () => {
    const provider = new StalwartJMAPProvider();
    const emailIds = Array.from({ length: 84 }, (_, index) => `message-${index + 1}`);
    const getThreadEmailIds = vi.fn().mockResolvedValue(emailIds);
    (provider as unknown as { getClient: () => Promise<unknown> }).getClient = vi.fn()
      .mockResolvedValue({
        getSession: vi.fn().mockResolvedValue({
          primaryAccounts: { mail: 'jmap-account' },
          accounts: { 'jmap-account': {} },
        }),
        getThreadEmailIds,
      });

    let concurrent = 0;
    let maxConcurrent = 0;
    const getMessage = vi.spyOn(provider, 'getMessage').mockImplementation(async (_accountId, id) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 0));
      concurrent -= 1;
      return detail(id);
    });

    const result = await provider.getThread('current-account', 'thread-1', 500);

    expect(getThreadEmailIds).toHaveBeenCalledWith('thread-1', 'jmap-account');
    expect(getMessage).toHaveBeenCalledTimes(50);
    expect(getMessage.mock.calls.map((call) => call[1])).toEqual(emailIds.slice(-50));
    expect(maxConcurrent).toBe(5);
    expect(result).toMatchObject({ total: 84, truncated: true });
    expect(result?.messages).toHaveLength(50);
  });
});
