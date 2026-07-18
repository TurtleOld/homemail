import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  featureEnabled: vi.fn(),
  getSession: vi.fn(),
  verifyToken: vi.fn(),
  fetchImage: vi.fn(),
  getAttachment: vi.fn(),
  getProvider: vi.fn(),
  checkRateLimit: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/feature-flags', () => ({ isRedesignFeatureEnabled: mocks.featureEnabled }));
vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/protected-message-content', () => ({ verifyImageResourceToken: mocks.verifyToken }));
vi.mock('@/lib/protected-image-fetcher', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/protected-image-fetcher')>();
  return { ...original, fetchProtectedImage: mocks.fetchImage };
});
vi.mock('@/lib/get-provider', () => ({
  getMailProviderForAccount: mocks.getProvider,
  getMailProvider: mocks.getProvider,
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/client-ip', () => ({ getClientIp: () => '203.0.113.10' }));
vi.mock('@/lib/logger', () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn },
}));

import { GET } from '@/app/api/mail/resources/image/[token]/route';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8xWAAAAAElFTkSuQmCC',
  'base64',
);

function request() {
  return new NextRequest('https://app.example.test/api/mail/resources/image/signed-token');
}

describe('protected image resource route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MAIL_PROVIDER = 'stalwart';
    mocks.featureEnabled.mockImplementation((flag: string) => flag === 'protectedMessageContent' || flag === 'remoteImageFetching');
    mocks.getSession.mockResolvedValue({ accountId: 'account-1' });
    mocks.checkRateLimit.mockReturnValue({ allowed: true });
    mocks.getProvider.mockReturnValue({ getAttachment: mocks.getAttachment });
  });

  it('returns a quiet placeholder when the protected path is disabled', async () => {
    mocks.featureEnabled.mockReturnValue(false);
    const response = await GET(request(), { params: Promise.resolve({ token: 'signed-token' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-HomeMail-Image-Status')).toBe('placeholder');
    expect(mocks.verifyToken).not.toHaveBeenCalled();
  });

  it('rejects a valid token from a different mailbox without fetching', async () => {
    mocks.verifyToken.mockReturnValue({
      v: 1, kind: 'external', accountId: 'account-2', messageId: 'message-1',
      url: 'https://images.example/a.png', expiresAt: Date.now() + 10_000,
    });
    const response = await GET(request(), { params: Promise.resolve({ token: 'signed-token' }) });
    expect(response.headers.get('X-HomeMail-Image-Status')).toBe('placeholder');
    expect(mocks.fetchImage).not.toHaveBeenCalled();
  });

  it('serves a validated external image with private cache policy', async () => {
    mocks.verifyToken.mockReturnValue({
      v: 1, kind: 'external', accountId: 'account-1', messageId: 'message-1',
      url: 'https://images.example/a.png', expiresAt: Date.now() + 10_000,
    });
    mocks.fetchImage.mockResolvedValue({ data: png, mime: 'image/png', cacheStatus: 'miss' });
    const response = await GET(request(), { params: Promise.resolve({ token: 'signed-token' }) });
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=600');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(mocks.fetchImage).toHaveBeenCalledWith('https://images.example/a.png');
  });

  it('loads cid data only through the session-scoped provider lookup', async () => {
    mocks.verifyToken.mockReturnValue({
      v: 1, kind: 'cid', accountId: 'account-1', messageId: 'message-1',
      attachmentId: 'blob-1', expiresAt: Date.now() + 10_000,
    });
    mocks.getAttachment.mockResolvedValue({
      id: 'blob-1', filename: 'inline.png', mime: 'image/png', size: png.length, data: png,
    });
    const response = await GET(request(), { params: Promise.resolve({ token: 'signed-token' }) });
    expect(response.headers.get('X-HomeMail-Image-Status')).toBe('ok');
    expect(mocks.getProvider).toHaveBeenCalledWith('account-1');
    expect(mocks.getAttachment).toHaveBeenCalledWith('account-1', 'message-1', 'blob-1');
  });
});
