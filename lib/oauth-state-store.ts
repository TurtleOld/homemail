/**
 * Temporary storage for OAuth state and PKCE verifiers
 * Used during Authorization Code Flow to prevent CSRF and validate PKCE
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { encryptData, decryptData } from './storage';

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data'));
const STATE_FILE = path.join(DATA_DIR, 'oauth_states.enc');

// States are short-lived (10 minutes max)
const STATE_TTL = 10 * 60 * 1000; // 10 minutes

export interface OAuthState {
  state: string;
  codeVerifier: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory cache for fast access
let statesCache: Map<string, OAuthState> | null = null;

// Track states currently being consumed to prevent race conditions from duplicate requests
const consumingStates = new Set<string>();

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

/**
 * Load all states from encrypted file
 */
async function loadStates(): Promise<Map<string, OAuthState>> {
  if (statesCache !== null) {
    return statesCache;
  }

  await ensureDataDir();
  statesCache = new Map();

  try {
    const encryptedData = await fs.readFile(STATE_FILE, 'utf-8');
    const decryptedData = decryptData(encryptedData);
    
    if (decryptedData) {
      const states = JSON.parse(decryptedData) as Record<string, OAuthState>;
      const now = Date.now();
      
      // Only load non-expired states
      for (const [state, data] of Object.entries(states)) {
        if (data.expiresAt > now) {
          statesCache.set(state, data);
        }
      }
    }
  } catch {
    // File doesn't exist or corrupted - start fresh
  }

  return statesCache;
}

/**
 * Save states to encrypted file
 */
async function saveStates(): Promise<void> {
  if (statesCache === null) {
    return;
  }

  await ensureDataDir();
  const statesObj: Record<string, OAuthState> = {};
  
  for (const [state, data] of statesCache.entries()) {
    statesObj[state] = data;
  }

  const jsonData = JSON.stringify(statesObj);
  const encryptedData = encryptData(jsonData);
  await fs.writeFile(STATE_FILE, encryptedData, 'utf-8');
}

/**
 * Store OAuth state + code verifier
 */
export async function storeOAuthState(state: string, codeVerifier: string): Promise<void> {
  const states = await loadStates();
  
  const now = Date.now();
  const oauthState: OAuthState = {
    state,
    codeVerifier,
    createdAt: now,
    expiresAt: now + STATE_TTL,
  };

  states.set(state, oauthState);
  statesCache = states;
  await saveStates();
}

/**
 * Retrieve and remove OAuth state (one-time use)
 * Protected against race conditions from duplicate requests (e.g. nginx doubling)
 */
export async function consumeOAuthState(state: string): Promise<string | null> {
  // If another request is already consuming this state, reject immediately
  if (consumingStates.has(state)) {
    return null;
  }

  consumingStates.add(state);
  try {
    const states = await loadStates();
    const data = states.get(state);

    if (!data) {
      return null;
    }

    // Check expiration
    if (data.expiresAt <= Date.now()) {
      states.delete(state);
      statesCache = states;
      await saveStates();
      return null;
    }

    // Remove state (one-time use)
    states.delete(state);
    statesCache = states;
    await saveStates();

    return data.codeVerifier;
  } finally {
    consumingStates.delete(state);
  }
}

/**
 * Clean up expired states (called periodically)
 */
export async function cleanupExpiredStates(): Promise<void> {
  const states = await loadStates();
  const now = Date.now();
  let hasChanges = false;

  for (const [state, data] of states.entries()) {
    if (data.expiresAt <= now) {
      states.delete(state);
      hasChanges = true;
    }
  }

  if (hasChanges) {
    statesCache = states;
    await saveStates();
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
