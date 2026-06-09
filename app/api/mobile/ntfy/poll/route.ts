import { NextRequest, NextResponse } from 'next/server';
import { OAuthDiscovery } from '@/lib/oauth-discovery';
import { JMAPClient } from '@/providers/stalwart-jmap/jmap-client';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/client-ip';
import { checkRateLimit } from '@/lib/rate-limit';
import { SecurityLogger } from '@/lib/security-logger';

type IntrospectionResponse = {
  active?: boolean;
  account_id?: string;
  accountId?: string;
  sub?: string;
  username?: string;
  email?: string;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractAccountIdFromTopic(topic: string, topicPattern: string): string | null {
  const placeholder = '{accountId}';
  const placeholderIndex = topicPattern.indexOf(placeholder);

  if (placeholderIndex === -1 || topicPattern.indexOf(placeholder, placeholderIndex + placeholder.length) !== -1) {
    return null;
  }

  const prefix = topicPattern.slice(0, placeholderIndex);
  const suffix = topicPattern.slice(placeholderIndex + placeholder.length);
  const pattern = `^${escapeRegExp(prefix)}(.+)${escapeRegExp(suffix)}$`;
  const match = topic.match(new RegExp(pattern));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getDiscoveryUrl(): string | null {
  const baseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
  let discoveryUrl = process.env.OAUTH_DISCOVERY_URL;

  if (!discoveryUrl || discoveryUrl.includes('example.com')) {
    discoveryUrl = `${trimTrailingSlashes(baseUrl)}/.well-known/oauth-authorization-server`;
  }

  return discoveryUrl || null;
}

function claimMatchesAccount(introspection: IntrospectionResponse, accountId: string): boolean | null {
  const claims = [
    introspection.account_id,
    introspection.accountId,
    introspection.sub,
    introspection.username,
    introspection.email,
  ].filter((claim): claim is string => typeof claim === 'string' && claim.length > 0);

  if (claims.length === 0) {
    return null;
  }

  return claims.includes(accountId);
}

async function introspectAccessToken(accessToken: string): Promise<IntrospectionResponse | null> {
  const discoveryUrl = getDiscoveryUrl();
  if (!discoveryUrl) {
    return null;
  }

  const discovery = new OAuthDiscovery(discoveryUrl);
  const endpoints = await discovery.discover();
  if (!endpoints.introspection_endpoint) {
    return null;
  }

  const body = new URLSearchParams({ token: accessToken });
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const clientId = process.env.OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.OAUTH_CLIENT_SECRET?.trim();
  if (clientId) {
    body.set('client_id', clientId);
  }
  if (clientId && clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  const response = await fetch(endpoints.introspection_endpoint, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    logger.warn('[mobile ntfy] OAuth introspection failed', { status: response.status });
    return { active: false };
  }

  return (await response.json()) as IntrospectionResponse;
}

async function tokenHasJmapAccount(accessToken: string, accountId: string): Promise<boolean> {
  const baseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
  const client = new JMAPClient(baseUrl, '', accessToken, accountId, 'bearer');
  const session = await client.getSession();

  return Object.prototype.hasOwnProperty.call(session.accounts || {}, accountId)
    || session.primaryAccounts?.mail === accountId;
}

async function validateAccessTokenForAccount(accessToken: string, accountId: string): Promise<boolean> {
  try {
    const introspection = await introspectAccessToken(accessToken);

    if (introspection) {
      if (!introspection.active) {
        return false;
      }

      const claimMatch = claimMatchesAccount(introspection, accountId);
      if (claimMatch !== null) {
        return claimMatch;
      }
    }

    if (process.env.MOBILE_NTFY_ALLOW_JMAP_TOKEN_VALIDATION === 'true') {
      return await tokenHasJmapAccount(accessToken, accountId);
    }

    logger.warn('[mobile ntfy] OAuth introspection endpoint or account claim is unavailable; refusing JMAP bearer fallback by default');
    return false;
  } catch (error) {
    logger.warn('[mobile ntfy] access token validation failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, 'mobile_ntfy_poll', request);
  if (!rl.allowed) {
    SecurityLogger.logRateLimitRejected(request, ip, 'mobile_ntfy_poll', 'rate_limit', {
      resetAt: rl.resetAt,
      blockedUntil: rl.blockedUntil,
    });
    return NextResponse.json(
      { error: 'Too many requests', resetAt: rl.resetAt, blockedUntil: rl.blockedUntil },
      { status: 429 }
    );
  }

  try {
    const accessToken = getBearerToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const topic = request.nextUrl.searchParams.get('topic')?.trim();
    const since = request.nextUrl.searchParams.get('since')?.trim() || 'latest';

    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }
    if (!since || /[\r\n]/.test(since)) {
      return NextResponse.json({ error: 'invalid since' }, { status: 400 });
    }

    const topicPattern = process.env.NTFY_TOPIC_PATTERN?.trim() || 'homemail-user-{accountId}';
    const accountId = extractAccountIdFromTopic(topic, topicPattern);
    if (!accountId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const authorized = await validateAccessTokenForAccount(accessToken, accountId);
    if (!authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ntfyUrl = process.env.NTFY_URL?.trim();
    const ntfyToken = process.env.NTFY_TOKEN?.trim();
    if (!ntfyUrl || !ntfyToken) {
      logger.error('[mobile ntfy] NTFY_URL or NTFY_TOKEN is not configured');
      return NextResponse.json({ error: 'Push polling is not configured' }, { status: 503 });
    }

    const upstreamUrl = new URL(`${trimTrailingSlashes(ntfyUrl)}/${encodeURIComponent(topic)}/json`);
    upstreamUrl.searchParams.set('poll', '1');
    upstreamUrl.searchParams.set('since', since);

    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/x-ndjson, application/json',
        Authorization: `Bearer ${ntfyToken}`,
      },
    });

    if (!upstreamResponse.ok) {
      logger.warn('[mobile ntfy] ntfy polling failed', { status: upstreamResponse.status });
      return NextResponse.json({ error: 'Push polling failed' }, { status: 502 });
    }

    const body = await upstreamResponse.text();
    const safeBody = body.includes(ntfyToken)
      ? body.split(ntfyToken).join('[redacted]')
      : body;

    return new NextResponse(safeBody, {
      status: 200,
      headers: {
        'Content-Type': upstreamResponse.headers.get('content-type') || 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logger.error('[mobile ntfy] poll failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Push polling failed' }, { status: 500 });
  }
}
