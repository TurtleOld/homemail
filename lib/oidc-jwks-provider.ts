import type { OidcJwk, OidcJwksProvider } from '@/lib/oidc-id-token-validator';

const CACHE_TTL_MS = 10 * 60 * 1000;

interface JwksResponse {
  keys?: unknown;
}

function isOidcJwk(value: unknown): value is OidcJwk {
  return typeof value === 'object' && value !== null && typeof (value as { kty?: unknown }).kty === 'string';
}

/**
 * Fetches and short-term caches a JWKS document over HTTPS/HTTP.
 * Every returned entry is validated to at least have a string `kty`;
 * malformed entries are dropped rather than passed to the validator.
 */
export class HttpJwksProvider implements OidcJwksProvider {
  private cachedKeys: readonly OidcJwk[] | null = null;
  private cacheExpiresAt = 0;

  constructor(
    private readonly jwksUri: string,
    private readonly now: () => number = Date.now,
  ) {}

  async getKeys(): Promise<readonly OidcJwk[]> {
    if (this.cachedKeys && this.cacheExpiresAt > this.now()) {
      return this.cachedKeys;
    }

    const response = await fetch(this.jwksUri, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`JWKS fetch failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as JwksResponse;
    const rawKeys = Array.isArray(body.keys) ? body.keys : [];
    const keys = rawKeys.filter(isOidcJwk);

    this.cachedKeys = Object.freeze(keys);
    this.cacheExpiresAt = this.now() + CACHE_TTL_MS;
    return this.cachedKeys;
  }

  clearCache(): void {
    this.cachedKeys = null;
    this.cacheExpiresAt = 0;
  }
}
