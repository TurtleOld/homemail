import crypto from 'node:crypto';
import { SecurityLogger } from './security-logger';
import { logger } from './logger';

interface NonceEntry {
  nonce: string;
  timestamp: number;
  used: boolean;
}

const nonceStore = new Map<string, NonceEntry>();
const NONCE_WINDOW = parseInt(process.env.REPLAY_PROTECTION_NONCE_WINDOW || '300000', 10);
const TIMESTAMP_TOLERANCE = parseInt(process.env.REPLAY_PROTECTION_TIMESTAMP_TOLERANCE || '300000', 10);
const MAX_NONCES = 10000;

export interface ReplayCheckResult {
  valid: boolean;
  reason?: string;
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateTimestamp(): number {
  return Date.now();
}

export function checkReplayProtection(
  nonce: string,
  timestamp: number,
  request?: Request
): ReplayCheckResult {
  const now = Date.now();

  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE) {
    if (request) {
      SecurityLogger.logSuspiciousActivity(request, 'Replay attack: timestamp out of tolerance', {
        timestamp,
        now,
        difference: Math.abs(now - timestamp),
      });
    }
    return {
      valid: false,
      reason: 'Timestamp is out of tolerance window',
    };
  }

  const entry = nonceStore.get(nonce);

  if (entry) {
    if (entry.used) {
      if (request) {
        SecurityLogger.logSuspiciousActivity(request, 'Replay attack: nonce already used', {
          nonce: nonce.substring(0, 8),
          originalTimestamp: entry.timestamp,
        });
      }
      return {
        valid: false,
        reason: 'Nonce has already been used',
      };
    }

    if (now - entry.timestamp > NONCE_WINDOW) {
      nonceStore.delete(nonce);
      if (request) {
        SecurityLogger.logSuspiciousActivity(request, 'Replay attack: nonce expired', {
          nonce: nonce.substring(0, 8),
          age: now - entry.timestamp,
        });
      }
      return {
        valid: false,
        reason: 'Nonce has expired',
      };
    }

    entry.used = true;
    return { valid: true };
  }

  if (nonceStore.size >= MAX_NONCES) {
    cleanupOldNonces();
  }

  nonceStore.set(nonce, {
    nonce,
    timestamp,
    used: true,
  });

  return { valid: true };
}

export function cleanupOldNonces(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, entry] of nonceStore.entries()) {
    if (now - entry.timestamp > NONCE_WINDOW || entry.used) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    nonceStore.delete(key);
  }

  logger.debug(`[ReplayProtection] Cleaned up ${keysToDelete.length} nonces`);
}

setInterval(cleanupOldNonces, 5 * 60 * 1000);

export function validateRequestNonce(
  request: Request,
  nonce?: string,
  timestamp?: number
): ReplayCheckResult {
  const headerNonce = request.headers.get('x-nonce') || nonce;
  const headerTimestamp = request.headers.get('x-timestamp');

  if (!headerNonce) {
    return {
      valid: false,
      reason: 'Nonce is required',
    };
  }

  const requestTimestamp = timestamp || (headerTimestamp ? parseInt(headerTimestamp, 10) : Date.now());

  if (isNaN(requestTimestamp)) {
    return {
      valid: false,
      reason: 'Invalid timestamp',
    };
  }

  return checkReplayProtection(headerNonce, requestTimestamp, request);
}
