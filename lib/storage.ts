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

/**
 * Count the live (non-expired) sessions belonging to an account.
 *
 * The OAuth token is stored once per account and shared by every session of
 * that account, so callers need to know whether any other device still relies
 * on it. Expiry is re-checked here because `loadSessions` only filters at load
 * time and the cache may still hold sessions that expired since.
 */
export async function countAccountSessions(accountId: string): Promise<number> {
  const sessions = await loadSessions();
  const now = Date.now();
  let count = 0;

  for (const session of sessions.values()) {
    if (session.accountId === accountId && session.expiresAt > now) {
      count++;
    }
  }

  return count;
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

/**
 * Whitelist pattern for storage keys: alphanumeric, hyphens, underscores, colons,
 * `@` and `.`. The last two are required because callers key storage by account
 * identifiers that are real email addresses (e.g. `messageLabels:admin@rem.ru`).
 * `..` is rejected explicitly below since a lone `.` is otherwise permitted.
 *
 * The pre-2026-03 implementation only replaced `:` with `_` and applied no
 * validation, so `@` and `.` were already passed through into existing
 * on-disk filenames unescaped. Widening the whitelist (rather than changing
 * the filename encoding below) keeps this validation compatible with any
 * files created before that hardening.
 */
const STORAGE_KEY_RE = /^[a-zA-Z0-9_\-:@.]{1,256}$/;

/**
 * Convert a storage key to an absolute file path that is guaranteed to stay
 * inside DATA_DIR.  Throws a SecurityError-style Error if the key is invalid.
 */
function storageKeyToPath(key: string): string {
  if (!STORAGE_KEY_RE.test(key) || key.includes('..')) {
    throw Object.assign(new Error('Invalid storage key'), { code: 'SECURITY_INVALID_KEY' });
  }
  // Colons → underscores (filesystem-safe); `@` and `.` pass through unchanged
  // to match the on-disk filenames this validation predates.
  const filename = `${key.replace(/:/g, '_')}.json`;
  const resolved = path.resolve(DATA_DIR, filename);
  // Must stay inside DATA_DIR (path.resolve already normalises .. etc.)
  if (!resolved.startsWith(path.resolve(DATA_DIR) + path.sep) &&
      resolved !== path.resolve(DATA_DIR)) {
    throw Object.assign(new Error('Storage key resolves outside data directory'), { code: 'SECURITY_PATH_TRAVERSAL' });
  }
  return resolved;
}

const STORAGE_LOCK_TIMEOUT_MS = 5_000;
const STORAGE_LOCK_RETRY_MS = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface StorageLock {
  path: string;
  token: string;
}

/**
 * Create a file exclusively and write its owner token into it.
 *
 * Exclusive creation (`wx`) is atomic at the operating system level, so only
 * one process can own the file at a time. Returns null when the path already
 * exists. A file that could not be written is removed instead of being left
 * behind as an unreadable lock.
 */
async function createExclusiveFile(filePath: string, token: string): Promise<string | null> {
  let handle;
  try {
    handle = await fs.open(filePath, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return null;
    }
    throw error;
  }

  try {
    await handle.writeFile(token, 'utf-8');
    return token;
  } catch (error) {
    await fs.unlink(filePath).catch(() => {});
    throw error;
  } finally {
    await handle.close().catch(() => {});
  }
}

/**
 * Remove a file only if it still contains this caller's token.
 *
 * Reading the owner before unlinking prevents a slow transaction from
 * deleting a lock that a newer owner has already created at the same path.
 */
async function releaseTokenFile(filePath: string, token: string): Promise<void> {
  try {
    const owner = await fs.readFile(filePath, 'utf-8');
    if (owner === token) {
      await fs.unlink(filePath);
    }
  } catch {
    // Already gone, or reclaimed by another process.
  }
}

/** Read the PID from a `<pid>:<token>` lock file, or null if malformed. */
function lockOwnerPid(content: string): number | null {
  const pid = Number(content.split(':')[0]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * Report whether a process is still running.
 *
 * `EPERM` means the process exists but belongs to another user, so it counts
 * as alive; only `ESRCH` means it is gone.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Remove the lock file only when its recorded owner process is gone.
 *
 * Age alone never justifies deletion: a live owner can be slow because of
 * filesystem I/O, and unlinking its lock would let a second writer run in
 * parallel. A malformed lock is treated as owned by an unknown live process,
 * so it is never deleted automatically; waiting ends with a timeout instead.
 * The same applies when the dead owner's PID has been reused by a live
 * process: the lock survives and callers time out rather than risk a steal.
 *
 * Deletion runs under a short-lived `.reap` guard. Without it two waiters
 * could both see a dead owner and one could unlink the fresh lock that the
 * other had just created. The guard lives for microseconds and is removed
 * only by the process that created it; if a process dies while holding it,
 * automatic reclamation stops until an operator removes the guard file.
 */
async function reapDeadLock(lockPath: string): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(lockPath, 'utf-8');
  } catch {
    return;
  }

  const ownerPid = lockOwnerPid(content);
  if (ownerPid === null || isProcessAlive(ownerPid)) {
    return;
  }

  const reapPath = `${lockPath}.reap`;
  const token = `${process.pid}:${crypto.randomUUID()}`;
  if ((await createExclusiveFile(reapPath, token)) === null) {
    return;
  }

  try {
    const currentContent = await fs.readFile(lockPath, 'utf-8').catch(() => null);
    const currentOwnerPid = currentContent === null ? null : lockOwnerPid(currentContent);
    if (currentOwnerPid === null || isProcessAlive(currentOwnerPid)) {
      return;
    }

    await fs.unlink(lockPath).catch(() => {});
  } finally {
    await releaseTokenFile(reapPath, token);
  }
}

/**
 * Create the lock file for one storage key.
 *
 * Any number of processes that share DATA_DIR contend for the same file.
 * When another owner already holds it, waiting continues until the deadline;
 * a lock whose owner process is gone is reclaimed by `reapDeadLock`.
 */
async function acquireStorageLock(key: string, deadline: number): Promise<StorageLock> {
  const lockPath = `${storageKeyToPath(key)}.lock`;
  const token = `${process.pid}:${crypto.randomUUID()}`;

  for (;;) {
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    if ((await createExclusiveFile(lockPath, token)) !== null) {
      return { path: lockPath, token };
    }

    if (Date.now() >= deadline) {
      throw Object.assign(new Error(`Timed out waiting for storage lock: ${key}`), {
        code: 'STORAGE_LOCK_TIMEOUT',
      });
    }

    await reapDeadLock(lockPath);
    await sleep(STORAGE_LOCK_RETRY_MS);
  }
}

/**
 * Run a read-modify-write cycle on one or more storage keys under exclusive
 * locks, so concurrent requests cannot overwrite each other's changes.
 *
 * Locks are files in DATA_DIR, so the guarantee covers every process that
 * shares that directory in one PID namespace (Next.js worker processes and
 * cron scripts). Owner liveness is checked by PID, therefore containers with
 * separate PID namespaces must not share DATA_DIR; HomeMail is deployed as a
 * single instance with one data volume, so that case is out of scope.
 *
 * Keys are locked in sorted order to avoid deadlocks between transactions
 * that touch the same pair of collections. The cycle body must do its reads
 * and writes through this module.
 */
export async function withStorageLock<T>(
  keys: string | string[],
  fn: () => Promise<T>
): Promise<T> {
  const orderedKeys = [...new Set(Array.isArray(keys) ? keys : [keys])].sort();
  const deadline = Date.now() + STORAGE_LOCK_TIMEOUT_MS;
  const held: StorageLock[] = [];

  try {
    for (const key of orderedKeys) {
      held.push(await acquireStorageLock(key, deadline));
    }
    return await fn();
  } finally {
    await Promise.all(held.reverse().map((lock) => releaseTokenFile(lock.path, lock.token)));
  }
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
