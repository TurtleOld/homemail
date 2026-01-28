/**
 * Determine real client IP behind reverse proxies.
 *
 * By default we DO NOT trust X-Forwarded-* headers unless TRUST_PROXY=true.
 * This prevents spoofing when the app is exposed directly.
 */
export function getClientIp(request: Request): string {
  const trustProxy = (process.env.TRUST_PROXY || '').toLowerCase() === 'true';

  // When not trusting proxy headers, we don't have access to the socket remoteAddress
  // in Next.js Route Handlers, so we keep behaviour deterministic.
  if (!trustProxy) {
    return request.headers.get('x-real-ip') || 'unknown';
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  const forwarded = forwardedFor?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}
