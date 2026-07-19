import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  featureEnabled: vi.fn(),
  consumeOAuthState: vi.fn(),
  isStateRecentlyConsumed: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  discover: vi.fn(),
  saveToken: vi.fn(),
  getToken: vi.fn(),
  jmapGetSession: vi.fn(),
  addUserAccount: vi.fn(),
  setActiveAccount: vi.fn(),
  logLoginSuccess: vi.fn(),
  logLoginFailed: vi.fn(),
  validateOidcIdToken: vi.fn(),
  bootstrapAdministratorIfConfigured: vi.fn(),
  jwksGetKeys: vi.fn(),
}));

vi.mock('@/lib/feature-flags', () => ({ isRedesignFeatureEnabled: mocks.featureEnabled }));
vi.mock('@/lib/oauth-state-store', () => ({
  consumeOAuthState: mocks.consumeOAuthState,
  isStateRecentlyConsumed: mocks.isStateRecentlyConsumed,
}));
vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  createSession: mocks.createSession,
}));
vi.mock('@/lib/oauth-discovery', () => ({
  OAuthDiscovery: class {
    discover() {
      return mocks.discover();
    }
  },
}));
vi.mock('@/lib/oauth-token-store', () => ({
  OAuthTokenStore: class {
    saveToken(...args: unknown[]) {
      return mocks.saveToken(...args);
    }
    getToken(...args: unknown[]) {
      return mocks.getToken(...args);
    }
  },
}));
vi.mock('@/providers/stalwart-jmap/jmap-client', () => ({
  JMAPClient: class {
    getSession() {
      return mocks.jmapGetSession();
    }
  },
}));
vi.mock('@/lib/storage', () => ({
  addUserAccount: mocks.addUserAccount,
  setActiveAccount: mocks.setActiveAccount,
}));
vi.mock('@/lib/security-logger', () => ({
  SecurityLogger: {
    logLoginSuccess: mocks.logLoginSuccess,
    logLoginFailed: mocks.logLoginFailed,
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/oidc-id-token-validator', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/oidc-id-token-validator')>();
  return { ...original, validateOidcIdToken: mocks.validateOidcIdToken };
});
vi.mock('@/lib/oidc-jwks-provider', () => ({
  HttpJwksProvider: class {
    getKeys() {
      return mocks.jwksGetKeys();
    }
  },
}));
vi.mock('@/lib/admin-bootstrap', () => ({
  bootstrapAdministratorIfConfigured: mocks.bootstrapAdministratorIfConfigured,
}));

import { GET } from '@/app/api/auth/oauth/callback/route';

function request() {
  return new NextRequest('https://mail.pavlovteam.ru/api/auth/oauth/callback?code=auth-code&state=state-value');
}

describe('OAuth callback family-identity linking', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.STALWART_BASE_URL = 'http://stalwart:8080';
    process.env.STALWART_PUBLIC_URL = 'https://auth.pavlovteam.ru';
    process.env.OAUTH_CLIENT_ID = 'mailclient';
    process.env.OAUTH_REDIRECT_URI = 'https://mail.pavlovteam.ru/api/auth/oauth/callback';

    mocks.discover.mockResolvedValue({
      issuer: 'https://auth.pavlovteam.ru',
      token_endpoint: 'https://auth.pavlovteam.ru/auth/token',
      jwks_uri: 'https://auth.pavlovteam.ru/auth/jwks.json',
    });
    mocks.consumeOAuthState.mockResolvedValue({ codeVerifier: 'verifier-value', nonce: 'nonce-value' });
    mocks.jmapGetSession.mockResolvedValue({
      primaryAccounts: { mail: 'account-1' },
      accounts: { 'account-1': { name: 'alexander.pavlov@pavlovteam.ru' } },
    });
    mocks.getToken.mockResolvedValue({ accessToken: 'access-token' });
    mocks.createSession.mockResolvedValue('session-id');

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === 'https://auth.pavlovteam.ru/auth/token') {
        return {
          ok: true,
          json: async () => ({
            access_token: 'access-token',
            token_type: 'Bearer',
            id_token: 'header.claims.signature',
          }),
        };
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));
  });

  it('does not attempt ID-token validation when familyIdentity is disabled', async () => {
    mocks.featureEnabled.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(307); // redirect
    expect(mocks.validateOidcIdToken).not.toHaveBeenCalled();
    expect(mocks.bootstrapAdministratorIfConfigured).not.toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenCalledWith('account-1', 'alexander.pavlov@pavlovteam.ru', expect.anything());
  });

  it('validates the ID token and bootstraps the administrator when familyIdentity is enabled', async () => {
    mocks.featureEnabled.mockImplementation((flag: string) => flag === 'familyIdentity');
    mocks.validateOidcIdToken.mockResolvedValue({
      issuer: 'https://auth.pavlovteam.ru',
      subject: 'e',
      email: 'alexander.pavlov@pavlovteam.ru',
    });
    mocks.bootstrapAdministratorIfConfigured.mockResolvedValue({
      kind: 'bootstrapped',
      identity: { id: 'identity-1', role: 'administrator' },
    });

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(mocks.validateOidcIdToken).toHaveBeenCalledWith('header.claims.signature', expect.objectContaining({
      issuer: 'https://auth.pavlovteam.ru',
      audience: 'mailclient',
      nonce: 'nonce-value',
    }));
    expect(mocks.bootstrapAdministratorIfConfigured).toHaveBeenCalledWith({
      issuer: 'https://auth.pavlovteam.ru',
      subject: 'e',
      email: 'alexander.pavlov@pavlovteam.ru',
    });
    // Legacy login still completes normally alongside linking.
    expect(mocks.createSession).toHaveBeenCalledWith('account-1', 'alexander.pavlov@pavlovteam.ru', expect.anything());
  });

  it('continues the legacy sign-in even when ID-token validation fails', async () => {
    mocks.featureEnabled.mockImplementation((flag: string) => flag === 'familyIdentity');
    mocks.validateOidcIdToken.mockRejectedValue(new Error('signature invalid'));

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).not.toContain('error_code');
    expect(mocks.bootstrapAdministratorIfConfigured).not.toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenCalledWith('account-1', 'alexander.pavlov@pavlovteam.ru', expect.anything());
  });

  it('does not validate an ID token when the provider did not return one, even with the flag enabled', async () => {
    mocks.featureEnabled.mockImplementation((flag: string) => flag === 'familyIdentity');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'access-token', token_type: 'Bearer' }),
    })));

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(mocks.validateOidcIdToken).not.toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenCalled();
  });
});
