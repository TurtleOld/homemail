import { describe, expect, it, vi } from 'vitest';
import { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';

function mockClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getSession: vi.fn().mockResolvedValue({
      primaryAccounts: { mail: 'jmap-account' },
      accounts: { 'jmap-account': {} },
    }),
    getEmails: vi.fn().mockResolvedValue([
      {
        id: 'message-1',
        blobId: 'server-blob-42',
        from: [{ email: 'sender@example.test' }],
        to: [{ email: 'recipient@example.test' }],
        subject: 'Quarterly report',
        size: 1234,
        'header:Message-ID:asText': '<abc@example.test>\r\n',
        'header:Authentication-Results:asText':
          'mx.example.test; dkim=pass header.d=example.test; spf=pass smtp.mailfrom=sender@example.test; dmarc=pass header.from=example.test',
        'header:Received-SPF:asText': '',
        'header:DKIM-Signature:asText': 'v=1; d=example.test; s=selector',
      },
    ]),
    getBlobDownloadUrl: vi.fn().mockResolvedValue('https://stalwart.example.test/jmap/download/jmap-account/server-blob-42/message-1.eml'),
    getAuthHeader: vi.fn().mockReturnValue('Bearer token'),
    ...overrides,
  };
}

function withMockedClient(provider: StalwartJMAPProvider, client: ReturnType<typeof mockClient>) {
  (provider as unknown as { getClient: () => Promise<unknown> }).getClient = vi.fn().mockResolvedValue(client);
}

describe('StalwartJMAPProvider.getMessageSource', () => {
  it('downloads the server-returned top-level message blob, not a client-supplied id', async () => {
    const provider = new StalwartJMAPProvider();
    const client = mockClient();
    withMockedClient(provider, client);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('raw rfc822 bytes', { status: 200 })
    );

    try {
      const handle = await provider.getMessageSource('account-1', 'message-1');
      expect(handle).not.toBeNull();
      await handle!.openStream();

      expect(client.getBlobDownloadUrl).toHaveBeenCalledWith('server-blob-42', 'jmap-account', 'message-1.eml');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://stalwart.example.test/jmap/download/jmap-account/server-blob-42/message-1.eml',
        expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reports diagnostics with server-provided domains, defaulting missing checks to unavailable', async () => {
    const provider = new StalwartJMAPProvider();
    withMockedClient(provider, mockClient());

    const handle = await provider.getMessageSource('account-1', 'message-1');

    expect(handle?.size).toBe(1234);
    expect(handle?.diagnostics).toMatchObject({
      messageId: '<abc@example.test>',
      spf: { status: 'pass', domain: 'example.test' },
      dkim: { status: 'pass', domain: 'example.test' },
      dmarc: { status: 'pass', domain: 'example.test' },
    });
  });

  it('marks a check unavailable when the server supplied no result, instead of implying pass or fail', async () => {
    const provider = new StalwartJMAPProvider();
    withMockedClient(
      provider,
      mockClient({
        getEmails: vi.fn().mockResolvedValue([
          {
            id: 'message-1',
            blobId: 'server-blob-99',
            from: [{ email: 'sender@example.test' }],
            to: [],
            subject: 'No auth headers',
            size: 10,
            'header:Authentication-Results:asText': '',
            'header:Received-SPF:asText': '',
            'header:DKIM-Signature:asText': '',
          },
        ]),
      })
    );

    const handle = await provider.getMessageSource('account-1', 'message-1');

    expect(handle?.diagnostics.spf).toEqual({ status: 'unavailable' });
    expect(handle?.diagnostics.dkim).toEqual({ status: 'unavailable', domain: undefined });
    expect(handle?.diagnostics.dmarc).toEqual({ status: 'unavailable' });
  });

  it('resolves the source for a typical multipart message, whose container part has no blobId of its own', async () => {
    const provider = new StalwartJMAPProvider();
    withMockedClient(
      provider,
      mockClient({
        getEmails: vi.fn().mockResolvedValue([
          {
            id: 'message-1',
            blobId: 'server-blob-top-level',
            from: [{ email: 'sender@example.test' }],
            to: [{ email: 'recipient@example.test' }],
            subject: 'Multipart message',
            size: 4321,
            // A multipart/mixed or multipart/alternative container has no
            // raw content blob of its own — only leaf parts do. Real
            // messages hit this path far more often than single-part ones.
            bodyStructure: { type: 'multipart/mixed', blobId: null, subParts: [] },
            'header:Authentication-Results:asText': '',
            'header:Received-SPF:asText': '',
            'header:DKIM-Signature:asText': '',
          },
        ]),
      })
    );

    const handle = await provider.getMessageSource('account-1', 'message-1');

    expect(handle).not.toBeNull();
    expect(handle?.size).toBe(4321);
  });

  it('returns null when the message is outside the account scope', async () => {
    const provider = new StalwartJMAPProvider();
    withMockedClient(provider, mockClient({ getEmails: vi.fn().mockResolvedValue([]) }));

    const handle = await provider.getMessageSource('account-1', 'missing');

    expect(handle).toBeNull();
  });
});
