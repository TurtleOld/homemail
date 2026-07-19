import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 128;
const CACHE_MAX_BYTES = 32 * 1024 * 1024;
const MAX_CONCURRENT_FETCHES = 6;
const MAX_QUEUED_FETCHES = 64;

export type ProtectedImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/avif';

export interface ProtectedImageResult {
  data: Buffer;
  mime: ProtectedImageMime;
  cacheStatus: 'hit' | 'miss';
}

export class ProtectedImageError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ProtectedImageError';
  }
}

interface HopResponse {
  status: number;
  headers: Record<string, string | undefined>;
  data: Buffer;
}

export interface ProtectedImageFetcherDependencies {
  resolve?: (hostname: string) => Promise<string[]>;
  requestHop?: (url: URL, pinnedAddress: string, deadline: number) => Promise<HopResponse>;
  now?: () => number;
}

interface CacheEntry {
  data: Buffer;
  mime: ProtectedImageMime;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
let cacheBytes = 0;
let activeFetches = 0;
const waiters: Array<() => void> = [];

function ipv4Number(ip: string): number {
  return ip.split('.').reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function ipv4InCidr(ip: string, network: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(ip) & mask) === (ipv4Number(network) & mask);
}

const BLOCKED_IPV4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function expandIpv6(ip: string): bigint | null {
  const withoutZone = ip.split('%')[0].toLowerCase();
  if (withoutZone.includes('.')) {
    const lastColon = withoutZone.lastIndexOf(':');
    const v4 = withoutZone.slice(lastColon + 1);
    if (net.isIP(v4) !== 4) return null;
    const value = ipv4Number(v4);
    return expandIpv6(`${withoutZone.slice(0, lastColon)}:${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`);
  }
  const sides = withoutZone.split('::');
  if (sides.length > 2) return null;
  const left = sides[0] ? sides[0].split(':') : [];
  const right = sides[1] ? sides[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((sides.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = [...left, ...Array(missing).fill('0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.reduce((value, part) => (value << 16n) | BigInt(parseInt(part, 16)), 0n);
}

function ipv6InCidr(value: bigint, network: string, prefix: number): boolean {
  const networkValue = expandIpv6(network);
  if (networkValue === null) return false;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (networkValue >> shift);
}

function sameAddress(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftFamily = net.isIP(left);
  const rightFamily = net.isIP(right);
  if (leftFamily === 4 && rightFamily === 4) return ipv4Number(left) === ipv4Number(right);
  const leftValue = expandIpv6(left);
  const rightValue = expandIpv6(right);
  if (leftFamily === 6 && rightFamily === 4 && leftValue !== null && ipv6InCidr(leftValue, '::ffff:0:0', 96)) {
    return Number(leftValue & 0xffffffffn) === ipv4Number(right);
  }
  if (leftFamily === 4 && rightFamily === 6 && rightValue !== null && ipv6InCidr(rightValue, '::ffff:0:0', 96)) {
    return ipv4Number(left) === Number(rightValue & 0xffffffffn);
  }
  if (leftValue === null || rightValue === null) return false;
  return leftValue === rightValue;
}

const BLOCKED_IPV6: ReadonlyArray<readonly [string, number]> = [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  ['2001::', 32], ['2001:2::', 48], ['2001:10::', 28], ['2001:20::', 28],
  ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20], ['5f00::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
];

export function isPublicImageAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !BLOCKED_IPV4.some(([network, prefix]) => ipv4InCidr(address, network, prefix));
  if (family !== 6) return false;
  const value = expandIpv6(address);
  if (value === null) return false;
  if (ipv6InCidr(value, '::ffff:0:0', 96)) {
    const mapped = Number(value & 0xffffffffn);
    const ipv4 = [mapped >>> 24, (mapped >>> 16) & 255, (mapped >>> 8) & 255, mapped & 255].join('.');
    return isPublicImageAddress(ipv4);
  }
  return !BLOCKED_IPV6.some(([network, prefix]) => ipv6InCidr(value, network, prefix));
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address }) => address);
}

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type NodeLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

/**
 * Builds Node's `lookup` request option for a single pinned address.
 *
 * Node's http/https client calls this with `options.all: true` under Happy
 * Eyeballs (the default for dual-stack hosts) and expects the callback to
 * receive an address array in that case, not a single (address, family)
 * pair — passing the wrong shape throws ERR_INVALID_IP_ADDRESS deep inside
 * Node's connect path.
 */
export function pinnedLookup(pinnedAddress: string) {
  const family = net.isIP(pinnedAddress);
  return (_hostname: string, options: { all?: boolean } | unknown, callback: NodeLookupCallback) => {
    if (typeof options === 'object' && options !== null && (options as { all?: boolean }).all) {
      callback(null, [{ address: pinnedAddress, family }]);
      return;
    }
    callback(null, pinnedAddress, family);
  };
}

async function defaultRequestHop(url: URL, pinnedAddress: string, deadline: number): Promise<HopResponse> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new ProtectedImageError('timeout'));
    const originalHostname = url.hostname.replace(/^\[|\]$/g, '');
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'GET',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9',
        'User-Agent': 'HomeMail-Image-Proxy/1.0',
      },
      lookup: pinnedLookup(pinnedAddress),
      servername: net.isIP(originalHostname) ? undefined : originalHostname,
      agent: false,
      timeout: Math.min(remaining, TIMEOUT_MS),
    }, (response) => {
      const status = response.statusCode || 0;
      const headers = {
        location: readHeader(response.headers.location),
        'content-type': readHeader(response.headers['content-type']),
        'content-length': readHeader(response.headers['content-length']),
      };
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        response.once('end', () => resolve({ status, headers, data: Buffer.alloc(0) }));
        response.once('error', reject);
        return;
      }
      const declaredLength = Number(headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
        response.destroy();
        reject(new ProtectedImageError('response_too_large'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          response.destroy(new ProtectedImageError('response_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status, headers, data: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    request.once('socket', (socket) => {
      const connectedEvent = url.protocol === 'https:' ? 'secureConnect' : 'connect';
      socket.once(connectedEvent, () => {
        if (!sameAddress(socket.remoteAddress, pinnedAddress)) {
          request.destroy(new ProtectedImageError('pinned_address_mismatch'));
        }
      });
    });
    request.once('timeout', () => request.destroy(new ProtectedImageError('timeout')));
    request.once('error', reject);
    request.end();
  });
}

