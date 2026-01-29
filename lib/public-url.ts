import { NextRequest } from 'next/server';

/**
 * Get the public base URL for the application
 *
 * Priority:
 * 1. X-Forwarded-Proto + X-Forwarded-Host headers (from reverse proxy)
 * 2. NEXT_PUBLIC_APP_URL environment variable
 * 3. Fallback to request.url (for local development)
 *
 * This ensures correct redirect URLs when running behind a reverse proxy.
 *
 * @param request - Next.js request object
 * @returns Public base URL (e.g., "https://mail.example.com")
 */
export function getPublicBaseUrl(request: NextRequest): string {
  // 1. Try to build from proxy headers (nginx/traefik)
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // 2. Use environment variable (production fallback)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // 3. Fallback to request URL (local development)
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Build a full public URL for a given path
 *
 * @param path - Path to append (e.g., "/login", "/mail")
 * @param request - Next.js request object
 * @returns Full public URL (e.g., "https://mail.example.com/login")
 */
export function buildPublicUrl(path: string, request: NextRequest): URL {
  const baseUrl = getPublicBaseUrl(request);
  return new URL(path, baseUrl);
}
