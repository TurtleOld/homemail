import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { getPublicStalwartManagementUrl } from '@/lib/stalwart-management-url';

/**
 * OAuth-only mode: Stalwart admin panel proxy is disabled.
 *
 * This endpoint requires admin credentials for Basic Auth,
 * which are not available in OAuth-only mode.
 *
 * To access Stalwart admin panel, use direct access with admin credentials.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // OAuth-only mode: admin panel requires separate administrator credentials.
    return NextResponse.json(
      {
        available: false,
        error: 'Stalwart admin panel is not available in OAuth mode',
        code: 'STALWART_ADMIN_REQUIRES_DIRECT_LOGIN',
        message:
          'Open the Stalwart management interface and sign in with administrator credentials',
        adminUrl: getPublicStalwartManagementUrl(),
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Failed to proxy Stalwart Management:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
