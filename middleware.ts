import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildPublicUrl } from '@/lib/public-url';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

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

// Extract locale prefix from pathname (/ru, /en)
function getLocaleFromPath(pathname: string): string {
  const locales = routing.locales as readonly string[];
  const segment = pathname.split('/')[1];
  return locales.includes(segment) ? segment : routing.defaultLocale;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes: auth is handled separately (no locale prefix)
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    const sessionCookie = request.cookies.get('mail_session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Determine locale for page routes
  const locale = getLocaleFromPath(pathname);

  // Routes under /[locale]/mail require auth
  if (pathname.match(/^\/(ru|en)\/mail/)) {
    const sessionCookie = request.cookies.get('mail_session');
    if (!sessionCookie) {
      const loginUrl = buildPublicUrl(`/${locale}/login`, request);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Apply next-intl middleware then add CSRF cookie
    const intlResponse = intlMiddleware(request);
    return ensureCsrfCookie(request, intlResponse ?? NextResponse.next());
  }

  // Routes under /[locale]/settings require auth
  if (pathname.match(/^\/(ru|en)\/settings/)) {
    const sessionCookie = request.cookies.get('mail_session');
    if (!sessionCookie) {
      const loginUrl = buildPublicUrl(`/${locale}/login`, request);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    const intlResponse = intlMiddleware(request);
    return ensureCsrfCookie(request, intlResponse ?? NextResponse.next());
  }

  // Login page: redirect to mail if already authenticated
  if (pathname.match(/^\/(ru|en)\/login$/)) {
    const sessionCookie = request.cookies.get('mail_session');
    if (sessionCookie) {
      return NextResponse.redirect(buildPublicUrl(`/${locale}/mail`, request));
    }
  }

  // For all other page routes, run next-intl middleware (locale detection & routing)
  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // API routes
    '/api/:path*',
    // Locale-prefixed page routes (exclude static files and _next)
    '/(ru|en)/:path*',
    // Root path for locale redirect
    '/',
  ],
};
