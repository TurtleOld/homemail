import { cookies } from 'next/headers';
import crypto from 'crypto';

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

export async function createSession(accountId: string, email: string): Promise<string> {
  const sessionId = `sess_${crypto.randomBytes(32).toString('base64url')}`;
  const expiresAt = Date.now() + SESSION_DURATION;

  const session: SessionData = {
    sessionId,
    accountId,
    email,
    expiresAt,
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

  return sessionId;
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const encryptedSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!encryptedSession) {
    return null;
  }

  const session = decryptSessionData(encryptedSession);

  if (!session || session.expiresAt < Date.now()) {
    if (session) {
      await deleteSession();
    }
    return null;
  }

  return session;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
