import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname === '/login') {
    const sessionCookie = request.cookies.get('mail_session');
    if (sessionCookie) {
      return NextResponse.redirect(new URL('/mail', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/mail/:path*', '/api/auth/:path*', '/mail/:path*', '/login'],
};
