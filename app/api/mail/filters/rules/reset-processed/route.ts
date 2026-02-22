import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { writeStorage } from '@/lib/storage';

const PROCESSED_MESSAGES_KEY = 'autoSortProcessedMessages';

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await writeStorage(PROCESSED_MESSAGES_KEY, {});
    console.log(`[filter-rules/reset-processed] Cache cleared for account ${session.accountId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[filter-rules/reset-processed] Error clearing cache:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
