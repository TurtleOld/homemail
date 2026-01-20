import { SecurityLogger } from './security-logger';
import { logger } from './logger';

interface BruteForceEntry {
  attempts: number;
  blockedUntil?: number;
  lastAttempt: number;
  emails: Set<string>;
}

const bruteForceStore = new Map<string, BruteForceEntry>();

const MAX_ATTEMPTS_PER_IP = parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS_IP || '10', 10);
const MAX_ATTEMPTS_PER_EMAIL = parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS_EMAIL || '5', 10);
const BLOCK_DURATION_IP = parseInt(process.env.BRUTE_FORCE_BLOCK_DURATION_IP || '3600000', 10);
const BLOCK_DURATION_EMAIL = parseInt(process.env.BRUTE_FORCE_BLOCK_DURATION_EMAIL || '900000', 10);
const WINDOW_MS = parseInt(process.env.BRUTE_FORCE_WINDOW || '900000', 10);

export interface BruteForceCheckResult {
  allowed: boolean;
  blockedUntil?: number;
  reason?: string;
  remainingAttempts?: number;
}

export function checkBruteForce(
  ip: string,
  email?: string,
  request?: Request
): BruteForceCheckResult {
  const now = Date.now();
  const ipKey = `ip:${ip}`;
  const emailKey = email ? `email:${email}` : null;

  let ipEntry = bruteForceStore.get(ipKey);
  let emailEntry = emailKey ? bruteForceStore.get(emailKey) : null;

  if (ipEntry && ipEntry.blockedUntil && ipEntry.blockedUntil > now) {
    if (request) {
      SecurityLogger.logLoginBlocked(request, email || 'unknown', 'IP blocked due to brute force');
    }
    return {
      allowed: false,
      blockedUntil: ipEntry.blockedUntil,
      reason: 'IP address is temporarily blocked due to too many failed login attempts',
    };
  }

  if (emailEntry && emailEntry.blockedUntil && emailEntry.blockedUntil > now) {
    if (request) {
      SecurityLogger.logLoginBlocked(request, email || 'unknown', 'Email blocked due to brute force');
    }
    return {
      allowed: false,
      blockedUntil: emailEntry.blockedUntil,
      reason: 'Email address is temporarily blocked due to too many failed login attempts',
    };
  }

  if (!ipEntry) {
    ipEntry = {
      attempts: 0,
      lastAttempt: now,
      emails: new Set(),
    };
    bruteForceStore.set(ipKey, ipEntry);
  }

  if (email && !emailEntry && emailKey) {
    emailEntry = {
      attempts: 0,
      lastAttempt: now,
      emails: new Set(),
    };
    bruteForceStore.set(emailKey, emailEntry);
  }

  if (ipEntry.lastAttempt + WINDOW_MS < now) {
    ipEntry.attempts = 0;
    ipEntry.emails.clear();
    ipEntry.blockedUntil = undefined;
  }

  if (emailEntry && emailEntry.lastAttempt + WINDOW_MS < now) {
    emailEntry.attempts = 0;
    emailEntry.blockedUntil = undefined;
  }

  if (email) {
    ipEntry.emails.add(email);
  }

  const totalAttempts = ipEntry.attempts;
  const emailAttempts = emailEntry?.attempts || 0;

  if (totalAttempts >= MAX_ATTEMPTS_PER_IP) {
    ipEntry.blockedUntil = now + BLOCK_DURATION_IP;
    if (request) {
      SecurityLogger.logIpBlocked(request, 'Too many failed login attempts from IP', BLOCK_DURATION_IP);
      SecurityLogger.logLoginBlocked(request, email || 'unknown', 'IP blocked due to brute force');
    }
    return {
      allowed: false,
      blockedUntil: ipEntry.blockedUntil,
      reason: 'Too many failed login attempts from this IP address',
    };
  }

  if (emailEntry && emailAttempts >= MAX_ATTEMPTS_PER_EMAIL) {
    emailEntry.blockedUntil = now + BLOCK_DURATION_EMAIL;
    if (request) {
      SecurityLogger.logLoginBlocked(request, email || 'unknown', 'Email blocked due to brute force');
    }
    return {
      allowed: false,
      blockedUntil: emailEntry.blockedUntil,
      reason: 'Too many failed login attempts for this email address',
    };
  }

  return {
    allowed: true,
    remainingAttempts: Math.min(
      MAX_ATTEMPTS_PER_IP - totalAttempts,
      emailEntry ? MAX_ATTEMPTS_PER_EMAIL - emailAttempts : MAX_ATTEMPTS_PER_IP - totalAttempts
    ),
  };
}

export function recordFailedAttempt(ip: string, email?: string): void {
  const ipKey = `ip:${ip}`;
  const emailKey = email ? `email:${email}` : null;

  let ipEntry = bruteForceStore.get(ipKey);
  let emailEntry = emailKey ? bruteForceStore.get(emailKey) : null;

  if (!ipEntry) {
    ipEntry = {
      attempts: 0,
      lastAttempt: Date.now(),
      emails: new Set(),
    };
    bruteForceStore.set(ipKey, ipEntry);
  }

  if (email && !emailEntry && emailKey) {
    emailEntry = {
      attempts: 0,
      lastAttempt: Date.now(),
      emails: new Set(),
    };
    bruteForceStore.set(emailKey, emailEntry);
  }

  ipEntry.attempts += 1;
  ipEntry.lastAttempt = Date.now();

  if (email) {
    ipEntry.emails.add(email);
    if (emailEntry) {
      emailEntry.attempts += 1;
      emailEntry.lastAttempt = Date.now();
    }
  }
}

export function recordSuccess(ip: string, email?: string): void {
  const ipKey = `ip:${ip}`;
  const emailKey = email ? `email:${email}` : null;

  const ipEntry = bruteForceStore.get(ipKey);
  const emailEntry = emailKey ? bruteForceStore.get(emailKey) : null;

  if (ipEntry) {
    ipEntry.attempts = Math.max(0, ipEntry.attempts - 1);
  }

  if (emailEntry) {
    emailEntry.attempts = Math.max(0, emailEntry.attempts - 1);
  }
}

export function cleanupBruteForceStore(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, entry] of bruteForceStore.entries()) {
    if (
      entry.lastAttempt + WINDOW_MS < now &&
      (!entry.blockedUntil || entry.blockedUntil < now)
    ) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    bruteForceStore.delete(key);
  }

  logger.debug(`[BruteForceProtection] Cleaned up ${keysToDelete.length} entries`);
}

setInterval(cleanupBruteForceStore, 5 * 60 * 1000);
