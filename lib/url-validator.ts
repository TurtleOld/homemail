import { SecurityLogger } from './security-logger';
import { logger } from './logger';

const PRIVATE_IP_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '224.0.0.0', end: '239.255.255.255' },
];

const ALLOWED_DOCKER_NETWORKS = process.env.ALLOWED_DOCKER_NETWORKS
  ? process.env.ALLOWED_DOCKER_NETWORKS.split(',').map((n) => n.trim())
  : [];

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return parts[0] * 256 ** 3 + parts[1] * 256 ** 2 + parts[2] * 256 + parts[3];
}

function isPrivateIp(ip: string): boolean {
  const ipNum = ipToNumber(ip);

  for (const range of PRIVATE_IP_RANGES) {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);
    if (ipNum >= startNum && ipNum <= endNum) {
      return true;
    }
  }

  return false;
}

function isAllowedDockerNetwork(ip: string): boolean {
  if (ALLOWED_DOCKER_NETWORKS.length === 0) {
    return false;
  }

  for (const network of ALLOWED_DOCKER_NETWORKS) {
    if (network.includes('/')) {
      const [networkIp, prefix] = network.split('/');
      const prefixLength = parseInt(prefix, 10);
      const networkNum = ipToNumber(networkIp);
      const mask = (0xffffffff << (32 - prefixLength)) >>> 0;
      const ipNum = ipToNumber(ip);

      if ((networkNum & mask) === (ipNum & mask)) {
        return true;
      }
    } else if (ip.startsWith(network)) {
      return true;
    }
  }

  return false;
}

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
  resolvedIp?: string;
}

export async function validateUrl(
  url: string,
  request?: Request,
  allowPrivateIps: boolean = false
): Promise<UrlValidationResult> {
  try {
    const parsedUrl = new URL(url);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        valid: false,
        reason: 'Only HTTP and HTTPS protocols are allowed',
      };
    }

    const hostname = parsedUrl.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      if (!allowPrivateIps) {
        if (request) {
          SecurityLogger.logSsrfAttempt(request, url, { reason: 'localhost_blocked' });
        }
        return {
          valid: false,
          reason: 'localhost is not allowed',
        };
      }
    }

    if (isPrivateIp(hostname)) {
      if (!allowPrivateIps && !isAllowedDockerNetwork(hostname)) {
        if (request) {
          SecurityLogger.logSsrfAttempt(request, url, {
            reason: 'private_ip_blocked',
            hostname,
          });
        }
        return {
          valid: false,
          reason: 'Private IP addresses are not allowed',
        };
      }
    }

    try {
      const dns = await import('node:dns/promises');
      const resolved = await dns.lookup(hostname, { family: 4 });

      if (Array.isArray(resolved)) {
        for (const addr of resolved) {
          if (isPrivateIp(addr.address)) {
            if (!allowPrivateIps && !isAllowedDockerNetwork(addr.address)) {
              if (request) {
                SecurityLogger.logSsrfAttempt(request, url, {
                  reason: 'dns_resolves_to_private_ip',
                  resolvedIp: addr.address,
                });
              }
              return {
                valid: false,
                reason: 'DNS resolves to private IP address',
                resolvedIp: addr.address,
              };
            }
          }
        }
      } else if (resolved.address) {
        if (isPrivateIp(resolved.address)) {
          if (!allowPrivateIps && !isAllowedDockerNetwork(resolved.address)) {
            if (request) {
              SecurityLogger.logSsrfAttempt(request, url, {
                reason: 'dns_resolves_to_private_ip',
                resolvedIp: resolved.address,
              });
            }
            return {
              valid: false,
              reason: 'DNS resolves to private IP address',
              resolvedIp: resolved.address,
            };
          }
        }
      }
    } catch (dnsError) {
      logger.warn(`[UrlValidator] DNS lookup failed for ${hostname}:`, dnsError);
    }

    const allowedDomains = process.env.ALLOWED_EXTERNAL_DOMAINS
      ? process.env.ALLOWED_EXTERNAL_DOMAINS.split(',').map((d) => d.trim())
      : [];

    if (allowedDomains.length > 0) {
      const isAllowed = allowedDomains.some((domain) => {
        if (domain.startsWith('.')) {
          return hostname === domain.slice(1) || hostname.endsWith(domain);
        }
        return hostname === domain;
      });

      if (!isAllowed) {
        if (request) {
          SecurityLogger.logSsrfAttempt(request, url, {
            reason: 'domain_not_in_whitelist',
            hostname,
          });
        }
        return {
          valid: false,
          reason: 'Domain is not in whitelist',
        };
      }
    }

    return {
      valid: true,
    };
  } catch (error) {
    if (request) {
      SecurityLogger.logSsrfAttempt(request, url, {
        reason: 'invalid_url',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return {
      valid: false,
      reason: error instanceof Error ? error.message : 'Invalid URL',
    };
  }
}

export function isUrlSafe(url: string): boolean {
  try {
    const parsed = new URL(url);
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:'];
    return !dangerousProtocols.includes(parsed.protocol.toLowerCase());
  } catch {
    return false;
  }
}
