import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data'));
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.enc');

/**
 * Write data to a file atomically: write to a temp file, then rename.
 * Prevents partial-write corruption for security-critical files.
 */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    await fs.writeFile(tmp, content, 'utf-8');
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup of temp file on failure.
    try { await fs.unlink(tmp); } catch { /* ignore */ }
    throw err;
  }
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derive a 32-byte AES key from SESSION_SECRET using HKDF-SHA256.
 * The `context` string separates keys for different purposes so that
 * compromising one derived key does not compromise another.
 *
 * HKDF replaces the previous `scryptSync(secret, 'salt', 32)` which used
 * a hard-coded salt and produced the same key for all callers.
 */
function deriveKey(context: string): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET env var must be set and at least 32 characters long');
  }
  // HKDF: extract phase (HMAC-SHA256 with a fixed info salt)
  const prk = crypto.createHmac('sha256', 'mailclient-hkdf-salt-v1')
    .update(secret)
    .digest();
  // HKDF: expand phase — one block (32 bytes) with the context as info
  const okm = crypto.createHmac('sha256', prk)
    .update(`${context}\x01`)
    .digest();
  return okm; // 32 bytes — correct for AES-256
}

function getEncryptionKey(): Buffer {
  return deriveKey('storage-encryption-v1');
}

export function encryptData(data: string): string {
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

export function decryptData(encryptedData: string): string | null {
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
let sessionsCacheMtime: number = 0; // mtime of sessions.json when cache was last loaded
let credentialsCache: Map<string, StoredCredentials> | null = null;

/**
 * Return the mtime (ms) of a file, or 0 if the file does not exist yet.
 */
async function fileMtime(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

export async function loadSessions(): Promise<Map<string, StoredSession>> {
  // In production Next.js runs multiple worker processes, each with its own
  // module-level cache. To keep them consistent without Redis, we stat the
  // sessions file on every call and reload if another worker has written a
  // newer version (indicated by a changed mtime). The stat syscall is cheap.
  const currentMtime = await fileMtime(SESSIONS_FILE);
  if (sessionsCache !== null && currentMtime === sessionsCacheMtime) {
    return sessionsCache;
  }

  await ensureDataDir();
  sessionsCache = new Map();
  sessionsCacheMtime = currentMtime;

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

  await atomicWriteFile(SESSIONS_FILE, JSON.stringify(validSessions, null, 2));
  // Update cached mtime so this worker doesn't immediately re-read the file
  // it just wrote.
  sessionsCacheMtime = await fileMtime(SESSIONS_FILE);
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
  await atomicWriteFile(CREDENTIALS_FILE, encryptedData);
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

/** Whitelist pattern for storage keys: alphanumeric, hyphens, underscores, colons. */
const STORAGE_KEY_RE = /^[a-zA-Z0-9_\-:]{1,256}$/;

/**
 * Convert a storage key to an absolute file path that is guaranteed to stay
 * inside DATA_DIR.  Throws a SecurityError-style Error if the key is invalid.
 */
function storageKeyToPath(key: string): string {
  if (!STORAGE_KEY_RE.test(key)) {
    throw Object.assign(new Error('Invalid storage key'), { code: 'SECURITY_INVALID_KEY' });
  }
  // Colons → underscores (filesystem-safe).
  const filename = `${key.replace(/:/g, '_')}.json`;
  const resolved = path.resolve(DATA_DIR, filename);
  // Must stay inside DATA_DIR (path.resolve already normalises .. etc.)
  if (!resolved.startsWith(path.resolve(DATA_DIR) + path.sep) &&
      resolved !== path.resolve(DATA_DIR)) {
    throw Object.assign(new Error('Storage key resolves outside data directory'), { code: 'SECURITY_PATH_TRAVERSAL' });
  }
  return resolved;
}

export async function readStorage<T>(key: string, defaultValue: T): Promise<T> {
  await ensureDataDir();
  const filePath = storageKeyToPath(key);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
    return defaultValue;
  }
}

export async function writeStorage<T>(key: string, value: T): Promise<void> {
  await ensureDataDir();
  const filePath = storageKeyToPath(key);
  await atomicWriteFile(filePath, JSON.stringify(value, null, 2));
}

/**
 * Read an encrypted storage slot.
 * The file contains a base64url-encoded AES-256-GCM blob (same format as
 * encryptData/decryptData). Falls back to `defaultValue` if the file does
 * not exist or decryption fails.
 */
export async function readEncryptedStorage<T>(key: string, defaultValue: T): Promise<T> {
  await ensureDataDir();
  const filePath = storageKeyToPath(key);
  try {
    const encryptedData = await fs.readFile(filePath, 'utf-8');
    const decrypted = decryptData(encryptedData.trim());
    if (!decrypted) return defaultValue;
    return JSON.parse(decrypted) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Write an encrypted storage slot.
 * Data is JSON-serialised then AES-256-GCM encrypted before writing.
 */
export async function writeEncryptedStorage<T>(key: string, value: T): Promise<void> {
  await ensureDataDir();
  const filePath = storageKeyToPath(key);
  const encrypted = encryptData(JSON.stringify(value));
  await atomicWriteFile(filePath, encrypted);
}

export interface UserAccount {
  id: string;
  email: string;
  displayName?: string;
  addedAt: number;
  isActive?: boolean;
}

const ACCOUNTS_FILE = path.join(DATA_DIR, 'user_accounts.json');
let accountsCache: Map<string, UserAccount[]> | null = null;

export async function loadUserAccounts(): Promise<Map<string, UserAccount[]>> {
  if (accountsCache !== null) {
    return accountsCache;
  }

  await ensureDataDir();
  accountsCache = new Map();

  try {
    const data = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
    const accounts = JSON.parse(data) as Record<string, UserAccount[]>;
    for (const [userId, userAccounts] of Object.entries(accounts)) {
      accountsCache.set(userId, userAccounts);
    }
  } catch (error) {
  }

  return accountsCache;
}

export async function saveUserAccounts(): Promise<void> {
  if (accountsCache === null) {
    return;
  }

  await ensureDataDir();
  const accountsObj: Record<string, UserAccount[]> = {};
  
  for (const [userId, accounts] of accountsCache.entries()) {
    accountsObj[userId] = accounts;
  }

  await atomicWriteFile(ACCOUNTS_FILE, JSON.stringify(accountsObj, null, 2));
}

export async function getUserAccounts(userId: string): Promise<UserAccount[]> {
  const accounts = await loadUserAccounts();
  return accounts.get(userId) || [];
}

export async function addUserAccount(userId: string, account: UserAccount): Promise<void> {
  const accounts = await loadUserAccounts();
  const userAccounts = accounts.get(userId) || [];
  
  if (!userAccounts.find((a) => a.id === account.id)) {
    userAccounts.push(account);
    accounts.set(userId, userAccounts);
    await saveUserAccounts();
  }
}

export async function removeUserAccount(userId: string, accountId: string): Promise<void> {
  const accounts = await loadUserAccounts();
  const userAccounts = accounts.get(userId) || [];
  const filtered = userAccounts.filter((a) => a.id !== accountId);
  accounts.set(userId, filtered);
  await saveUserAccounts();
}

export async function setActiveAccount(userId: string, accountId: string): Promise<void> {
  const accounts = await loadUserAccounts();
  const userAccounts = accounts.get(userId) || [];
  
  for (const account of userAccounts) {
    account.isActive = account.id === accountId;
  }
  
  accounts.set(userId, userAccounts);
  await saveUserAccounts();
}