import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, regenerateSession, getSession } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { getMailProvider, getMailProviderForAccount, ensureAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';
import { addUserAccount, setActiveAccount, type UserAccount } from '@/lib/storage';
import { JMAPClient } from '@/providers/stalwart-jmap/jmap-client';
import { OAuthJMAPClient } from '@/lib/oauth-jmap-client';
import type { Account } from '@/lib/types';
import { SecurityLogger } from '@/lib/security-logger';
import { checkBruteForce, recordFailedAttempt, recordSuccess } from '@/lib/brute-force-protection';

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().optional(),
  totpCode: z.string().optional(),
  useOAuth: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    SecurityLogger.logCsrfViolation(request);
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  const rateLimit = checkRateLimit(ip, 'login', request);

  if (!rateLimit.allowed) {
    SecurityLogger.logRateLimitExceeded(request, ip, 'login');
    return NextResponse.json(
      {
        error: 'Too many requests',
        resetAt: rateLimit.resetAt,
        blockedUntil: rateLimit.blockedUntil
      },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { email, password, totpCode, useOAuth } = loginSchema.parse(body);

    const bruteForceCheck = checkBruteForce(ip, email, request);
    if (!bruteForceCheck.allowed) {
      SecurityLogger.logLoginBlocked(request, email, bruteForceCheck.reason || 'Brute force protection');
      return NextResponse.json(
        {
          error: bruteForceCheck.reason || 'Too many failed login attempts',
          blockedUntil: bruteForceCheck.blockedUntil
        },
        { status: 429 }
      );
    }

    const accountId = email;
    const authMode = (process.env.STALWART_AUTH_MODE as 'basic' | 'bearer' | 'oauth') || 'basic';
    const shouldUseOAuth = useOAuth !== undefined ? useOAuth : authMode === 'oauth';
    
    if (shouldUseOAuth || authMode === 'oauth') {
      const baseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
      const isInternalBaseUrl = baseUrl.includes('stalwart') || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || /^http:\/\/\d+\.\d+\.\d+\.\d+/.test(baseUrl);

      let discoveryUrl = process.env.OAUTH_DISCOVERY_URL;
      let isPublicDiscoveryUrl = false;

      if (discoveryUrl) {
        try {
          const url = new URL(discoveryUrl);
          isPublicDiscoveryUrl = url.protocol === 'https:' && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1') && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
        } catch {
        }
      }

      if (!discoveryUrl || discoveryUrl.includes('example.com')) {
        if (isInternalBaseUrl) {
          discoveryUrl = baseUrl.replace(/\/$/, '') + '/.well-known/oauth-authorization-server';
          logger.info(`[OAuth] Using internal discovery URL from STALWART_BASE_URL: ${discoveryUrl}`);
        } else {
          const publicUrl = process.env.STALWART_PUBLIC_URL;
          if (publicUrl) {
            discoveryUrl = publicUrl.replace(/\/$/, '') + '/.well-known/oauth-authorization-server';
            logger.info(`[OAuth] Discovery URL determined from STALWART_PUBLIC_URL: ${discoveryUrl}`);
          } else {
            logger.error(`[OAuth] Discovery URL not configured. OAUTH_DISCOVERY_URL: ${process.env.OAUTH_DISCOVERY_URL || 'not set'}, STALWART_PUBLIC_URL: ${process.env.STALWART_PUBLIC_URL || 'not set'}, STALWART_BASE_URL: ${baseUrl}`);
          }
        }
      } else if (isPublicDiscoveryUrl && isInternalBaseUrl) {
        const internalDiscoveryUrl = baseUrl.replace(/\/$/, '') + '/.well-known/oauth-authorization-server';
        logger.info(`[OAuth] OAUTH_DISCOVERY_URL is public (${process.env.OAUTH_DISCOVERY_URL}), but STALWART_BASE_URL is internal. Using internal URL for request: ${internalDiscoveryUrl}`);
        logger.info(`[OAuth] Public URL will be used for normalizing endpoints in discovery response`);
        discoveryUrl = internalDiscoveryUrl;
      }
      const clientId = process.env.OAUTH_CLIENT_ID || '';

      if (!discoveryUrl || !clientId) {
        logger.error(`[OAuth] Configuration missing. discoveryUrl: ${discoveryUrl || 'not set'}, clientId: ${clientId || 'not set'}`);
        return NextResponse.json(
          {
            error: 'OAuth configuration missing',
            details: {
              discoveryUrl: discoveryUrl ? 'set' : 'not set',
              clientId: clientId ? 'set' : 'not set',
              stalwartPublicUrl: process.env.STALWART_PUBLIC_URL ? 'set' : 'not set',
            },
            hint: 'Please set STALWART_PUBLIC_URL (e.g., https://mail.pavlovteam.ru) or OAUTH_DISCOVERY_URL, and OAUTH_CLIENT_ID'
          },
          { status: 500 }
        );
      }

      const oauthClient = new OAuthJMAPClient({
        discoveryUrl,
        clientId,
        scopes: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'offline_access'],
        baseUrl: process.env.STALWART_BASE_URL || 'http://stalwart:8080',
        accountId,
      });

      const hasToken = await oauthClient.hasValidToken();
      if (!hasToken) {
        return NextResponse.json(
          { error: 'OAuth token required', requiresOAuth: true },
          { status: 401 }
        );
      }

      try {
        const jmapClient = await oauthClient.getJMAPClient();
        const session = await jmapClient.getSession();

        let account: any;
        if (session.primaryAccounts?.mail) {
          account = session.accounts[session.primaryAccounts.mail];
        } else {
          const accountKeys = Object.keys(session.accounts);
          if (accountKeys.length > 0) {
            account = session.accounts[accountKeys[0]];
          }
        }

        if (!account) {
          logger.error('Account not found in session for:', email);
          recordFailedAttempt(ip, email);
          SecurityLogger.logLoginFailed(request, email, 'Account not found in session');
          return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const existingSession = await getSession(request);
        const sessionId = existingSession
          ? await regenerateSession(existingSession.sessionId, accountId, email, request)
          : await createSession(accountId, email, request);

        recordSuccess(ip, email);
        SecurityLogger.logLoginSuccess(request, email, accountId);

        const userAccount: UserAccount = {
          id: accountId,
          email: account.name || email,
          displayName: account.name || email.split('@')[0],
          addedAt: Date.now(),
          isActive: true,
        };

        await addUserAccount(email, userAccount);
        await setActiveAccount(email, accountId);

        return NextResponse.json({
          success: true,
          account: {
            id: account.id || accountId,
            email: account.name || email,
            displayName: account.name || email.split('@')[0],
          },
        });
      } catch (oauthError) {
        const errorMessage = oauthError instanceof Error ? oauthError.message : String(oauthError);
        logger.error('OAuth login error:', errorMessage);
        recordFailedAttempt(ip, email);
        SecurityLogger.logLoginFailed(request, email, `OAuth error: ${errorMessage}`);
        
        if (errorMessage.includes('token required') || errorMessage.includes('authorize')) {
          return NextResponse.json(
            { error: 'OAuth token required', requiresOAuth: true },
            { status: 401 }
          );
        }
        
        return NextResponse.json(
          { error: `OAuth authentication failed: ${errorMessage}`, requiresOAuth: true },
          { status: 401 }
        );
      }
    }
    
    if (!password) {
      return NextResponse.json({ error: 'Password is required for basic authentication' }, { status: 400 });
    }
    
    let authPassword: string;
    if (totpCode) {
      const totpFormat = process.env.TOTP_FORMAT || 'dollar';
      if (totpFormat === 'colon') {
        authPassword = `${password}:${totpCode}`;
      } else if (totpFormat === 'dollar') {
        authPassword = `${password}$${totpCode}`;
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
        const authMode = (process.env.STALWART_AUTH_MODE as 'basic' | 'bearer' | 'oauth') || 'basic';
        
        if (authMode === 'oauth') {
          return NextResponse.json(
            { error: 'TOTP is not supported with OAuth authentication', requiresOAuth: true },
            { status: 400 }
          );
        }
        
        const authHeaderPreview = Buffer.from(`${email}:${authPassword}`).toString('base64').substring(0, 20);
        const totpFormat = process.env.TOTP_FORMAT || 'dollar';
        const formatSeparator = totpFormat === 'colon' ? ':' : totpFormat === 'dollar' ? '$' : '';
        logger.info(`Creating temporary client: email=${email}, password format=${password.substring(0, 2)}...${formatSeparator}${totpCode}, authHeader preview=${authHeaderPreview}...`);
        
        const tempClient = new JMAPClient(baseUrl, email, authPassword, accountId, authMode as 'basic' | 'bearer');
        
        try {
          logger.info(`Attempting to get session with temporary client...`);
          const session = await tempClient.getSession();
          logger.info(`Session obtained successfully, accounts: ${Object.keys(session.accounts || {}).length}`);
          
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
            recordFailedAttempt(ip, email);
            SecurityLogger.logLoginFailed(request, email, 'Account not found in session');
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
          recordFailedAttempt(ip, email);
          SecurityLogger.logLoginFailed(request, email, `Temporary client auth error: ${errorMessage}`);
          throw tempError;
        }
      } else {
        await ensureAccount(accountId, email, authPassword);
        account = await provider.getAccount(accountId);
      }

      if (!account) {
        logger.error('Account not found for:', email);
        recordFailedAttempt(ip, email);
        SecurityLogger.logLoginFailed(request, email, 'Account not found');
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      const existingSession = await getSession(request);
      const sessionId = existingSession
        ? await regenerateSession(existingSession.sessionId, accountId, email, request)
        : await createSession(accountId, email, request);

      recordSuccess(ip, email);
      SecurityLogger.logLoginSuccess(request, email, accountId);

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
      
      recordFailedAttempt(ip, email);
      SecurityLogger.logLoginFailed(request, email, `Provider error: ${errorMessage}`);

      if (errorMessage.includes('TOTP code required') || errorMessage.includes('TOTP') || errorMessage.includes('402') || errorMessage.includes('Payment Required')) {
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
