import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns', () => ({
  lookup: (
    _hostname: string,
    _options: unknown,
    callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void
  ) => callback(null, [{ address: '127.0.0.1', family: 4 }]),
  resolve4: (_hostname: string, callback: (error: Error | null, addresses: string[]) => void) =>
    callback(null, ['127.0.0.1']),
  setServers: () => {},
}));

import { getJmapSessionCacheSize, JMAPClient } from '@/providers/stalwart-jmap/jmap-client';

const BASE_URL = 'http://127.0.0.1:8080';

function sessionPayload() {
  return {
    apiUrl: `${BASE_URL}/jmap`,
    downloadUrl: `${BASE_URL}/jmap/download`,
    uploadUrl: `${BASE_URL}/jmap/upload`,
    accounts: { 'account-93': { id: 'account-93', name: 'account-93' } },
    primaryAccounts: { mail: 'account-93' },
    capabilities: {},
  };
}

function clientFor(token: string): JMAPClient {
  return new JMAPClient(BASE_URL, '', token, 'account-93', 'bearer');
}

describe('JMAPClient session cache', () => {
  let originalFetch: typeof fetch;
  let authHeaders: string[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    authHeaders = [];
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      authHeaders.push((init?.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify(sessionPayload()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('keeps one entry per account when the OAuth token rotates and refetches with the new token', async () => {
    await clientFor('access-token-v1').getSession();
    expect(getJmapSessionCacheSize()).toBe(1);

    await clientFor('access-token-v2').getSession();

    expect(getJmapSessionCacheSize()).toBe(1);
    expect(authHeaders).toEqual(['Bearer access-token-v1', 'Bearer access-token-v2']);
  });
});
