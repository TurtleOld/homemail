import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  featureEnabled: vi.fn(),
  findRecentStateByIp: vi.fn(),
  storeOAuthState: vi.fn(),
  checkRateLimit: vi.fn(),
  discover: vi.fn(),
}));

vi.mock('@/lib/feature-flags', () => ({ isRedesignFeatureEnabled: mocks.featureEnabled }));
vi.mock('@/lib/oauth-state-store', () => ({
  findRecentStateByIp: mocks.findRecentStateByIp,
  storeOAuthState: mocks.storeOAuthState,
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/client-ip', () => ({ getClientIp: () => '203.0.113.10' }));
vi.mock('@/lib/security-logger', () => ({
  SecurityLogger: { logRateLimitRejected: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/oauth-discovery', () => ({
  OAuthDiscovery: class {
    discover() {
      return mocks.discover();
    }
  },
}));

import { GET } from '@/app/api/auth/oauth/authorize/route';

function request() {
  return new NextRequest('https://mail.pavlovteam.ru/api/auth/oauth/authorize');
}

describe('OAuth authorize family-identity scope and nonce', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.STALWART_BASE_URL = 'http://stalwart:8080';
    process.env.STALWART_PUBLIC_URL = 'https://auth.pavlovteam.ru';
    process.env.OAUTH_CLIENT_ID = 'mailclient';
    process.env.OAUTH_REDIRECT_URI = 'https://mail.pavlovteam.ru/api/auth/oauth/callback';

    mocks.checkRateLimit.mockReturnValue({ allowed: true });
    mocks.findRecentStateByIp.mockResolvedValue(null);
    mocks.discover.mockResolvedValue({
      issuer: 'https://auth.pavlovteam.ru',
      authorization_endpoint: 'https://auth.pavlovteam.ru/auth/authorize',
      token_endpoint: 'https://auth.pavlovteam.ru/auth/token',
    });
  });

  it('does not request openid scope or a nonce when familyIdentity is disabled', async () => {
    mocks.featureEnabled.mockReturnValue(false);

    const response = await GET(request());
    const location = new URL(response.headers.get('location')!);

    expect(location.searchParams.get('scope')).not.toContain('openid');
    expect(location.searchParams.has('nonce')).toBe(false);
    expect(mocks.storeOAuthState).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ nonce: undefined }),
    );
  });

  it('requests openid scope and a nonce when familyIdentity is enabled', async () => {
    mocks.featureEnabled.mockImplementation((flag: string) => flag === 'familyIdentity');

    const response = await GET(request());
    const location = new URL(response.headers.get('location')!);

    expect(location.searchParams.get('scope')?.split(' ')).toContain('openid');
    const nonce = location.searchParams.get('nonce');
    expect(nonce).toBeTruthy();
    expect(mocks.storeOAuthState).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ nonce }),
    );
  });
});
