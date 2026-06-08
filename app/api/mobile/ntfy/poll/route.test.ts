import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, extractAccountIdFromTopic } from './route';

function makeRequest(url: string, token?: string): NextRequest {
  return new NextRequest(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('mobile ntfy poll route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      STALWART_BASE_URL: 'https://mail.example.test',
      OAUTH_DISCOVERY_URL: 'https://mail.example.test/.well-known/oauth-authorization-server',
      OAUTH_CLIENT_ID: 'homemail-mobile',
      NTFY_URL: 'https://ntfy.example.test',
      NTFY_TOKEN: 'server-only-ntfy-token',
      NTFY_TOPIC_PATTERN: 'homemail-user-{accountId}',
    };
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('extracts accountId from configured topic pattern', () => {
    expect(extractAccountIdFromTopic('homemail-user-user@example.com', 'homemail-user-{accountId}'))
      .toBe('user@example.com');
    expect(extractAccountIdFromTopic('other-user@example.com', 'homemail-user-{accountId}'))
      .toBeNull();
  });

  it('returns 401 when Authorization bearer token is missing', async () => {
    const response = await GET(makeRequest('https://app.example.test/api/mobile/ntfy/poll?topic=homemail-user-user@example.com&since=latest'));

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 403 when token account and topic account do not match', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        issuer: 'https://mail.example.test',
        device_authorization_endpoint: 'https://mail.example.test/oauth/device',
        token_endpoint: 'https://mail.example.test/oauth/token',
        introspection_endpoint: 'https://mail.example.test/oauth/introspect',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        active: true,
        account_id: 'actual-account@example.com',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const response = await GET(makeRequest(
      'https://app.example.test/api/mobile/ntfy/poll?topic=homemail-user-other-account@example.com&since=latest',
      'valid-oauth-token'
    ));

    expect(response.status).toBe(403);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(await response.json())).not.toContain(process.env.NTFY_TOKEN);
  });

  it('proxies ntfy polling with server-side NTFY_TOKEN when token matches topic account', async () => {
    const ntfyBody = '{"id":"msg-1","event":"message","message":"hello"}\n';

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        issuer: 'https://mail.example.test',
        device_authorization_endpoint: 'https://mail.example.test/oauth/device',
        token_endpoint: 'https://mail.example.test/oauth/token',
        introspection_endpoint: 'https://mail.example.test/oauth/introspect',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        active: true,
        account_id: 'user@example.com',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(ntfyBody, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      }));

    const response = await GET(makeRequest(
      'https://app.example.test/api/mobile/ntfy/poll?topic=homemail-user-user@example.com&since=latest',
      'valid-oauth-token'
    ));

    expect(response.status).toBe(200);
    const responseBody = await response.text();
    expect(responseBody).toBe(ntfyBody);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      'https://ntfy.example.test/homemail-user-user%40example.com/json?poll=1&since=latest',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer server-only-ntfy-token',
        }),
      })
    );
    expect(responseBody).not.toContain(process.env.NTFY_TOKEN);
  });
});
