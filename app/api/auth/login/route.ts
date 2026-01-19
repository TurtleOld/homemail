import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { getMailProvider, getMailProviderForAccount, ensureAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';
import { addUserAccount, setActiveAccount, type UserAccount } from '@/lib/storage';
import { JMAPClient } from '@/providers/stalwart-jmap/jmap-client';
import type { Account } from '@/lib/types';

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
    
    let authPassword: string;
    if (totpCode) {
      const totpFormat = process.env.TOTP_FORMAT || 'concat';
      if (totpFormat === 'colon') {
        authPassword = `${password}:${totpCode}`;
      } else {
        authPassword = `${password}${totpCode}`;
      }
      logger.info(`Login attempt for ${email}, TOTP format: ${totpFormat}`);
    } else {
      authPassword = password;
      logger.info(`Login attempt for ${email}, no TOTP`);
    }
    
    const provider = process.env.MAIL_PROVIDER === 'stalwart' 
      ? getMailProviderForAccount(accountId)
      : getMailProvider();
    
    try {
      let account: Account | null;
      
      if (process.env.MAIL_PROVIDER === 'stalwart' && totpCode) {
        const baseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
        const authMode = (process.env.STALWART_AUTH_MODE as 'basic' | 'bearer') || 'basic';
        const tempClient = new JMAPClient(baseUrl, email, authPassword, accountId, authMode);
        
        try {
          const session = await tempClient.getSession();
          
          let jmapAccount: any;
          if (session.primaryAccounts?.mail) {
            jmapAccount = session.accounts[session.primaryAccounts.mail];
          } else {
            const accountKeys = Object.keys(session.accounts);
            if (accountKeys.length > 0) {
              jmapAccount = session.accounts[accountKeys[0]];
            }
          }
          
          if (!jmapAccount) {
            logger.error('Account not found in session for:', email);
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
          }
          
          account = {
            id: jmapAccount.id || accountId,
            email: email,
            displayName: jmapAccount.name || email.split('@')[0],
          };
          
          await ensureAccount(accountId, email, password);
        } catch (tempError) {
          const errorMessage = tempError instanceof Error ? tempError.message : String(tempError);
          logger.error('Temporary client auth error:', errorMessage);
          throw tempError;
        }
      } else {
        await ensureAccount(accountId, email, authPassword);
        account = await provider.getAccount(accountId);
      }

      if (!account) {
        logger.error('Account not found for:', email);
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
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
      
      if (errorMessage.includes('402') || errorMessage.includes('Payment Required')) {
        if (!totpCode) {
          return NextResponse.json({ error: 'Требуется код TOTP', requiresTotp: true }, { status: 401 });
        }
        return NextResponse.json({ error: 'Неверный пароль или код TOTP. Проверьте формат ввода.', requiresTotp: true }, { status: 401 });
      }
      
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('credentials')) {
        if (!totpCode) {
          return NextResponse.json({ error: 'Требуется код TOTP', requiresTotp: true }, { status: 401 });
        }
        return NextResponse.json({ error: 'Неверный пароль или код TOTP', requiresTotp: true }, { status: 401 });
      }
      
      return NextResponse.json({ error: `Ошибка аутентификации: ${errorMessage}`, requiresTotp: !!totpCode }, { status: 401 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
