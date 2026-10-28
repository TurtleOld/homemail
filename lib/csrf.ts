import { logger } from './logger';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Read a cookie directly from the request header.
 *
 * Middleware runs on the Edge runtime, where `cookies()` from `next/headers`
 * is unavailable, so CSRF validation must not depend on it.
 */
function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const cookieName = part.slice(0, separator).trim();
    if (cookieName !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export function validateOrigin(request: Request): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // Fast-path: Sec-Fetch-Site is a browser-enforced fetch metadata header.
  // If present and value is 'cross-site', reject immediately — no need to
  // inspect Origin/Referer (those can be missing or spoofed by curl/scripts,
  // but real browsers always set Sec-Fetch-Site).
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    return false;
  }
  // 'same-origin' and 'same-site' are safe; 'none' is navigation (also safe
  // for our purposes). Absent header means old browser → fall through to
  // Origin/Referer check below.

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const hostHeader = request.headers.get('host');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');

  const requestHost = (forwardedHost || hostHeader || '').split(',')[0]?.trim().split(':')[0] || '';

  const appUrlHost = (() => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return null;
    }
    try {
      return new URL(appUrl).hostname;
    } catch {
      return null;
    }
  })();

  const allowedHosts = new Set<string>();
  if (requestHost) {
    allowedHosts.add(requestHost);
  }
  if (appUrlHost) {
    allowedHosts.add(appUrlHost);
  }
  const allowedExtra = (process.env.ALLOWED_ORIGIN_HOSTS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  for (const h of allowedExtra) {
    allowedHosts.add(h);
  }

  if (!origin && !referer) {
    return false;
  }
  if (allowedHosts.size === 0) {
    return false;
  }

  const proto = (forwardedProto || '').split(',')[0]?.trim();

  const isAllowedUrl = (value: string) => {
    try {
      const url = new URL(value);
      if (proto && url.protocol.replace(':', '') !== proto) {
        return false;
      }
      return allowedHosts.has(url.hostname);
    } catch {
      return false;
    }
  };

  if (origin && !isAllowedUrl(origin)) {
    return false;
  }

  if (referer && !isAllowedUrl(referer)) {
    return false;
  }

  return true;
}

/**
 * Validate the double-submit CSRF token and request origin.
 *
 * Safe methods pass so the same check can guard every API route from
 * middleware. This module must stay Edge-compatible: it only uses Web APIs.
 */
export async function validateCsrf(request: Request): Promise<boolean> {
  const method = request.method.toUpperCase();

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  if (process.env.NODE_ENV === 'development' && process.env.DISABLE_CSRF === 'true') {
    return true;
  }

  if (!validateOrigin(request)) {
    logger.warn('[csrf] origin validation failed', { method });
    return false;
  }

  const cookieToken = readCookie(request, CSRF_COOKIE_NAME);
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken || !constantTimeEqual(cookieToken, headerToken)) {
    logger.warn('[csrf] token validation failed', { method });
    return false;
  }

  return true;
}
