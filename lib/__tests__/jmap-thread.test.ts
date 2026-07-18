import { describe, expect, it, vi } from 'vitest';
import { JMAPClient } from '@/providers/stalwart-jmap/jmap-client';

function createClient() {
  return new JMAPClient('http://stalwart:8080', 'user@example.test', 'secret', 'account');
}

describe('JMAP thread lookup', () => {
  it('returns email ids in the order supplied by Thread/get', async () => {
    const client = createClient();
    const request = vi.spyOn(client, 'request').mockResolvedValue({
      methodResponses: [[
        'Thread/get',
        {
          accountId: 'mail-account',
          list: [{ id: 'thread-1', emailIds: ['message-1', 'message-2'] }],
          notFound: [],
        },
        '0',
      ]],
    });

    await expect(client.getThreadEmailIds('thread-1', 'mail-account'))
      .resolves.toEqual(['message-1', 'message-2']);
    expect(request).toHaveBeenCalledWith([[
      'Thread/get',
      { accountId: 'mail-account', ids: ['thread-1'] },
      '0',
    ]]);
  });

  it('returns null when Thread/get reports no matching thread', async () => {
    const client = createClient();
    vi.spyOn(client, 'request').mockResolvedValue({
      methodResponses: [[
        'Thread/get',
        { accountId: 'account', list: [], notFound: ['missing'] },
        '0',
      ]],
    });

    await expect(client.getThreadEmailIds('missing')).resolves.toBeNull();
  });

  it('rejects a JMAP method error instead of treating it as an empty thread', async () => {
    const client = createClient();
    vi.spyOn(client, 'request').mockResolvedValue({
      methodResponses: [['error', { type: 'serverFail', description: 'Unavailable' }, '0']],
    });

    await expect(client.getThreadEmailIds('thread-1')).rejects.toThrow(
      'Invalid thread get response'
    );
  });

  it('rejects a Thread/get response for another account', async () => {
    const client = createClient();
    vi.spyOn(client, 'request').mockResolvedValue({
      methodResponses: [[
        'Thread/get',
        { accountId: 'other-account', list: [], notFound: ['thread-1'] },
        '0',
      ]],
    });

    await expect(client.getThreadEmailIds('thread-1', 'mail-account')).rejects.toThrow(
      'different account'
    );
  });
});
