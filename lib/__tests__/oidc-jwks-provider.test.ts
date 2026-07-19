import { describe, expect, it, vi, afterEach } from 'vitest';
import { HttpJwksProvider } from '@/lib/oidc-jwks-provider';

describe('HttpJwksProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and returns valid JWK entries', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ keys: [{ kty: 'EC', kid: 'default', crv: 'P-256', x: 'x', y: 'y' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new HttpJwksProvider('https://auth.pavlovteam.ru/auth/jwks.json');
    const keys = await provider.getKeys();

    expect(keys).toHaveLength(1);
    expect(keys[0].kty).toBe('EC');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops malformed entries without a string kty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ keys: [{ kid: 'no-kty' }, { kty: 'EC', kid: 'valid' }, null, 'not-an-object'] }),
    })));

    const provider = new HttpJwksProvider('https://auth.pavlovteam.ru/auth/jwks.json');
    const keys = await provider.getKeys();

    expect(keys).toHaveLength(1);
    expect(keys[0].kid).toBe('valid');
  });

  it('throws when the JWKS endpoint responds with a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' })));

    const provider = new HttpJwksProvider('https://auth.pavlovteam.ru/auth/jwks.json');
    await expect(provider.getKeys()).rejects.toThrow('JWKS fetch failed: 500');
  });

  it('caches keys and does not refetch before the TTL elapses', async () => {
    let now = 0;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ keys: [{ kty: 'EC', kid: 'default' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new HttpJwksProvider('https://auth.pavlovteam.ru/auth/jwks.json', () => now);

    await provider.getKeys();
    now += 60_000; // well within the 10-minute TTL
    await provider.getKeys();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache TTL has elapsed', async () => {
    let now = 0;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ keys: [{ kty: 'EC', kid: 'default' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new HttpJwksProvider('https://auth.pavlovteam.ru/auth/jwks.json', () => now);

    await provider.getKeys();
    now += 11 * 60 * 1000; // past the 10-minute TTL
    await provider.getKeys();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
