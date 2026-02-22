import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { syncRulesToSieve } from '@/lib/sync-rules-to-sieve';

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncRulesToSieve(session.accountId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[sync-sieve] Error syncing rules to Sieve:', error);
    return NextResponse.json(
      { error: 'Failed to sync rules to Sieve', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
