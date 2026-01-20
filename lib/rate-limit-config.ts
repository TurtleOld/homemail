export interface RateLimitConfig {
  max: number;
  window: number;
  adaptive?: boolean;
  blockDuration?: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  login: {
    max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10),
    window: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW || '900000', 10),
    adaptive: true,
    blockDuration: parseInt(process.env.RATE_LIMIT_LOGIN_BLOCK_DURATION || '900000', 10),
  },
  bulk: {
    max: parseInt(process.env.RATE_LIMIT_BULK_MAX || '10', 10),
    window: parseInt(process.env.RATE_LIMIT_BULK_WINDOW || '60000', 10),
  },
  send: {
    max: parseInt(process.env.RATE_LIMIT_SEND_MAX || '20', 10),
    window: parseInt(process.env.RATE_LIMIT_SEND_WINDOW || '60000', 10),
  },
  api: {
    max: parseInt(process.env.RATE_LIMIT_API_MAX || '100', 10),
    window: parseInt(process.env.RATE_LIMIT_API_WINDOW || '60000', 10),
  },
  default: {
    max: parseInt(process.env.RATE_LIMIT_DEFAULT_MAX || '100', 10),
    window: parseInt(process.env.RATE_LIMIT_DEFAULT_WINDOW || '60000', 10),
  },
};

const IP_WHITELIST = process.env.RATE_LIMIT_IP_WHITELIST
  ? process.env.RATE_LIMIT_IP_WHITELIST.split(',').map((ip) => ip.trim())
  : [];

const IP_BLACKLIST = process.env.RATE_LIMIT_IP_BLACKLIST
  ? process.env.RATE_LIMIT_IP_BLACKLIST.split(',').map((ip) => ip.trim())
  : [];

export function isIpWhitelisted(ip: string): boolean {
  if (IP_WHITELIST.length === 0) {
    return false;
  }

  for (const whitelistedIp of IP_WHITELIST) {
    if (whitelistedIp.includes('/')) {
      const [networkIp, prefix] = whitelistedIp.split('/');
      const prefixLength = parseInt(prefix, 10);
      const networkNum = ipToNumber(networkIp);
      const mask = (0xffffffff << (32 - prefixLength)) >>> 0;
      const ipNum = ipToNumber(ip);

      if ((networkNum & mask) === (ipNum & mask)) {
        return true;
      }
    } else if (ip === whitelistedIp) {
      return true;
    }
  }

  return false;
}

export function isIpBlacklisted(ip: string): boolean {
  if (IP_BLACKLIST.length === 0) {
    return false;
  }

  for (const blacklistedIp of IP_BLACKLIST) {
    if (blacklistedIp.includes('/')) {
      const [networkIp, prefix] = blacklistedIp.split('/');
      const prefixLength = parseInt(prefix, 10);
      const networkNum = ipToNumber(networkIp);
      const mask = (0xffffffff << (32 - prefixLength)) >>> 0;
      const ipNum = ipToNumber(ip);

      if ((networkNum & mask) === (ipNum & mask)) {
        return true;
      }
    } else if (ip === blacklistedIp) {
      return true;
    }
  }

  return false;
}

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return parts[0] * 256 ** 3 + parts[1] * 256 ** 2 + parts[2] * 256 + parts[3];
}
