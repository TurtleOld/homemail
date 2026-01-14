import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import type { Folder } from '@/lib/types';

const FOLDER_ORDER: Record<string, number> = {
  inbox: 1,
  drafts: 2,
  sent: 3,
  spam: 4,
  trash: 5,
};

function sortFolders(folders: Folder[]): Folder[] {
  const sorted = [...folders].sort((a, b) => {
    const orderA = FOLDER_ORDER[a.role] || 999;
    const orderB = FOLDER_ORDER[b.role] || 999;
    
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    return a.name.localeCompare(b.name);
  });
  
  return sorted;
}

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

    const sortedFolders = sortFolders(folders);

    return NextResponse.json(sortedFolders);
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
