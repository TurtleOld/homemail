import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import {
  getSessionByCookie,
  saveSession as saveSessionToStorage,
  deleteSession as deleteSessionFromStorage,
  type StoredSession,
} from './storage';
import { SecurityLogger } from './security-logger';

const SESSION_COOKIE_NAME = 'mail_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

export interface SessionData {
  sessionId: string;
  accountId: string;
  email: string;
  expiresAt: number;
  createdAt: number;
  ipAddress?: string;
  userAgent?: string;
}

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || 'default-secret-key-change-in-production';
  return crypto.scryptSync(secret, 'salt', 32);
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

function decryptSessionData(encryptedData: string): SessionData | null {
  try {
    const key = getEncryptionKey();
    const data = Buffer.from(encryptedData, 'base64url');
    
    if (data.length < IV_LENGTH + TAG_LENGTH) {
      return null;
    }
    
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]).toString('utf8');
    
    return JSON.parse(decrypted) as SessionData;
  } catch (error) {
    return null;
  }
}

export async function createSession(
  accountId: string,
  email: string,
  request?: Request
): Promise<string> {
  const sessionId = `sess_${crypto.randomBytes(32).toString('base64url')}`;
  const expiresAt = Date.now() + SESSION_DURATION;
  const createdAt = Date.now();

  const ipAddress = request
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'
    : undefined;
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
  const secureCookie = process.env.USE_HTTPS === 'true';
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

export async function getSession(request?: Request): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const encryptedSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!encryptedSession) {
    return null;
  }

  const storedSession = await getSessionByCookie(encryptedSession);
  let session: SessionData | null = null;

  if (storedSession) {
    session = {
      sessionId: storedSession.sessionId,
      accountId: storedSession.accountId,
      email: storedSession.email,
      expiresAt: storedSession.expiresAt,
      createdAt: Date.now(),
    };
  } else {
    session = decryptSessionData(encryptedSession);
  }

  if (!session) {
    await deleteSession();
    return null;
  }

  if (session.expiresAt < Date.now()) {
    await deleteSession();
    return null;
  }

  if (request && session.ipAddress && session.userAgent) {
    const currentIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const currentUserAgent = request.headers.get('user-agent') || 'unknown';

    if (session.ipAddress !== currentIp || session.userAgent !== currentUserAgent) {
      if (request) {
        SecurityLogger.logSessionHijackAttempt(request, session.email, {
          originalIp: session.ipAddress,
          currentIp,
          originalUserAgent: session.userAgent,
          currentUserAgent,
        });
      }
      await deleteSession();
      return null;
    }
  }

  if (!storedSession) {
    const storedSessionNew: StoredSession = {
      sessionId: session.sessionId,
      accountId: session.accountId,
      email: session.email,
      expiresAt: session.expiresAt,
      cookieValue: encryptedSession,
    };
    await saveSessionToStorage(storedSessionNew);
  }

  return session;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const encryptedSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  
  if (encryptedSession) {
    const session = decryptSessionData(encryptedSession);
    if (session) {
      await deleteSessionFromStorage(session.sessionId);
    }
  }

  const secureCookie = process.env.USE_HTTPS === 'true';
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}
