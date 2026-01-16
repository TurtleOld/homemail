import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data'));
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.enc');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || 'default-secret-key-change-in-production';
  return crypto.scryptSync(secret, 'salt', 32);
}

function encryptData(data: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final()
  ]);
  
  const tag = cipher.getAuthTag();
  
  return Buffer.concat([
    iv,
    tag,
    encrypted
  ]).toString('base64url');
}

function decryptData(encryptedData: string): string | null {
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
    
    return decrypted;
  } catch (error) {
    return null;
  }
}

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
  }
}

export interface StoredSession {
  sessionId: string;
  accountId: string;
  email: string;
  expiresAt: number;
  cookieValue: string;
}

export interface StoredCredentials {
  accountId: string;
  email: string;
  password: string;
}

let sessionsCache: Map<string, StoredSession> | null = null;
let credentialsCache: Map<string, StoredCredentials> | null = null;

export async function loadSessions(): Promise<Map<string, StoredSession>> {
  if (sessionsCache !== null) {
    return sessionsCache;
  }

  await ensureDataDir();
  sessionsCache = new Map();

  try {
    const data = await fs.readFile(SESSIONS_FILE, 'utf-8');
    const sessions = JSON.parse(data) as Record<string, StoredSession>;
    const now = Date.now();
    
    for (const [sessionId, session] of Object.entries(sessions)) {
      if (session.expiresAt > now) {
        sessionsCache.set(sessionId, session);
      }
    }
    
    if (sessionsCache.size !== Object.keys(sessions).length) {
      await saveSessions();
    }
  } catch (error) {
  }

  return sessionsCache;
}

export async function saveSessions(): Promise<void> {
  if (sessionsCache === null) {
    return;
  }

  await ensureDataDir();
  const now = Date.now();
  const validSessions: Record<string, StoredSession> = {};

  for (const [sessionId, session] of sessionsCache.entries()) {
    if (session.expiresAt > now) {
      validSessions[sessionId] = session;
    }
  }

  await fs.writeFile(SESSIONS_FILE, JSON.stringify(validSessions, null, 2), 'utf-8');
}

export async function getSessionByCookie(cookieValue: string): Promise<StoredSession | null> {
  const sessions = await loadSessions();
  for (const session of sessions.values()) {
    if (session.cookieValue === cookieValue) {
      if (session.expiresAt > Date.now()) {
        return session;
      }
    }
  }
  return null;
}

export async function saveSession(session: StoredSession): Promise<void> {
  const sessions = await loadSessions();
  sessions.set(session.sessionId, session);
  await saveSessions();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const sessions = await loadSessions();
  sessions.delete(sessionId);
  await saveSessions();
}

export async function loadCredentials(): Promise<Map<string, StoredCredentials>> {
  if (credentialsCache !== null) {
    return credentialsCache;
  }

  await ensureDataDir();
  credentialsCache = new Map();

  try {
    const encryptedData = await fs.readFile(CREDENTIALS_FILE, 'utf-8');
    const decryptedData = decryptData(encryptedData);
    
    if (decryptedData) {
      const credentials = JSON.parse(decryptedData) as Record<string, StoredCredentials>;
      for (const [accountId, creds] of Object.entries(credentials)) {
        credentialsCache.set(accountId, creds);
      }
    }
  } catch (error) {
  }

  return credentialsCache;
}

export async function saveCredentials(): Promise<void> {
  if (credentialsCache === null) {
    return;
  }

  await ensureDataDir();
  const credentialsObj: Record<string, StoredCredentials> = {};
  
  for (const [accountId, creds] of credentialsCache.entries()) {
    credentialsObj[accountId] = creds;
  }

  const jsonData = JSON.stringify(credentialsObj);
  const encryptedData = encryptData(jsonData);
  await fs.writeFile(CREDENTIALS_FILE, encryptedData, 'utf-8');
}

export async function getCredentials(accountId: string): Promise<StoredCredentials | null> {
  const credentials = await loadCredentials();
  return credentials.get(accountId) || null;
}

export async function setCredentials(accountId: string, email: string, password: string): Promise<void> {
  const credentials = await loadCredentials();
  credentials.set(accountId, { accountId, email, password });
  await saveCredentials();
}

export async function deleteCredentials(accountId: string): Promise<void> {
  const credentials = await loadCredentials();
  credentials.delete(accountId);
  await saveCredentials();
}

export async function readStorage<T>(key: string, defaultValue: T): Promise<T> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${key.replace(/:/g, '_')}.json`);
  
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
    return defaultValue;
  }
}

export async function writeStorage<T>(key: string, value: T): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${key.replace(/:/g, '_')}.json`);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
}