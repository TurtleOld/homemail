import { RATE_LIMITS, isIpWhitelisted, isIpBlacklisted, type RateLimitConfig } from './rate-limit-config';
import { SecurityLogger } from './security-logger';

interface RateLimitEntry {
  count: number;
  resetAt: number;
  blockedUntil?: number;
  violations: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function getRateLimitKey(identifier: string, type: string): string {
  return `${type}:${identifier}`;
}

export function checkRateLimit(
  identifier: string,
  type: string = 'default',
  request?: Request
): { allowed: boolean; remaining: number; resetAt: number; blockedUntil?: number } {
  if (isIpWhitelisted(identifier)) {
    return {
      allowed: true,
      remaining: Infinity,
      resetAt: Date.now() + 60000,
    };
  }

  if (isIpBlacklisted(identifier)) {
    if (request) {
      SecurityLogger.logRateLimitExceeded(request, identifier, type);
    }
    return {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
      blockedUntil: Date.now() + 3600000,
    };
  }

  const config: RateLimitConfig = RATE_LIMITS[type] || RATE_LIMITS.default;
  const key = getRateLimitKey(identifier, type);
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (entry?.blockedUntil && entry.blockedUntil > now) {
    if (request) {
      SecurityLogger.logRateLimitExceeded(request, identifier, type);
    }
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      blockedUntil: entry.blockedUntil,
    };
  }

  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.window,
      violations: 0,
    };
    rateLimitStore.set(key, newEntry);
    return {
      allowed: true,
      remaining: config.max - 1,
      resetAt: newEntry.resetAt,
    };
  }

  if (entry.count >= config.max) {
    entry.violations += 1;

    if (config.adaptive && entry.violations > 2) {
      const blockDuration = config.blockDuration || config.window * 2;
      entry.blockedUntil = now + blockDuration;
      entry.resetAt = now + blockDuration;
    }

    if (request) {
      SecurityLogger.logRateLimitExceeded(request, identifier, type);
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      blockedUntil: entry.blockedUntil,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: config.max - entry.count,
    resetAt: entry.resetAt,
  };
}

export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
