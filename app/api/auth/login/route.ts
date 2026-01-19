import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { getMailProvider, getMailProviderForAccount, ensureAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';
import { addUserAccount, setActiveAccount, type UserAccount } from '@/lib/storage';

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const rateLimit = checkRateLimit(ip, 'login');

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', resetAt: rateLimit.resetAt },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { email, password, totpCode } = loginSchema.parse(body);

    const accountId = email;
    const authPassword = totpCode ? `${password}${totpCode}` : password;
    
    await ensureAccount(accountId, email, authPassword);
    const provider = process.env.MAIL_PROVIDER === 'stalwart' 
      ? getMailProviderForAccount(accountId)
      : getMailProvider();
    
    try {
      const account = await provider.getAccount(accountId);

      if (!account) {
        logger.error('Account not found for:', email);
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      if (totpCode) {
        await ensureAccount(accountId, email, password);
      }

      await createSession(accountId, email);

      const userAccount: UserAccount = {
        id: accountId,
        email: account.email,
        displayName: account.displayName,
        addedAt: Date.now(),
        isActive: true,
      };

      await addUserAccount(email, userAccount);
      await setActiveAccount(email, accountId);

      return NextResponse.json({ success: true, account: { id: account.id, email: account.email, displayName: account.displayName } });
    } catch (providerError) {
      logger.error('Provider error during login:', providerError);
      const errorMessage = providerError instanceof Error ? providerError.message : String(providerError);
      
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('credentials')) {
        if (!totpCode) {
          return NextResponse.json({ error: 'Требуется код TOTP', requiresTotp: true }, { status: 401 });
        }
        return NextResponse.json({ error: 'Неверный пароль или код TOTP', requiresTotp: true }, { status: 401 });
      }
      
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
