import crypto from 'node:crypto';
import { cookies } from 'next/headers';

const CSRF_COOKIE_NAME = 'csrf_token';
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
  const secureCookie = process.env.NODE_ENV === 'production' || process.env.USE_HTTPS === 'true';

  cookieStore.set(CSRF_COOKIE_NAME, newToken, {
    httpOnly: false,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    ...(process.env.CSRF_COOKIE_DOMAIN ? { domain: process.env.CSRF_COOKIE_DOMAIN } : {}),
    maxAge: CSRF_TOKEN_DURATION / 1000,
  });

  return newToken;
}
