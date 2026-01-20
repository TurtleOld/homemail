import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { SecurityLogger } from './security-logger';
import { timingSafeEqual } from './security-utils';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_DURATION = 24 * 60 * 60 * 1000;

function generateToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

export async function getCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (existingToken) {
    return existingToken;
  }

  const newToken = generateToken();
  const secureCookie = process.env.USE_HTTPS === 'true';

  cookieStore.set(CSRF_COOKIE_NAME, newToken, {
    httpOnly: false,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: CSRF_TOKEN_DURATION / 1000,
  });

  return newToken;
}

export async function validateCsrfToken(
  request: Request,
  token?: string
): Promise<{ valid: boolean; reason?: string }> {
  if (process.env.NODE_ENV === 'development' && process.env.DISABLE_CSRF === 'true') {
    return { valid: true };
  }

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (!cookieToken) {
    SecurityLogger.logCsrfViolation(request, { reason: 'missing_cookie_token' });
    return { valid: false, reason: 'CSRF token cookie not found' };
  }

  const headerToken = request.headers.get(CSRF_HEADER_NAME) || token;

  if (!headerToken) {
    SecurityLogger.logCsrfViolation(request, { reason: 'missing_header_token' });
    return { valid: false, reason: 'CSRF token header not found' };
  }

  if (!timingSafeEqual(cookieToken, headerToken)) {
    SecurityLogger.logCsrfViolation(request, {
      reason: 'token_mismatch',
      cookieLength: cookieToken.length,
      headerLength: headerToken.length,
    });
    return { valid: false, reason: 'CSRF token mismatch' };
  }

  return { valid: true };
}

export async function requireCsrfToken(request: Request): Promise<{ valid: boolean; error?: string }> {
  const validation = await validateCsrfToken(request);

  if (!validation.valid) {
    return {
      valid: false,
      error: validation.reason || 'CSRF validation failed',
    };
  }

  return { valid: true };
}
