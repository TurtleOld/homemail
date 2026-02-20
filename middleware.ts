import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildPublicUrl } from '@/lib/public-url';

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function ensureCsrfCookie(request: NextRequest, response: NextResponse): NextResponse {
  if (request.cookies.get('csrf_token')) {
    return response;
  }
  const token = generateToken();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const secureCookie =
    process.env.NODE_ENV === 'production' ||
    process.env.USE_HTTPS === 'true' ||
    forwardedProto === 'https';
  response.cookies.set('csrf_token', token, {
    httpOnly: false,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    ...(process.env.CSRF_COOKIE_DOMAIN ? { domain: process.env.CSRF_COOKIE_DOMAIN } : {}),
    maxAge: 24 * 60 * 60,
  });
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Allow auth API routes without authentication
  // OAuth callback is handled by /api/auth/oauth/callback (no separate client-side page)
  if (pathname.startsWith('/api/auth/')) {
    return response;
  }

  if (pathname.startsWith('/api/mail/')) {
    const sessionCookie = request.cookies.get('mail_session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (pathname.startsWith('/mail')) {
    const sessionCookie = request.cookies.get('mail_session');
    if (!sessionCookie) {
      const loginUrl = buildPublicUrl('/login', request);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return ensureCsrfCookie(request, response);
  }

  if (pathname === '/login') {
    const sessionCookie = request.cookies.get('mail_session');
    if (sessionCookie) {
      return NextResponse.redirect(buildPublicUrl('/mail', request));
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/mail/:path*', '/api/auth/:path*', '/mail/:path*', '/login'],
};
