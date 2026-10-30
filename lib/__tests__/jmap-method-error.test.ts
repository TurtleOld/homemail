import { afterEach, describe, expect, it, vi } from 'vitest';
import { JMAPClient } from '@/providers/stalwart-jmap/jmap-client';
import { SendUnknownError } from '@/providers/mail-provider';

function clientWithMockedFetch(methodResponse: [string, any, string]) {
  const client = new JMAPClient(
    'https://stalwart.example.test',
    'user@example.test',
    '',
    'account-1',
    'bearer'
  );
  vi.spyOn(client, 'getSession').mockResolvedValue({
    apiUrl: 'https://stalwart.example.test/jmap',
  } as any);
  vi.spyOn(
    client as unknown as { resolveUrlToIp: (url: string) => Promise<string> },
    'resolveUrlToIp'
  ).mockResolvedValue('https://stalwart.example.test/jmap');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ methodResponses: [methodResponse] }), { status: 200 })
      )
  );
  return client;
}

describe('JMAPClient method errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws with the server error type and description instead of a generic invalid response', async () => {
    const client = clientWithMockedFetch([
      'error',
      { type: 'invalidArguments', description: 'x' },
      '0',
    ]);

    const error = await client
      .request([['Mailbox/get', { accountId: 'account-1' }, '0']])
      .catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('invalidArguments');
    expect((error as Error).message).toContain('x');
  });

  it('keeps treating a /changes error as a re-seed signal', async () => {
    const client = clientWithMockedFetch(['error', { type: 'cannotCalculateChanges' }, '0']);

    await expect(client.getMailboxChanges('state-1')).resolves.toEqual({
      cannotCalculateChanges: true,
    });
  });

  it('reports the server error for Identity/set', async () => {
    const client = clientWithMockedFetch([
      'error',
      { type: 'forbidden', description: 'identity not allowed' },
      '0',
    ]);
    vi.spyOn(client, 'getIdentities').mockResolvedValue([]);

    await expect(client.setIdentities([{ email: 'user@example.test' }])).rejects.toThrow(
      /forbidden.*identity not allowed/
    );
  });

  it('marks a dropped submission connection as an unknown delivery result', async () => {
    const client = new JMAPClient(
      'https://stalwart.example.test',
      'user@example.test',
      'token',
      'account-1',
      'bearer'
    );
    vi.spyOn(client, 'getIdentities').mockResolvedValue([
      { id: 'identity-1', email: 'user@example.test' },
    ]);
    vi.spyOn(client, 'requestWithUsing').mockRejectedValue(new Error('socket hang up'));

    await expect(client.sendEmail('email-1')).rejects.toBeInstanceOf(SendUnknownError);
  });

  it('treats an empty submission response as an unknown delivery result', async () => {
    const client = new JMAPClient(
      'https://stalwart.example.test',
      'user@example.test',
      'token',
      'account-1',
      'bearer'
    );
    vi.spyOn(client, 'getIdentities').mockResolvedValue([
      { id: 'identity-1', email: 'user@example.test' },
    ]);
    vi.spyOn(client, 'requestWithUsing').mockResolvedValue({ methodResponses: [] } as any);

    await expect(client.sendEmail('email-1')).rejects.toBeInstanceOf(SendUnknownError);
  });

  it('treats an explicit EmailSubmission/set error as a retryable rejection', async () => {
    const client = new JMAPClient(
      'https://stalwart.example.test',
      'user@example.test',
      'token',
      'account-1',
      'bearer'
    );
    vi.spyOn(client, 'getIdentities').mockResolvedValue([
      { id: 'identity-1', email: 'user@example.test' },
    ]);
    vi.spyOn(client, 'requestWithUsing').mockResolvedValue({
      methodResponses: [['error', { type: 'forbiddenFrom', description: 'not allowed' }, '0']],
    } as any);

    const error = await client.sendEmail('email-1').catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SendUnknownError);
    expect((error as Error).message).toContain('forbiddenFrom');
  });
});
