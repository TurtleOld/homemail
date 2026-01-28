import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OAuthDiscovery } from '@/lib/oauth-discovery';
import { consumeOAuthState } from '@/lib/oauth-state-store';
import { OAuthTokenStore } from '@/lib/oauth-token-store';
import { OAuthJMAPClient } from '@/lib/oauth-jmap-client';
import { createSession } from '@/lib/session';
import { addUserAccount, setActiveAccount, type UserAccount } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/client-ip';
import { SecurityLogger } from '@/lib/security-logger';

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

/**
 * GET /api/auth/oauth/callback
 * 
 * Handles OAuth callback from Stalwart: validates state, exchanges code for token
 * This is a server-side BFF endpoint - tokens never reach the frontend
 * 
 * Standard OAuth2 flow:
 * 1. User authorizes at Stalwart
 * 2. Stalwart redirects browser: GET /api/auth/oauth/callback?code=...&state=...
 * 3. Backend validates state, exchanges code for tokens (with PKCE)
 * 4. Backend stores tokens in server-side storage
 * 5. Backend creates httpOnly session cookie
 * 6. Backend responds with 302 redirect to /mail
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const searchParams = request.nextUrl.searchParams;

  try {
    // 1. Log full callback request for debugging
    logger.info('[OAuth Callback] Received callback request', {
      url: request.url,
      searchString: request.nextUrl.search,
    });

    // 2. Parse and validate query parameters
    const rawParams = {
      code: searchParams.get('code'),
      state: searchParams.get('state'),
      error: searchParams.get('error'),
      error_description: searchParams.get('error_description'),
    };

    logger.info('[OAuth Callback] Parsed parameters', {
      hasCode: !!rawParams.code,
      hasState: !!rawParams.state,
      hasError: !!rawParams.error,
      codeLength: rawParams.code?.length || 0,
      stateLength: rawParams.state?.length || 0,
    });

    // Handle OAuth errors from Stalwart
    if (rawParams.error) {
      const errorMsg = rawParams.error_description || `OAuth error: ${rawParams.error}`;
      logger.error('[OAuth Callback] Authorization error from provider', {
        error: rawParams.error,
        description: rawParams.error_description,
      });
      SecurityLogger.logLoginFailed(request, 'unknown', `OAuth provider error: ${rawParams.error}`);
      
      // Redirect to login with error
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', errorMsg);
      return NextResponse.redirect(loginUrl);
    }

    // Validate required parameters (BEFORE zod parsing to provide better error messages)
    if (!rawParams.code || !rawParams.state) {
      const missingParams = [];
      if (!rawParams.code) missingParams.push('code');
      if (!rawParams.state) missingParams.push('state');
      
      logger.error('[OAuth Callback] Missing required parameters', {
        missing: missingParams,
        fullUrl: request.url,
      });
      SecurityLogger.logLoginFailed(request, 'unknown', `Missing OAuth callback parameters: ${missingParams.join(', ')}`);
      
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'Authorization server did not return code and state. Check server logs.');
      return NextResponse.redirect(loginUrl);
    }

    const { code, state } = callbackSchema.parse(rawParams);

    logger.info('[OAuth Callback] Processing callback', {
      state: state.substring(0, 8) + '...',
      codeLength: code.length,
    });

    // 2. Validate and consume state (one-time use, CSRF protection)
    const codeVerifier = await consumeOAuthState(state);
    
    if (!codeVerifier) {
      logger.error('[OAuth Callback] Invalid or expired state', { state: state.substring(0, 8) + '...' });
      SecurityLogger.logLoginFailed(request, 'unknown', 'Invalid OAuth state (CSRF or expired)');
      
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'Invalid or expired state. Please try again.');
      return NextResponse.redirect(loginUrl);
    }

    logger.info('[OAuth Callback] State validated successfully');

    // 3. Get configuration from environment
    const baseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
    const publicUrl = process.env.STALWART_PUBLIC_URL;
    const clientId = process.env.OAUTH_CLIENT_ID;
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    if (!publicUrl || !clientId || !redirectUri) {
      logger.error('[OAuth Callback] Missing configuration');
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'OAuth configuration incomplete');
      return NextResponse.redirect(loginUrl);
    }

    // 4. Discover token endpoint
    const isInternalBaseUrl = baseUrl.includes('stalwart') || 
                              baseUrl.includes('localhost') || 
                              baseUrl.includes('127.0.0.1') || 
                              /^http:\/\/\d+\.\d+\.\d+\.\d+/.test(baseUrl);
    
    const discoveryUrl = isInternalBaseUrl 
      ? `${baseUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`
      : `${publicUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;

    const discovery = new OAuthDiscovery(discoveryUrl);
    const endpoints = await discovery.discover();

    if (!endpoints.token_endpoint) {
      throw new Error('token_endpoint not found in discovery response');
    }

    logger.info('[OAuth Callback] Exchanging code for token', {
      tokenEndpoint: endpoints.token_endpoint,
    });

    // 5. Exchange authorization code for tokens (with PKCE verifier)
    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'authorization_code');
    tokenBody.append('code', code);
    tokenBody.append('redirect_uri', redirectUri);
    tokenBody.append('client_id', clientId);
    tokenBody.append('code_verifier', codeVerifier); // PKCE proof

    const tokenResponse = await fetch(endpoints.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text().catch(() => '');
      logger.error('[OAuth Callback] Token exchange failed', {
        status: tokenResponse.status,
        error: errorText.substring(0, 200),
      });
      
      SecurityLogger.logLoginFailed(request, 'unknown', `Token exchange failed: ${tokenResponse.status}`);
      
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'Failed to exchange authorization code');
      return NextResponse.redirect(loginUrl);
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      logger.error('[OAuth Callback] No access_token in response');
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'Invalid token response');
      return NextResponse.redirect(loginUrl);
    }

    logger.info('[OAuth Callback] Tokens received successfully');

    // 6. Get user info from JMAP session
    const oauthClient = new OAuthJMAPClient({
      discoveryUrl,
      clientId,
      scopes: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'offline_access'],
      baseUrl,
      accountId: '', // Will be determined from session
    });

    // Temporarily store token to get session info
    const tokenStore = new OAuthTokenStore();
    const tempAccountId = 'temp-' + Date.now();
    
    await tokenStore.saveToken(tempAccountId, {
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type || 'Bearer',
      expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : undefined,
      refreshToken: tokenData.refresh_token,
      scopes: tokenData.scope?.split(' ') || ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
    });

    // Get JMAP session to determine account ID
    const jmapClient = await oauthClient.getJMAPClient();
    const jmapSession = await jmapClient.getSession();

    let account: any;
    let accountId: string;

    if (jmapSession.primaryAccounts?.mail) {
      const primaryAccountId = jmapSession.primaryAccounts.mail;
      account = jmapSession.accounts[primaryAccountId];
      accountId = primaryAccountId;
    } else {
      const accountKeys = Object.keys(jmapSession.accounts);
      if (accountKeys.length === 0) {
        throw new Error('No accounts found in JMAP session');
      }
      accountId = accountKeys[0];
      account = jmapSession.accounts[accountId];
    }

    const email = account.name || accountId;

    logger.info('[OAuth Callback] User account determined', { accountId, email });

    // 7. Store tokens with correct account ID
    await tokenStore.deleteToken(tempAccountId); // Remove temp
    await tokenStore.saveToken(accountId, {
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type || 'Bearer',
      expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : undefined,
      refreshToken: tokenData.refresh_token,
      scopes: tokenData.scope?.split(' ') || ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
    });

    // 8. Create app session (httpOnly cookie)
    const sessionId = await createSession(accountId, email, request);

    logger.info('[OAuth Callback] Session created', { sessionId, accountId, email });

    // 9. Store user account info
    const userAccount: UserAccount = {
      id: accountId,
      email,
      displayName: account.name || email.split('@')[0],
      addedAt: Date.now(),
      isActive: true,
    };

    await addUserAccount(email, userAccount);
    await setActiveAccount(email, accountId);

    SecurityLogger.logLoginSuccess(request, email, accountId);

    // 10. Redirect to mail inbox (standard OAuth flow - single redirect, no client-side navigation)
    const mailUrl = new URL('/mail', request.url);
    logger.info('[OAuth Callback] Redirecting to mail inbox');
    return NextResponse.redirect(mailUrl);

  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('[OAuth Callback] Validation error', { errors: error.errors });
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'Invalid callback parameters');
      return NextResponse.redirect(loginUrl);
    }

    logger.error('[OAuth Callback] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    SecurityLogger.logLoginFailed(request, 'unknown', `OAuth callback error: ${errorMessage}`);
    
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', `Authorization failed: ${errorMessage}`);
    return NextResponse.redirect(loginUrl);
  }
}
