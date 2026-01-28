import { NextRequest, NextResponse } from 'next/server';
import { OAuthDiscovery } from '@/lib/oauth-discovery';
import { generateCodeVerifier, generateCodeChallenge, generateState, buildAuthorizationUrl } from '@/lib/oauth-pkce';
import { storeOAuthState } from '@/lib/oauth-state-store';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/client-ip';
import { checkRateLimit } from '@/lib/rate-limit';
import { SecurityLogger } from '@/lib/security-logger';

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
    // 1. Get configuration from environment (NEVER hardcode!)
    const baseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
    const publicUrl = process.env.STALWART_PUBLIC_URL;
    const clientId = process.env.OAUTH_CLIENT_ID;
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    if (!publicUrl || !clientId || !redirectUri) {
      logger.error('[OAuth] Missing required configuration', {
        hasPublicUrl: !!publicUrl,
        hasClientId: !!clientId,
        hasRedirectUri: !!redirectUri,
      });
      return NextResponse.json(
        { 
          error: 'OAuth configuration incomplete',
          hint: 'Please set STALWART_PUBLIC_URL, OAUTH_CLIENT_ID, and OAUTH_REDIRECT_URI in environment'
        },
        { status: 500 }
      );
    }

    // 2. Determine discovery URL (internal for server-side requests)
    const isInternalBaseUrl = baseUrl.includes('stalwart') || 
                              baseUrl.includes('localhost') || 
                              baseUrl.includes('127.0.0.1') || 
                              /^http:\/\/\d+\.\d+\.\d+\.\d+/.test(baseUrl);
    
    const discoveryUrl = isInternalBaseUrl 
      ? `${baseUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`
      : `${publicUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;

    logger.info(`[OAuth Authorize] Using discovery URL: ${discoveryUrl}`);

    // 3. Discover OAuth endpoints
    const discovery = new OAuthDiscovery(discoveryUrl);
    const endpoints = await discovery.discover();

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

    logger.info('[OAuth Authorize] Generated PKCE parameters', {
      state: state.substring(0, 8) + '...',
      verifierLength: codeVerifier.length,
      challengeLength: codeChallenge.length,
    });

    // 5. Store state + verifier (encrypted, temporary)
    await storeOAuthState(state, codeVerifier);

    // 6. Build authorization URL
    const authorizationUrl = buildAuthorizationUrl({
      authorizationEndpoint: endpoints.authorization_endpoint,
      clientId,
      redirectUri,
      scopes: [
        'urn:ietf:params:jmap:core',
        'urn:ietf:params:jmap:mail',
        'offline_access',
      ],
      state,
      codeChallenge,
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
    logger.error('[OAuth Authorize] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { error: `Failed to initiate authorization: ${errorMessage}` },
      { status: 500 }
    );
  }
}
