import { validateCsrfToken } from './csrf-tokens';
import { SecurityLogger } from './security-logger';

export function validateOrigin(request: Request): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

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

export async function validateCsrf(request: Request): Promise<boolean> {
  const method = request.method;
  
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  if (!validateOrigin(request)) {
    SecurityLogger.logCsrfViolation(request, { reason: 'origin_validation_failed' });
    return false;
  }

  const csrfValidation = await validateCsrfToken(request);
  if (!csrfValidation.valid) {
    return false;
  }

  return true;
}
