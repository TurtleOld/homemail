import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const STALWART_BASE_URL = process.env.STALWART_MANAGEMENT_URL || process.env.STALWART_BASE_URL || 'http://stalwart:8080';

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

    // OAuth-only mode: admin panel requires Basic Auth with admin credentials
    return NextResponse.json(
      {
        error: 'Stalwart admin panel is not available in OAuth mode',
        message: 'Please access Stalwart admin panel directly using admin credentials',
        adminUrl: STALWART_BASE_URL
      },
      { status: 503 }
    );

  } catch (error) {
    logger.error('Failed to proxy Stalwart Management:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
