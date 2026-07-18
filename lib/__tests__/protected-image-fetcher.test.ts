import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProtectedImageCache,
  fetchProtectedImage,
  isPublicImageAddress,
  ProtectedImageError,
} from '@/lib/protected-image-fetcher';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8xWAAAAAElFTkSuQmCC',
  'base64',
);

const ok = (data = png, contentType = 'image/png') => ({
  status: 200,
  headers: { 'content-type': contentType },
  data,
});

describe('protected image fetcher', () => {
  beforeEach(clearProtectedImageCache);

  it('rejects private, metadata, reserved, mapped IPv4, and non-global IPv6 destinations', () => {
    for (const address of [
      '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
      '172.16.0.1', '192.168.1.1', '198.18.0.1', '224.0.0.1', '::', '::1',
      '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1',
    ]) expect(isPublicImageAddress(address), address).toBe(false);
    expect(isPublicImageAddress('93.184.216.34')).toBe(true);
    expect(isPublicImageAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('fails closed on DNS errors and mixed public/private answers', async () => {
    await expect(fetchProtectedImage('https://images.example/a.png', {
      resolve: async () => { throw new Error('dns unavailable'); },
    })).rejects.toMatchObject({ code: 'dns_failed' });
    await expect(fetchProtectedImage('https://images.example/a.png', {
      resolve: async () => ['93.184.216.34', '127.0.0.1'],
    })).rejects.toMatchObject({ code: 'non_public_address' });
  });

  it('pins the validated address and revalidates redirect destinations', async () => {
    const seen: string[] = [];
    const requestHop = vi.fn(async (url: URL, pinnedAddress: string) => {
      seen.push(`${url.hostname}:${pinnedAddress}`);
      return { status: 302, headers: { location: 'http://metadata.example/latest' }, data: Buffer.alloc(0) };
    });
    await expect(fetchProtectedImage('https://images.example/a.png', {
      resolve: async (hostname) => hostname === 'images.example' ? ['93.184.216.34'] : ['169.254.169.254'],
      requestHop,
    })).rejects.toMatchObject({ code: 'non_public_address' });
    expect(seen).toEqual(['images.example:93.184.216.34']);
    expect(requestHop).toHaveBeenCalledTimes(1);
  });

  it('normalizes a literal public IPv6 host before resolution and pinning', async () => {
    const resolve = vi.fn(async () => ['2606:4700:4700::1111']);
    const requestHop = vi.fn(async (_url: URL, _pinnedAddress: string) => ok());
    await fetchProtectedImage('https://[2606:4700:4700::1111]/a.png', { resolve, requestHop });
    expect(resolve).toHaveBeenCalledWith('2606:4700:4700::1111');
    expect(requestHop.mock.calls[0][1]).toBe('2606:4700:4700::1111');
  });

  it('rejects MIME spoofing, oversized bodies, redirect loops, and timeouts', async () => {
    const resolver = async () => ['93.184.216.34'];
    await expect(fetchProtectedImage('https://images.example/spoof.png', {
      resolve: resolver,
      requestHop: async () => ok(Buffer.from('<svg></svg>'), 'image/png'),
    })).rejects.toMatchObject({ code: 'mime_mismatch' });
    await expect(fetchProtectedImage('https://images.example/large.png', {
      resolve: resolver,
      requestHop: async () => ok(Buffer.alloc(8 * 1024 * 1024 + 1), 'image/png'),
    })).rejects.toMatchObject({ code: 'response_too_large' });
    await expect(fetchProtectedImage('https://images.example/loop.png', {
      resolve: resolver,
      requestHop: async (url) => ({ status: 302, headers: { location: url.href }, data: Buffer.alloc(0) }),
    })).rejects.toMatchObject({ code: 'too_many_redirects' });
    await expect(fetchProtectedImage('https://images.example/slow.png', {
      resolve: resolver,
      requestHop: async () => { throw new ProtectedImageError('timeout'); },
    })).rejects.toMatchObject({ code: 'timeout' });
  });

  it('uses a URL-hash cache without allowing a different URL to poison the entry', async () => {
    let calls = 0;
    const dependencies = {
      resolve: async () => ['93.184.216.34'],
      requestHop: async () => { calls += 1; return ok(); },
    };
    expect((await fetchProtectedImage('https://images.example/a.png', dependencies)).cacheStatus).toBe('miss');
    expect((await fetchProtectedImage('https://images.example/a.png', dependencies)).cacheStatus).toBe('hit');
    expect((await fetchProtectedImage('https://images.example/b.png', dependencies)).cacheStatus).toBe('miss');
    expect(calls).toBe(2);
  });
});
