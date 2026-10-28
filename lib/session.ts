import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import {
  getSessionByCookie,
  saveSession as saveSessionToStorage,
  deleteSession as deleteSessionFromStorage,
  type StoredSession,
} from './storage';
import { SecurityLogger } from './security-logger';
import { getClientIp } from './client-ip';

const SESSION_COOKIE_NAME = 'mail_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

/**
 * Allowlist for accountId characters.
 * Stalwart accountIds are typically email addresses or similar identifiers.
 * Rejecting unexpected characters here is a belt-and-suspenders guard
 * against IDOR/path-traversal if an accountId were ever used as a path segment.
 */
const ACCOUNT_ID_RE = /^[a-zA-Z0-9@._\-+]{1,256}$/;

function isValidAccountId(accountId: string): boolean {
  return ACCOUNT_ID_RE.test(accountId);
}
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

export interface SessionData {
  sessionId: string;
  accountId: string;
  email: string;
  expiresAt: number;
  createdAt: number;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Derive a 32-byte AES key from SESSION_SECRET via HKDF-SHA256.
 * Uses a distinct context string from storage.ts so session cookies and
 * storage blobs use different encryption keys.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET env var must be set and at least 32 characters long');
  }
  const prk = crypto.createHmac('sha256', 'mailclient-hkdf-salt-v1')
    .update(secret)
    .digest();
  const okm = crypto.createHmac('sha256', prk)
    .update('session-cookie-v1\x01')
    .digest();
  return okm;
}

function encryptSessionData(data: SessionData): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final()
  ]);
  
  const tag = cipher.getAuthTag();
  
  return Buffer.concat([
    iv,
    tag,
    encrypted
  ]).toString('base64url');
}

export async function createSession(
  accountId: string,
  email: string,
  request?: Request
): Promise<string> {
  if (!isValidAccountId(accountId)) {
    throw new Error(`Invalid accountId format: ${JSON.stringify(accountId)}`);
  }

  const sessionId = `sess_${crypto.randomBytes(32).toString('base64url')}`;
  const expiresAt = Date.now() + SESSION_DURATION;
  const createdAt = Date.now();

  const ipAddress = request ? getClientIp(request) : undefined;
  const userAgent = request ? request.headers.get('user-agent') || undefined : undefined;

  const session: SessionData = {
    sessionId,
    accountId,
    email,
    expiresAt,
    createdAt,
    ipAddress,
    userAgent,
  };

  const encryptedSession = encryptSessionData(session);
  const cookieStore = await cookies();
  // Always use secure cookies in production (we're behind reverse proxy with HTTPS)
  // Trust proxy is enabled via TRUST_PROXY env var, so req.protocol will be https
  const isProduction = process.env.NODE_ENV === 'production';
  const secureCookie = isProduction || process.env.USE_HTTPS === 'true';
  cookieStore.set(SESSION_COOKIE_NAME, encryptedSession, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION / 1000,
  });

  const storedSession: StoredSession = {
    sessionId,
    accountId,
    email,
    expiresAt,
    cookieValue: encryptedSession,
  };
  await saveSessionToStorage(storedSession);

  if (request) {
    SecurityLogger.logSessionCreated(request, email, accountId);
  }

  return sessionId;
}

export async function regenerateSession(
  oldSessionId: string,
  accountId: string,
  email: string,
  request?: Request
): Promise<string> {
  await deleteSessionFromStorage(oldSessionId);
  return createSession(accountId, email, request);
}

export async function getSession(_request?: Request): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const encryptedSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!encryptedSession) {
    return null;
  }

  // sessions.json is the only source of truth. A cookie that was removed on
  // logout must never be resurrected just because it still decrypts.
  const storedSession = await getSessionByCookie(encryptedSession);

  if (!storedSession) {
    await deleteSession();
    return null;
  }

  return {
    sessionId: storedSession.sessionId,
    accountId: storedSession.accountId,
    email: storedSession.email,
    expiresAt: storedSession.expiresAt,
    createdAt: Date.now(),
  };
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const encryptedSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  
  if (encryptedSession) {
    const storedSession = await getSessionByCookie(encryptedSession);
    if (storedSession) {
      await deleteSessionFromStorage(storedSession.sessionId);
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const secureCookie = isProduction || process.env.USE_HTTPS === 'true';
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}