function sniffMime(data: Buffer): ProtectedImageMime | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (data.length >= 12 && data.subarray(4, 8).toString('ascii') === 'ftyp' && ['avif', 'avis'].includes(data.subarray(8, 12).toString('ascii'))) return 'image/avif';
  return null;
}

export function validateImageBytes(data: Buffer, contentType: string | undefined): ProtectedImageMime {
  const declared = contentType?.split(';')[0].trim().toLowerCase();
  const sniffed = sniffMime(data);
  if (!sniffed || declared !== sniffed) throw new ProtectedImageError('mime_mismatch');
  return sniffed;
}

async function acquireSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches += 1;
    return;
  }
  if (waiters.length >= MAX_QUEUED_FETCHES) throw new ProtectedImageError('proxy_busy');
  await new Promise<void>((resolve) => waiters.push(resolve));
  activeFetches += 1;
}

function releaseSlot(): void {
  activeFetches -= 1;
  waiters.shift()?.();
}

async function resolveWithDeadline(
  resolver: (hostname: string) => Promise<string[]>,
  hostname: string,
  remaining: number,
): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolver(hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProtectedImageError('timeout')), remaining);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchProtectedImage(
  rawUrl: string,
  dependencies: ProtectedImageFetcherDependencies = {},
): Promise<ProtectedImageResult> {
  if (rawUrl.length > 4096) throw new ProtectedImageError('invalid_url');
  const now = dependencies.now || Date.now;
  const cacheKey = crypto.createHash('sha256').update(rawUrl).digest('hex');
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now()) {
    return { data: cached.data, mime: cached.mime, cacheStatus: 'hit' };
  }

  await acquireSlot();
  try {
    let current = new URL(rawUrl);
    const deadline = now() + TIMEOUT_MS;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      if (!['http:', 'https:'].includes(current.protocol) || current.username || current.password) {
        throw new ProtectedImageError('invalid_url');
      }
      let addresses: string[];
      const hostname = current.hostname.replace(/^\[|\]$/g, '');
      try {
        const remaining = deadline - now();
        if (remaining <= 0) throw new ProtectedImageError('timeout');
        addresses = await resolveWithDeadline(dependencies.resolve || defaultResolve, hostname, remaining);
      } catch (error) {
        if (error instanceof ProtectedImageError && error.code === 'timeout') throw error;
        throw new ProtectedImageError('dns_failed');
      }
      if (addresses.length === 0) throw new ProtectedImageError('dns_failed');
      if (addresses.some((address) => !isPublicImageAddress(address))) {
        throw new ProtectedImageError('non_public_address');
      }
      const response = await (dependencies.requestHop || defaultRequestHop)(current, addresses[0], deadline);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.location;
        if (!location) throw new ProtectedImageError('invalid_redirect');
        if (redirects === MAX_REDIRECTS) throw new ProtectedImageError('too_many_redirects');
        current = new URL(location, current);
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new ProtectedImageError('upstream_status');
      if (response.data.length > MAX_BYTES) throw new ProtectedImageError('response_too_large');
      const mime = validateImageBytes(response.data, response.headers['content-type']);
      const entry = { data: response.data, mime, expiresAt: now() + CACHE_TTL_MS };
      const previous = cache.get(cacheKey);
      if (previous) cacheBytes -= previous.data.length;
      cache.set(cacheKey, entry);
      cacheBytes += entry.data.length;
      while (cache.size > CACHE_MAX_ENTRIES || cacheBytes > CACHE_MAX_BYTES) {
        const oldestKey = cache.keys().next().value as string | undefined;
        if (!oldestKey) break;
        const oldest = cache.get(oldestKey);
        if (oldest) cacheBytes -= oldest.data.length;
        cache.delete(oldestKey);
      }
      return { data: response.data, mime, cacheStatus: 'miss' };
    }
    throw new ProtectedImageError('too_many_redirects');
  } catch (error) {
    if (error instanceof ProtectedImageError) throw error;
    throw new ProtectedImageError('fetch_failed');
  } finally {
    releaseSlot();
  }
}

export function clearProtectedImageCache(): void {
  cache.clear();
  cacheBytes = 0;
}
