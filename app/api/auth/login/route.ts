import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { JMAPClient } from '@/providers/stalwart-jmap/jmap-client';
import { createSession, getSession } from '@/lib/session';
import { addUserAccount, setActiveAccount, setCredentials, type UserAccount } from '@/lib/storage';
import { isPasswordLoginEnabled } from '@/lib/auth-config';
import { SecurityLogger } from '@/lib/security-logger';
import { logger } from '@/lib/logger';
import { getStalwartBaseUrlCandidates } from '@/lib/stalwart-base-url';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  addAccount: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  if (!isPasswordLoginEnabled()) {
    return NextResponse.json(
      {
        error: 'Password login is disabled. Please use OAuth authentication.',
        requiresOAuth: true,
      },
      { status: 400 }
    );
  }

  let emailForLogging = 'unknown';

  try {
    const rawBody = await request.json();
    const { email, password, addAccount = false } = loginSchema.parse(rawBody);
    const accountId = email.trim();
    emailForLogging = accountId;
    const baseUrls = getStalwartBaseUrlCandidates();
    let jmapSession;
    let lastError: unknown = null;

    for (const baseUrl of baseUrls) {
      try {
        const client = new JMAPClient(baseUrl, accountId, password, accountId, 'basic');
        jmapSession = await client.getSession();
        break;
      } catch (candidateError) {
        lastError = candidateError;
        logger.warn('[Basic Login] Failed to connect using Stalwart base URL candidate', {
          baseUrl,
          error: candidateError instanceof Error ? candidateError.message : String(candidateError),
        });
      }
    }

    if (!jmapSession) {
      throw lastError instanceof Error
        ? lastError
        : new Error('Unable to connect to Stalwart using any configured base URL');
    }

    const primaryAccountId = jmapSession.primaryAccounts?.mail;
    const account = primaryAccountId ? jmapSession.accounts[primaryAccountId] : undefined;
    const displayName = account?.name || accountId.split('@')[0];
    const existingSession = await getSession(request);
    const isAddAccountFlow = addAccount && !!existingSession;
    const userId = isAddAccountFlow ? existingSession.email : accountId;

    await setCredentials(accountId, accountId, password);

    const userAccount: UserAccount = {
      id: accountId,
      email: accountId,
      displayName,
      addedAt: Date.now(),
      isActive: !isAddAccountFlow,
    };

    await addUserAccount(userId, userAccount);

    if (isAddAccountFlow) {
      SecurityLogger.logLoginSuccess(request, accountId, accountId);
      return NextResponse.json({ success: true, account: userAccount, addedAccount: true });
    }

    await setActiveAccount(userId, accountId);
    await createSession(accountId, accountId, request);
    SecurityLogger.logLoginSuccess(request, accountId, accountId);

    return NextResponse.json({ success: true, account: userAccount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    SecurityLogger.logLoginFailed(request, emailForLogging, errorMessage);
    logger.error('[Basic Login] Authentication failed', {
      email: emailForLogging,
      error: errorMessage,
    });

    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
}
