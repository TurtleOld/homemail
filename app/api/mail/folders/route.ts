import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();

    const folders = await provider.getFolders(session.accountId);

    if (!folders || folders.length === 0) {
      console.warn(`[folders] Empty folders array for accountId: ${session.accountId}`);
    }

    return NextResponse.json(folders);
  } catch (error) {
    console.error('[folders] Error fetching folders:', error);
    
    const isConnectionError = error instanceof Error && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed') ||
      error.message.includes('connect')
    );

    if (isConnectionError) {
      const stalwartUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
      console.error(`[folders] Cannot connect to Stalwart server at ${stalwartUrl}`);
      return NextResponse.json(
        { 
          error: 'Mail server unavailable', 
          message: `Cannot connect to mail server. Please check that Stalwart is running and accessible at ${stalwartUrl}`,
          code: 'CONNECTION_ERROR'
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch folders', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
