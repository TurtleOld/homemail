import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { JMAPClient } from '@/providers/stalwart-jmap/jmap-client';
import { createSession } from '@/lib/session';
import { setCredentials } from '@/lib/storage';
import { isPasswordLoginEnabled } from '@/lib/auth-config';
import { SecurityLogger } from '@/lib/security-logger';
import { logger } from '@/lib/logger';
import { getStalwartBaseUrlCandidates } from '@/lib/stalwart-base-url';
import { getClientIp } from '@/lib/client-ip';
import {
  checkBruteForce,
  recordFailedAttempt,
  recordSuccess,
} from '@/lib/brute-force-protection';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
    const { email, password } = loginSchema.parse(rawBody);
    const accountId = email.trim();
    emailForLogging = accountId;
    // Mailbox addresses are case-insensitive, so a changed case must not buy a new attempt budget.
    const bruteForceKey = accountId.toLowerCase();
    const ip = getClientIp(request);
    const bruteForce = checkBruteForce(ip, bruteForceKey, request);

    if (!bruteForce.allowed) {
      const retryAfter = bruteForce.blockedUntil
        ? Math.max(1, Math.ceil((bruteForce.blockedUntil - Date.now()) / 1000))
        : undefined;

      return NextResponse.json(
        { error: bruteForce.reason || 'Too many failed login attempts' },
        {
          status: 429,
          headers: retryAfter ? { 'Retry-After': String(retryAfter) } : undefined,
        }
      );
    }

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
      // Only a rejected password counts: an unreachable Stalwart must not lock the household out.
      if (lastError instanceof Error && /JMAP (session|discovery) failed: 401\b/.test(lastError.message)) {
        recordFailedAttempt(ip, bruteForceKey);
      }
      throw lastError instanceof Error
        ? lastError
        : new Error('Unable to connect to Stalwart using any configured base URL');
    }

    recordSuccess(ip, bruteForceKey);

    const primaryAccountId = jmapSession.primaryAccounts?.mail;
    const account = primaryAccountId ? jmapSession.accounts[primaryAccountId] : undefined;
    const displayName = account?.name || accountId.split('@')[0];
    await setCredentials(accountId, accountId, password);

    await createSession(accountId, accountId, request);
    SecurityLogger.logLoginSuccess(request, accountId, accountId);

    return NextResponse.json({
      success: true,
      account: { id: accountId, email: accountId, displayName },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
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
