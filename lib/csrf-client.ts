'use client';

// The CSRF cookie is intentionally not httpOnly (see lib/csrf-tokens.ts) so the
// client can read it and echo it back as a header — the server compares the
// two (double-submit pattern). Any client-side mutating fetch must attach this.
export function getCsrfHeader(): Record<string, string> {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]!) : '';
  return token ? { 'x-csrf-token': token } : {};
}
