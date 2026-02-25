/**
 * Temporary storage for OAuth state and PKCE verifiers
 * Used during Authorization Code Flow to prevent CSRF and validate PKCE
 *
 * Uses file-based locking to handle concurrent requests across multiple
 * Node.js worker processes (Next.js production spawns several workers).
 */

import fs from 'node:fs/promises';
import { openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { encryptData, decryptData } from './storage';

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data'));
const STATE_FILE = path.join(DATA_DIR, 'oauth_states.enc');
const LOCK_FILE = path.join(DATA_DIR, 'oauth_states.lock');

// States are short-lived (10 minutes max)
const STATE_TTL = 10 * 60 * 1000; // 10 minutes

// Lock acquisition parameters
const LOCK_RETRY_INTERVAL = 20; // ms between retries
const LOCK_MAX_WAIT = 5000; // ms max wait for lock
const LOCK_STALE_AFTER = 10000; // ms after which a lock is considered stale

export interface OAuthState {
  state: string;
  codeVerifier: string;
  createdAt: number;
  expiresAt: number;
  consumedAt?: number; // set when consumed, kept briefly so duplicate requests can detect it
  clientIp?: string; // IP of the client that initiated this authorization
  authorizationUrl?: string; // full authorization URL for deduplication
}

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

/**
 * Acquire an exclusive file lock.
 * Uses O_EXCL (exclusive create) which is atomic on all POSIX filesystems.
 */
async function acquireLock(): Promise<void> {
  await ensureDataDir();
  const deadline = Date.now() + LOCK_MAX_WAIT;

  while (Date.now() < deadline) {
    try {
      // O_EXCL ensures atomic creation - only one process succeeds
      const fd = openSync(LOCK_FILE, 'wx');
      // Write PID + timestamp for stale detection
      const { writeSync } = await import('node:fs');
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      closeSync(fd);
      return;
    } catch {
      // Lock file exists - check if stale
      try {
        const lockData = JSON.parse(await fs.readFile(LOCK_FILE, 'utf-8'));
        if (Date.now() - lockData.at > LOCK_STALE_AFTER) {
          // Stale lock - remove and retry immediately
          try { unlinkSync(LOCK_FILE); } catch { /* ignore */ }
          continue;
        }
      } catch {
        // Lock file disappeared or unreadable - retry
      }
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL));
    }
  }

  throw new Error('Timeout waiting for OAuth state lock');
}

function releaseLock(): void {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // Already removed - fine
  }
}

/**
 * Read states directly from file (bypasses cache, for cross-process consistency)
 */
async function readStatesFromFile(): Promise<Map<string, OAuthState>> {
  const map = new Map<string, OAuthState>();
  try {
    const encryptedData = await fs.readFile(STATE_FILE, 'utf-8');
    const decryptedData = decryptData(encryptedData);
    if (decryptedData) {
      const states = JSON.parse(decryptedData) as Record<string, OAuthState>;
      const now = Date.now();
      for (const [state, data] of Object.entries(states)) {
        if (data.expiresAt > now) {
          map.set(state, data);
        }
      }
    }
  } catch {
    // File doesn't exist or corrupted - start fresh
  }
  return map;
}

/**
 * Write states directly to file
 */
async function writeStatesToFile(states: Map<string, OAuthState>): Promise<void> {
  await ensureDataDir();
  const statesObj: Record<string, OAuthState> = {};
  for (const [state, data] of states.entries()) {
    statesObj[state] = data;
  }
  const encryptedData = encryptData(JSON.stringify(statesObj));
  await fs.writeFile(STATE_FILE, encryptedData, 'utf-8');
}

// Window within which we reuse an existing authorize request from the same IP
const DEDUP_WINDOW = 5000; // 5 seconds

/**
 * Store OAuth state + code verifier
 */
export async function storeOAuthState(
  state: string,
  codeVerifier: string,
  opts?: { clientIp?: string; authorizationUrl?: string },
): Promise<void> {
  await acquireLock();
  try {
    const states = await readStatesFromFile();
    const now = Date.now();
    states.set(state, {
      state,
      codeVerifier,
      createdAt: now,
      expiresAt: now + STATE_TTL,
      clientIp: opts?.clientIp,
      authorizationUrl: opts?.authorizationUrl,
    });
    await writeStatesToFile(states);
  } finally {
    releaseLock();
  }
}

/**
 * Find a recent (within DEDUP_WINDOW) unconsumed state for the given IP.
 * Returns the stored authorization URL if found, null otherwise.
 * Used to prevent duplicate authorize requests from the same client.
 */
export async function findRecentStateByIp(clientIp: string): Promise<string | null> {
  await acquireLock();
  try {
    const states = await readStatesFromFile();
    const now = Date.now();
    for (const data of states.values()) {
      if (
        data.clientIp === clientIp &&
        data.authorizationUrl &&
        !data.consumedAt &&
        now - data.createdAt < DEDUP_WINDOW
      ) {
        return data.authorizationUrl;
      }
    }
    return null;
  } finally {
    releaseLock();
  }
}

/**
 * Check if a state was recently consumed (by another worker).
 * Returns true if the state exists and has a consumedAt timestamp.
 */
export async function isStateRecentlyConsumed(state: string): Promise<boolean> {
  await acquireLock();
  try {
    const states = await readStatesFromFile();
    const data = states.get(state);
    return data !== undefined && data.consumedAt !== undefined;
  } finally {
    releaseLock();
  }
}

/**
 * Retrieve and consume OAuth state (one-time use).
 *
 * Uses file locking to be safe across multiple Node.js worker processes.
 * Returns the codeVerifier if valid and not yet consumed, null otherwise.
 *
 * "Already consumed" states are kept for 30 seconds with consumedAt set,
 * so that a duplicate request arriving within that window gets null (not
 * an error) and the callback handler can check the session instead.
 */
export async function consumeOAuthState(state: string): Promise<string | null> {
  await acquireLock();
  try {
    const states = await readStatesFromFile();
    const data = states.get(state);

    if (!data) {
      return null;
    }

    // Already consumed by another worker - return null
    // The callback handler will check for an existing session
    if (data.consumedAt !== undefined) {
      return null;
    }

    // Expired
    if (data.expiresAt <= Date.now()) {
      states.delete(state);
      await writeStatesToFile(states);
      return null;
    }

    const codeVerifier = data.codeVerifier;

    // Mark as consumed (keep for 30s so duplicate requests can detect it)
    states.set(state, { ...data, consumedAt: Date.now(), expiresAt: Date.now() + 30_000 });
    await writeStatesToFile(states);

    return codeVerifier;
  } finally {
    releaseLock();
  }
}

/**
 * Clean up expired and old consumed states (called periodically)
 */
export async function cleanupExpiredStates(): Promise<void> {
  await acquireLock();
  try {
    const states = await readStatesFromFile();
    const now = Date.now();
    let hasChanges = false;

    for (const [state, data] of states.entries()) {
      if (data.expiresAt <= now) {
        states.delete(state);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await writeStatesToFile(states);
    }
  } finally {
    releaseLock();
  }
}

// Cleanup expired states every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    cleanupExpiredStates().catch((err) => {
      console.error('Failed to cleanup expired OAuth states:', err);
    });
  }, 5 * 60 * 1000);
}
