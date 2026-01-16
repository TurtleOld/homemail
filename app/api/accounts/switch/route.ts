import { NextRequest, NextResponse } from 'next/server';
import { getSession, createSession } from '@/lib/session';
import { getUserAccounts, setActiveAccount } from '@/lib/storage';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const userId = session.email;
    const accounts = await getUserAccounts(userId);
    const targetAccount = accounts.find((a) => a.id === accountId);

    if (!targetAccount) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await setActiveAccount(userId, accountId);
    await createSession(accountId, targetAccount.email);

    return NextResponse.json({ success: true, account: targetAccount });
  } catch (error) {
    logger.error('Failed to switch account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
