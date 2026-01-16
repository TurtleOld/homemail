import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProviderForAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { aliases } = body;

    if (!Array.isArray(aliases)) {
      return NextResponse.json({ error: 'aliases must be an array' }, { status: 400 });
    }

    if (process.env.MAIL_PROVIDER !== 'stalwart') {
      return NextResponse.json({ 
        error: 'Alias checking is only available for Stalwart provider',
        results: aliases.map((alias: { email: string }) => ({
          email: alias.email,
          exists: false,
          error: 'Not Stalwart provider',
        })),
      });
    }

    try {
      const provider = getMailProviderForAccount(session.accountId);
      const client = await (provider as any).getClient(session.accountId);
      
      if (!client || typeof client.getIdentities !== 'function') {
        throw new Error('JMAP client not available');
      }

      const serverIdentities = await client.getIdentities();
      const serverEmails = new Set(serverIdentities.map((id: { email: string }) => id.email.toLowerCase()));

      const results = aliases.map((alias: { email: string }) => {
        const emailLower = alias.email.toLowerCase();
        const exists = serverEmails.has(emailLower);
        
        return {
          email: alias.email,
          exists,
          message: exists 
            ? 'Алиас найден на сервере как identity' 
            : 'Алиас не найден на сервере. Убедитесь, что он создан в административном интерфейсе Stalwart и привязан к вашему аккаунту.',
        };
      });

      return NextResponse.json({ results });
    } catch (error) {
      logger.error('Failed to check aliases:', error);
      return NextResponse.json({ 
        error: 'Failed to check aliases',
        message: error instanceof Error ? error.message : 'Unknown error',
        results: aliases.map((alias: { email: string }) => ({
          email: alias.email,
          exists: false,
          error: 'Failed to check',
        })),
      }, { status: 500 });
    }
  } catch (error) {
    logger.error('Failed to check aliases:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
