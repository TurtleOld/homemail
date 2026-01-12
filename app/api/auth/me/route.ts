import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();
    
    try {
      const account = await provider.getAccount(session.accountId);

      if (!account) {
        logger.error(`Account not found for accountId: ${session.accountId}`);
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      return NextResponse.json({
        id: account.id,
        email: account.email,
        displayName: account.displayName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting account for ${session.accountId}:`, errorMessage);
      
      // Если ошибка связана с авторизацией (401, 403), возвращаем 401
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('credentials')) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }
      
      // Для других ошибок возвращаем 500
      return NextResponse.json({ error: 'Failed to get account', details: errorMessage }, { status: 500 });
    }
  } catch (error) {
    logger.error('Error in /api/auth/me:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
