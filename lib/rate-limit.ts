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

/**
 * Resets rate-limit bucket for a given identifier+type.
 * Useful for login flows where we only want to count failed attempts,
 * and clear the counter on successful auth.
 */
export function resetRateLimit(identifier: string, type: string = 'default'): void {
  const key = getRateLimitKey(identifier, type);
  rateLimitStore.delete(key);
}

type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number; blockedUntil?: number };

function evaluateRateLimit(
  identifier: string,
  type: string,
  request: Request | undefined,
  options: { consume: boolean }
): RateLimitResult {
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
    // New window.
    if (!options.consume) {
      return {
        allowed: true,
        remaining: config.max,
        resetAt: now + config.window,
      };
    }

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

  // If we are only previewing, do not mutate the state.
  if (!options.consume) {
    return {
      allowed: entry.count < config.max,
      remaining: Math.max(0, config.max - entry.count),
      resetAt: entry.resetAt,
      blockedUntil: entry.blockedUntil,
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

/**
 * Default rate-limit check (consumes one token).
 * Used for non-auth APIs.
 */
export function checkRateLimit(identifier: string, type: string = 'default', request?: Request): RateLimitResult {
  return evaluateRateLimit(identifier, type, request, { consume: true });
}

/**
 * Preview rate-limit status without consuming.
 * Useful for login flows where we only want to count failed attempts.
 */
export function previewRateLimit(identifier: string, type: string = 'default', request?: Request): RateLimitResult {
  return evaluateRateLimit(identifier, type, request, { consume: false });
}

/**
 * Consume one rate-limit token.
 * Intended to be called on auth failures (401).
 */
export function consumeRateLimit(identifier: string, type: string = 'default', request?: Request): RateLimitResult {
  return evaluateRateLimit(identifier, type, request, { consume: true });
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
