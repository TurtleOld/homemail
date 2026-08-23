import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDiscovery: vi.fn(),
  getToken: vi.fn(),
  saveToken: vi.fn(),
}));

vi.mock('@/lib/oauth-device-flow', () => ({
  DeviceFlowClient: class {
    getDiscovery = mocks.getDiscovery;
  },
}));

vi.mock('@/lib/oauth-token-store', () => ({
  OAuthTokenStore: class {
    getToken = mocks.getToken;
    saveToken = mocks.saveToken;
  },
}));

import { OAuthJMAPClient } from '@/lib/oauth-jmap-client';

describe('OAuthJMAPClient.refreshToken', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    originalFetch = globalThis.fetch;
    mocks.getDiscovery.mockResolvedValue({ token_endpoint: 'https://idp.example.test/token' });
    mocks.getToken.mockResolvedValue({
      accessToken: 'stale-access-token',
      refreshToken: 'refresh-token-v1',
      expiresAt: Date.now() - 1000,
    });
    mocks.saveToken.mockResolvedValue(undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deduplicates concurrent refreshes for the same account into a single token-endpoint request', async () => {
    let fetchCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(
        JSON.stringify({ access_token: 'new-access-token', refresh_token: 'refresh-token-v2', expires_in: 3600 }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const client = new OAuthJMAPClient({
      discoveryUrl: 'https://idp.example.test/.well-known/oauth-authorization-server',
      clientId: 'client-1',
      baseUrl: 'https://stalwart.example.test',
      accountId: 'account-1',
    });

    // Simulate two independent pollers racing to refresh the same expired
    // token at the same time.
    await Promise.all([client.refreshToken(), client.refreshToken()]);

    expect(fetchCalls).toBe(1);
    expect(mocks.saveToken).toHaveBeenCalledTimes(1);
    expect(mocks.saveToken).toHaveBeenCalledWith(
      'account-1',
      expect.objectContaining({ accessToken: 'new-access-token', refreshToken: 'refresh-token-v2' })
    );
  });

  it('never redeems the same refresh token twice across separate client instances racing concurrently', async () => {
    const redeemedRefreshTokens: string[] = [];
    globalThis.fetch = vi.fn(async (_url, init: RequestInit) => {
      const params = new URLSearchParams(init.body as string);
      redeemedRefreshTokens.push(params.get('refresh_token')!);
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(
        JSON.stringify({ access_token: 'new-access-token', refresh_token: 'refresh-token-v2', expires_in: 3600 }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const configFor = (accountId: string) => ({
      discoveryUrl: 'https://idp.example.test/.well-known/oauth-authorization-server',
      clientId: 'client-1',
      baseUrl: 'https://stalwart.example.test',
      accountId,
    });

    // stalwart-provider.ts creates a fresh OAuthJMAPClient per getClient()
    // call, so two "pollers" for the same account are two instances, not
    // one — the dedup key must be the account, not the instance.
    const pollerA = new OAuthJMAPClient(configFor('account-1'));
    const pollerB = new OAuthJMAPClient(configFor('account-1'));

    await Promise.all([pollerA.refreshToken(), pollerB.refreshToken()]);

    expect(redeemedRefreshTokens).toEqual(['refresh-token-v1']);
  });

  it('stops hitting the token endpoint for a confirmed-dead refresh token until the cooldown elapses', async () => {
    let fetchCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    }) as unknown as typeof fetch;

    const client = new OAuthJMAPClient({
      discoveryUrl: 'https://idp.example.test/.well-known/oauth-authorization-server',
      clientId: 'client-1',
      baseUrl: 'https://stalwart.example.test',
      accountId: 'account-cooldown',
    });

    await expect(client.refreshToken()).rejects.toThrow(/invalid_grant/);
    expect(fetchCalls).toBe(1);

    // A second poller (or the same one on the next 15s tick) tries again
    // before the cooldown elapses.
    await expect(client.refreshToken()).rejects.toThrow(/invalid_grant/);
    expect(fetchCalls).toBe(1);
  });

  it('retries immediately after a transient failure, without engaging the cooldown', async () => {
    let fetchCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCalls += 1;
      return new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
    }) as unknown as typeof fetch;

    const client = new OAuthJMAPClient({
      discoveryUrl: 'https://idp.example.test/.well-known/oauth-authorization-server',
      clientId: 'client-1',
      baseUrl: 'https://stalwart.example.test',
      accountId: 'account-transient',
    });

    await expect(client.refreshToken()).rejects.toThrow();
    await expect(client.refreshToken()).rejects.toThrow();

    expect(fetchCalls).toBe(2);
  });
});
