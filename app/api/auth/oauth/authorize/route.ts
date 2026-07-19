import { NextRequest, NextResponse } from 'next/server';
import { OAuthDiscovery } from '@/lib/oauth-discovery';
import { generateCodeVerifier, generateCodeChallenge, generateState, generateNonce, buildAuthorizationUrl } from '@/lib/oauth-pkce';
import { storeOAuthState, findRecentStateByIp } from '@/lib/oauth-state-store';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/client-ip';
import { checkRateLimit } from '@/lib/rate-limit';
import { SecurityLogger } from '@/lib/security-logger';
import { isRedesignFeatureEnabled } from '@/lib/feature-flags';

function uniqueUrls(urls: Array<string | undefined | null>): string[] {
  return Array.from(new Set(urls.filter((url): url is string => !!url)));
}

/**
 * GET /api/auth/oauth/authorize
 * 
 * Initiates OAuth 2.1 Authorization Code Flow with PKCE
 * Redirects user to Stalwart authorization endpoint
 * 
 * Note: No CSRF validation needed for GET requests.
 * Security is ensured through PKCE (code_challenge/code_verifier) and state parameter.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, 'api', request);
  if (!rl.allowed) {
    SecurityLogger.logRateLimitRejected(request, ip, 'api', 'rate_limit', {
      resetAt: rl.resetAt,
      blockedUntil: rl.blockedUntil,
    });
    return NextResponse.json(
      { error: 'Too many requests', resetAt: rl.resetAt, blockedUntil: rl.blockedUntil },
      { status: 429 }
    );
  }

  try {
    // 0. Deduplication: check if this IP already has a recent authorize request
    const existingUrl = await findRecentStateByIp(ip);
    if (existingUrl) {
      logger.info('[OAuth Authorize] Reusing recent authorization URL for same IP (duplicate request)', { ip });
      return NextResponse.redirect(existingUrl);
    }

    // 1. Get configuration from environment (NEVER hardcode!)
    const baseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
    const publicUrl = process.env.STALWART_PUBLIC_URL;
    const clientId = process.env.OAUTH_CLIENT_ID;
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    if (!publicUrl || !clientId || !redirectUri) {
      logger.error('[OAuth] Missing required configuration — check STALWART_PUBLIC_URL, OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI', {
        hasPublicUrl: !!publicUrl,
        hasClientId: !!clientId,
        hasRedirectUri: !!redirectUri,
      });
      return NextResponse.json({ error: 'OAuth configuration error' }, { status: 500 });
    }

    // 2. Determine discovery URL (internal for server-side requests)
    const isInternalBaseUrl = baseUrl.includes('stalwart') ||
                              baseUrl.includes('localhost') ||
                              baseUrl.includes('127.0.0.1') ||
                              /^http:\/\/\d+\.\d+\.\d+\.\d+/.test(baseUrl);

    const internalDiscoveryUrl = `${baseUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;
    const publicDiscoveryUrl = `${publicUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;
    const explicitDiscoveryUrl = process.env.OAUTH_DISCOVERY_URL && !process.env.OAUTH_DISCOVERY_URL.includes('example.com')
      ? process.env.OAUTH_DISCOVERY_URL
      : undefined;
    const discoveryUrls = uniqueUrls([
      explicitDiscoveryUrl,
      isInternalBaseUrl ? internalDiscoveryUrl : publicDiscoveryUrl,
      publicDiscoveryUrl,
    ]);

    logger.info('[OAuth Authorize] Using discovery URLs', { discoveryUrls });

    // 3. Discover OAuth endpoints
    let discoveryUrl = discoveryUrls[0];
    let endpoints: Awaited<ReturnType<OAuthDiscovery['discover']>> | null = null;
    let lastDiscoveryError: unknown = null;

    for (const candidate of discoveryUrls) {
      try {
        discoveryUrl = candidate;
        endpoints = await new OAuthDiscovery(candidate).discover();
        break;
      } catch (error) {
        lastDiscoveryError = error;
        logger.warn('[OAuth Authorize] Discovery candidate failed', {
          discoveryUrl: candidate,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!endpoints) {
      throw lastDiscoveryError instanceof Error ? lastDiscoveryError : new Error('OAuth discovery failed');
    }

    if (!endpoints.authorization_endpoint) {
      logger.error('[OAuth Authorize] Discovery response missing authorization_endpoint', {
        discoveryUrl,
        endpoints: {
          issuer: endpoints.issuer,
          hasAuthorizationEndpoint: !!endpoints.authorization_endpoint,
          hasTokenEndpoint: !!endpoints.token_endpoint,
          hasDeviceEndpoint: !!endpoints.device_authorization_endpoint,
        }
      });
      throw new Error('authorization_endpoint not found in discovery response');
    }

    // 4. Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    // When family identity is enabled, also request an ID token and bind a
    // nonce to this authorization request so the callback can validate it
    // via validateOidcIdToken. The legacy access-token-only flow is
    // unaffected when the flag is disabled.
    const familyIdentityEnabled = isRedesignFeatureEnabled('familyIdentity');
    const nonce = familyIdentityEnabled ? generateNonce() : undefined;

    logger.info('[OAuth Authorize] Generated PKCE parameters', {
      state: state.substring(0, 8) + '...',
      verifierLength: codeVerifier.length,
      challengeLength: codeChallenge.length,
      requestsIdToken: familyIdentityEnabled,
    });

    // 5. Build authorization URL
    const authorizationUrl = buildAuthorizationUrl({
      authorizationEndpoint: endpoints.authorization_endpoint,
      clientId,
      redirectUri,
      scopes: [
        'urn:ietf:params:jmap:core',
        'urn:ietf:params:jmap:mail',
        'offline_access',
        ...(familyIdentityEnabled ? ['openid'] : []),
      ],
      state,
      codeChallenge,
      nonce,
    });

    // 6. Store state + verifier (encrypted, temporary) with IP and URL for deduplication
    await storeOAuthState(state, codeVerifier, {
      clientIp: ip,
      authorizationUrl: authorizationUrl.toString(),
      nonce,
    });

    logger.info('[OAuth Authorize] Authorization URL generated', {
      endpoint: endpoints.authorization_endpoint,
      redirectUri,
    });

    // Log authorization initiation
    logger.info('[OAuth Authorize] User initiated authorization flow', { ip });

    // 7. Redirect to Stalwart OAuth authorization endpoint
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    logger.error('[OAuth Authorize] Error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to initiate authorization' }, { status: 500 });
  }
}
