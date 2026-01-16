import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getUserAccounts, addUserAccount, removeUserAccount, setActiveAccount, type UserAccount } from '@/lib/storage';
import { getMailProvider, getMailProviderForAccount, ensureAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.email;
    const accounts = await getUserAccounts(userId);
    
    return NextResponse.json({ accounts });
  } catch (error) {
    logger.error('Failed to get accounts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const addAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { email, password } = addAccountSchema.parse(body);

    const accountId = email;
    await ensureAccount(accountId, email, password);
    const provider = process.env.MAIL_PROVIDER === 'stalwart' 
      ? getMailProviderForAccount(accountId)
      : getMailProvider();
    
    try {
      const account = await provider.getAccount(accountId);
      if (!account) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      const userId = session.email;
      const newAccount: UserAccount = {
        id: accountId,
        email: account.email,
        displayName: account.displayName,
        addedAt: Date.now(),
        isActive: false,
      };

      await addUserAccount(userId, newAccount);

      return NextResponse.json({ success: true, account: newAccount });
    } catch (providerError) {
      logger.error('Provider error during account addition:', providerError);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('Add account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    if (accountId === session.accountId) {
      return NextResponse.json({ error: 'Cannot delete active account' }, { status: 400 });
    }

    const userId = session.email;
    await removeUserAccount(userId, accountId);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
