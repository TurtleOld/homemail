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
});

/**
 * POST /api/auth/oauth/callback
 * 
 * Handles OAuth callback: validates state, exchanges code for token
 * This runs on backend (BFF) - tokens never reach frontend
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  try {
    const body = await request.json();
    const { code, state } = callbackSchema.parse(body);

    logger.info('[OAuth Callback] Processing callback', {
      state: state.substring(0, 8) + '...',
      codeLength: code.length,
    });

    // 1. Validate and consume state (one-time use, CSRF protection)
    const codeVerifier = await consumeOAuthState(state);
    
    if (!codeVerifier) {
      logger.error('[OAuth Callback] Invalid or expired state', { state: state.substring(0, 8) + '...' });
      SecurityLogger.logLoginFailed(request, 'unknown', 'Invalid OAuth state (CSRF or expired)');
      return NextResponse.json(
        { error: 'Invalid or expired state. Please try logging in again.' },
        { status: 400 }
      );
    }

    logger.info('[OAuth Callback] State validated successfully');

    // 2. Get configuration from environment
    const baseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
    const publicUrl = process.env.STALWART_PUBLIC_URL;
    const clientId = process.env.OAUTH_CLIENT_ID;
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    if (!publicUrl || !clientId || !redirectUri) {
      logger.error('[OAuth Callback] Missing configuration');
      return NextResponse.json(
        { error: 'OAuth configuration incomplete' },
        { status: 500 }
      );
    }

    // 3. Discover token endpoint
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

    // 4. Exchange authorization code for tokens (with PKCE verifier)
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
      
      return NextResponse.json(
        { error: 'Failed to exchange authorization code for token' },
        { status: 401 }
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      logger.error('[OAuth Callback] No access_token in response');
      return NextResponse.json(
        { error: 'Invalid token response' },
        { status: 500 }
      );
    }

    logger.info('[OAuth Callback] Tokens received successfully');

    // 5. Get user info from JMAP session
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

    // 6. Store tokens with correct account ID
    await tokenStore.deleteToken(tempAccountId); // Remove temp
    await tokenStore.saveToken(accountId, {
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type || 'Bearer',
      expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : undefined,
      refreshToken: tokenData.refresh_token,
      scopes: tokenData.scope?.split(' ') || ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
    });

    // 7. Create app session (httpOnly cookie)
    const sessionId = await createSession(accountId, email, request);

    logger.info('[OAuth Callback] Session created', { sessionId, accountId, email });

    // 8. Store user account info
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

    // 9. Return success (frontend will redirect to /mail)
    return NextResponse.json({
      success: true,
      account: {
        id: accountId,
        email,
        displayName: userAccount.displayName,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid callback parameters', details: error.errors },
        { status: 400 }
      );
    }

    logger.error('[OAuth Callback] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    SecurityLogger.logLoginFailed(request, 'unknown', `OAuth callback error: ${errorMessage}`);
    
    return NextResponse.json(
      { error: `Authorization failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
