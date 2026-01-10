import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Разрешаем все API auth роуты без проверки сессии
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  // Для API mail роутов проверяем сессию
  if (pathname.startsWith('/api/mail/')) {
    const sessionCookie = request.cookies.get('mail_session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Для страниц mail проверяем сессию
  if (pathname.startsWith('/mail')) {
    const sessionCookie = request.cookies.get('mail_session');
    if (!sessionCookie) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Если уже авторизован, редиректим с login на mail
  if (pathname === '/login') {
    const sessionCookie = request.cookies.get('mail_session');
    if (sessionCookie) {
      return NextResponse.redirect(new URL('/mail', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/mail/:path*', '/api/auth/:path*', '/mail/:path*', '/login'],
};
