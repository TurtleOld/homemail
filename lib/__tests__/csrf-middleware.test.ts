import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-intl/middleware', () => ({ default: () => () => undefined }));

import { middleware } from '@/middleware';

const APP_ORIGIN = 'https://mail.example.test';

function apiRequest(
  path: string,
  method: string,
  options: { headers?: Record<string, string> } = {}
) {
  return new NextRequest(`${APP_ORIGIN}${path}`, {
    method,
    headers: {
      origin: APP_ORIGIN,
      'x-forwarded-host': 'mail.example.test',
      'x-forwarded-proto': 'https',
      cookie: 'mail_session=session-token; csrf_token=cookie-token',
      ...options.headers,
    },
  });
}

describe('middleware CSRF guard', () => {
  it('rejects a mutating API request without an x-csrf-token header', async () => {
    const response = await middleware(apiRequest('/api/settings/hotkeys', 'POST'));

    expect(response.status).toBe(403);
  });

  it('rejects a mutating API request whose token does not match the cookie', async () => {
    const response = await middleware(
      apiRequest('/api/contacts', 'POST', { headers: { 'x-csrf-token': 'other-token' } })
    );

    expect(response.status).toBe(403);
  });

  it('rejects a mutating API request when the CSRF cookie is missing', async () => {
    const response = await middleware(
      apiRequest('/api/contacts', 'POST', {
        headers: { cookie: 'mail_session=session-token', 'x-csrf-token': 'cookie-token' },
      })
    );

    expect(response.status).toBe(403);
  });

  it('rejects a same-site request from another origin even with a valid token', async () => {
    const response = await middleware(
      apiRequest('/api/contacts', 'POST', {
        headers: { 'x-csrf-token': 'cookie-token', origin: 'https://other.example' },
      })
    );

    expect(response.status).toBe(403);
  });

  it('accepts a mutating API request with a matching token', async () => {
    const response = await middleware(
      apiRequest('/api/contacts', 'POST', { headers: { 'x-csrf-token': 'cookie-token' } })
    );

    expect(response.status).toBe(200);
  });

  it('rejects a valid token from a cross-site request', async () => {
    const response = await middleware(
      apiRequest('/api/contacts', 'POST', {
        headers: { 'x-csrf-token': 'cookie-token', 'sec-fetch-site': 'cross-site' },
      })
    );

    expect(response.status).toBe(403);
  });

  it('does not require a token for safe methods', async () => {
    const response = await middleware(apiRequest('/api/contacts', 'GET'));

    expect(response.status).toBe(200);
  });

  it('does not require a token for auth and mobile API routes', async () => {
    const [authResponse, mobileResponse] = await Promise.all([
      middleware(apiRequest('/api/auth/login', 'POST')),
      middleware(apiRequest('/api/mobile/ntfy/poll', 'POST')),
    ]);

    expect(authResponse.status).toBe(200);
    expect(mobileResponse.status).toBe(200);
  });

  it('accepts CSP violation reports sent by the browser without a token or session', async () => {
    const response = await middleware(
      new NextRequest(`${APP_ORIGIN}/api/csp-report`, { method: 'POST' })
    );

    expect(response.status).toBe(200);
  });
});
