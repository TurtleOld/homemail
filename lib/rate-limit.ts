interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMITS = {
  login: { max: 5, window: 15 * 60 * 1000 },
  bulk: { max: 10, window: 60 * 1000 },
  default: { max: 100, window: 60 * 1000 },
};

export function getRateLimitKey(identifier: string, type: keyof typeof RATE_LIMITS): string {
  return `${type}:${identifier}`;
}

export function checkRateLimit(
  identifier: string,
  type: keyof typeof RATE_LIMITS = 'default'
): { allowed: boolean; remaining: number; resetAt: number } {
  const config = RATE_LIMITS[type];
  const key = getRateLimitKey(identifier, type);
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.window,
    };
    rateLimitStore.set(key, newEntry);
    return {
      allowed: true,
      remaining: config.max - 1,
      resetAt: newEntry.resetAt,
    };
  }

  if (entry.count >= config.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
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
