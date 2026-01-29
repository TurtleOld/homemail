import { NextRequest, NextResponse } from 'next/server';
import { DeviceFlowClient } from '@/lib/oauth-device-flow';
import { OAuthJMAPClient } from '@/lib/oauth-jmap-client';
import { validateOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/client-ip';
import { checkRateLimit } from '@/lib/rate-limit';
import { SecurityLogger } from '@/lib/security-logger';

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, 'oauth_poll', request);
  if (!rl.allowed) {
    SecurityLogger.logRateLimitRejected(request, ip, 'oauth_poll', 'rate_limit', {
      resetAt: rl.resetAt,
      blockedUntil: rl.blockedUntil,
    });
    return NextResponse.json(
      { error: 'Too many requests', resetAt: rl.resetAt, blockedUntil: rl.blockedUntil },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { deviceCode, accountId, interval, expiresIn } = body;

    if (!deviceCode || !accountId) {
      return NextResponse.json(
        { error: 'deviceCode and accountId are required' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
    const isInternalBaseUrl = baseUrl.includes('stalwart') || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || /^http:\/\/\d+\.\d+\.\d+\.\d+/.test(baseUrl);
    
    let discoveryUrl = process.env.OAUTH_DISCOVERY_URL;
    let isPublicDiscoveryUrl = false;
    
    if (discoveryUrl) {
      try {
        const url = new URL(discoveryUrl);
        isPublicDiscoveryUrl = url.protocol === 'https:' && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1') && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
      } catch {
      }
    }
    
    if (!discoveryUrl || discoveryUrl.includes('example.com')) {
      if (isInternalBaseUrl) {
        discoveryUrl = baseUrl.replace(/\/$/, '') + '/.well-known/oauth-authorization-server';
        logger.info(`[OAuth] Using internal discovery URL from STALWART_BASE_URL: ${discoveryUrl}`);
      } else {
        const publicUrl = process.env.STALWART_PUBLIC_URL;
        if (publicUrl) {
          discoveryUrl = publicUrl.replace(/\/$/, '') + '/.well-known/oauth-authorization-server';
          logger.info(`[OAuth] Discovery URL determined from STALWART_PUBLIC_URL: ${discoveryUrl}`);
        } else {
          logger.error(`[OAuth] Discovery URL not configured. OAUTH_DISCOVERY_URL: ${process.env.OAUTH_DISCOVERY_URL || 'not set'}, STALWART_PUBLIC_URL: ${process.env.STALWART_PUBLIC_URL || 'not set'}, STALWART_BASE_URL: ${baseUrl}`);
        }
      }
    } else if (isPublicDiscoveryUrl && isInternalBaseUrl) {
      const internalDiscoveryUrl = baseUrl.replace(/\/$/, '') + '/.well-known/oauth-authorization-server';
      logger.info(`[OAuth] OAUTH_DISCOVERY_URL is public (${process.env.OAUTH_DISCOVERY_URL}), but STALWART_BASE_URL is internal. Using internal URL for request: ${internalDiscoveryUrl}`);
      logger.info(`[OAuth] Public URL will be used for normalizing endpoints in discovery response`);
      discoveryUrl = internalDiscoveryUrl;
    }
    const clientId = process.env.OAUTH_CLIENT_ID || '';

    if (!discoveryUrl || !clientId) {
      logger.error(`[OAuth] Configuration missing. discoveryUrl: ${discoveryUrl || 'not set'}, clientId: ${clientId || 'not set'}`);
      return NextResponse.json(
        { 
          error: 'OAuth configuration missing',
          details: {
            discoveryUrl: discoveryUrl ? 'set' : 'not set',
            clientId: clientId ? 'set' : 'not set',
            stalwartPublicUrl: process.env.STALWART_PUBLIC_URL ? 'set' : 'not set',
          },
          hint: 'Please set STALWART_PUBLIC_URL (e.g., https://mail.example.com) or OAUTH_DISCOVERY_URL, and OAUTH_CLIENT_ID'
        },
        { status: 500 }
      );
    }

    const deviceFlow = new DeviceFlowClient(
      discoveryUrl,
      clientId,
      ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'offline_access']
    );

    const pollResult = await deviceFlow.pollForToken(
      deviceCode,
      interval || 5,
      expiresIn || 600
    );

    if (!pollResult.success) {
      return NextResponse.json({
        success: false,
        error: pollResult.error.error,
        errorDescription: pollResult.error.error_description,
        retry: pollResult.retry,
      });
    }

    const expiresAt = pollResult.token.expires_in 
      ? Date.now() + (pollResult.token.expires_in * 1000)
      : undefined;

    const { OAuthTokenStore } = await import('@/lib/oauth-token-store');
    const tokenStore = new OAuthTokenStore();
    
    await tokenStore.saveToken(accountId, {
      accessToken: pollResult.token.access_token,
      tokenType: pollResult.token.token_type,
      expiresAt,
      refreshToken: pollResult.token.refresh_token,
      scopes: pollResult.token.scope?.split(' ') || ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'offline_access'],
    });

    const oauthClient = new OAuthJMAPClient({
      discoveryUrl,
      clientId,
      scopes: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'offline_access'],
      baseUrl: baseUrl,
      accountId,
    });

    try {
      const jmapClient = await oauthClient.getJMAPClient();
      const session = await jmapClient.getSession();

      let account: any;
      if (session.primaryAccounts?.mail) {
        account = session.accounts[session.primaryAccounts.mail];
      } else {
        const accountKeys = Object.keys(session.accounts);
        if (accountKeys.length > 0) {
          account = session.accounts[accountKeys[0]];
        }
      }

      if (!account) {
        return NextResponse.json(
          { error: 'No account found in session' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        account: {
          id: account.id || accountId,
          email: account.name || accountId,
          displayName: account.name || accountId.split('@')[0],
        },
      });
    } catch (sessionError) {
      logger.error('Error getting session after OAuth:', sessionError);
      return NextResponse.json(
        { error: 'Failed to get JMAP session after authorization' },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error('Error polling for token:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to poll for token: ${errorMessage}` },
      { status: 500 }
    );
  }
}
