import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { MessageSourceHandle } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProvider: vi.fn(),
  getMessageSource: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/get-provider', () => ({
  getMailProviderForAccount: mocks.getProvider,
  getMailProvider: mocks.getProvider,
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/client-ip', () => ({ getClientIp: () => '203.0.113.10' }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, MAX_INLINE_SOURCE_BYTES } from '@/app/api/mail/messages/[id]/source/route';

const RAW_SOURCE = 'From: sender@example.test\r\nTo: recipient@example.test\r\nSubject: Hi\r\n\r\nBody text.';

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function handle(overrides: Partial<MessageSourceHandle> = {}): MessageSourceHandle {
  return {
    size: RAW_SOURCE.length,
    diagnostics: {
      from: { email: 'sender@example.test' },
      to: [{ email: 'recipient@example.test' }],
      subject: 'Hi',
      spf: { status: 'pass' },
      dkim: { status: 'pass' },
      dmarc: { status: 'pass' },
    },
    openStream: vi.fn().mockResolvedValue(streamOf(RAW_SOURCE)),
    ...overrides,
  };
}

function request(id: string, query = '') {
  return new NextRequest(`https://app.example.test/api/mail/messages/${id}/source${query}`);
}

describe('message source HTTP route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MAIL_PROVIDER = 'stalwart';
    mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 1000 });
    mocks.getSession.mockResolvedValue({ accountId: 'account-1' });
    mocks.getProvider.mockReturnValue({ getMessageSource: mocks.getMessageSource });
  });

  it('rejects unauthenticated requests', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request('message-1'), { params: Promise.resolve({ id: 'message-1' }) });
    expect(response.status).toBe(401);
  });

  it('rejects requests over the rate limit', async () => {
    mocks.checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() });
    const response = await GET(request('message-1'), { params: Promise.resolve({ id: 'message-1' }) });
    expect(response.status).toBe(429);
    expect(mocks.getMessageSource).not.toHaveBeenCalled();
  });

  it('scopes retrieval to the authenticated account', async () => {
    mocks.getMessageSource.mockResolvedValue(handle());
    await GET(request('message-1'), { params: Promise.resolve({ id: 'message-1' }) });
    expect(mocks.getMessageSource).toHaveBeenCalledWith('account-1', 'message-1');
  });

  it('returns 404 for a message outside the active mailbox', async () => {
    mocks.getMessageSource.mockResolvedValue(null);
    const response = await GET(request('missing'), { params: Promise.resolve({ id: 'missing' }) });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('streams the exact server bytes as message/rfc822 with no-store', async () => {
    mocks.getMessageSource.mockResolvedValue(handle());
    const response = await GET(request('message-1'), { params: Promise.resolve({ id: 'message-1' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('message/rfc822');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text();
    expect(text).toBe(RAW_SOURCE);
  });

  it('reports an oversized message instead of truncating it', async () => {
    mocks.getMessageSource.mockResolvedValue(handle({ size: MAX_INLINE_SOURCE_BYTES + 1 }));
    const response = await GET(request('message-1'), { params: Promise.resolve({ id: 'message-1' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    const body = await response.json();
    expect(body).toMatchObject({ oversized: true, size: MAX_INLINE_SOURCE_BYTES + 1, limit: MAX_INLINE_SOURCE_BYTES });
  });

  it('keeps the exact download streamed and unrestricted even when oversized', async () => {
    const oversizedHandle = handle({ size: MAX_INLINE_SOURCE_BYTES + 1 });
    mocks.getMessageSource.mockResolvedValue(oversizedHandle);
    const response = await GET(request('message-1', '?download=1'), {
      params: Promise.resolve({ id: 'message-1' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('message/rfc822');
    const text = await response.text();
    expect(text).toBe(RAW_SOURCE);
  });

  it('derives a safe Content-Disposition filename from the subject on download', async () => {
    mocks.getMessageSource.mockResolvedValue(
      handle({ diagnostics: { ...handle().diagnostics, subject: 'Re: "Quarterly" report/plan' } })
    );
    const response = await GET(request('message-1', '?download=1'), {
      params: Promise.resolve({ id: 'message-1' }),
    });
    const disposition = response.headers.get('content-disposition') || '';
    expect(disposition).toContain('attachment;');
    expect(disposition).not.toContain('"Quarterly"');
    expect(disposition).not.toMatch(/[\r\n]/);
  });

  it('falls back to a deterministic filename when the subject is empty', async () => {
    mocks.getMessageSource.mockResolvedValue(handle({ diagnostics: { ...handle().diagnostics, subject: '' } }));
    const response = await GET(request('message-1', '?download=1'), {
      params: Promise.resolve({ id: 'message-1' }),
    });
    const disposition = response.headers.get('content-disposition') || '';
    expect(disposition).toContain('message-message-1.eml');
  });

  it('maps an upstream failure to a safe error without leaking internal details', async () => {
    mocks.getMessageSource.mockRejectedValue(new Error('JMAP session token invalid for internal-host:8080'));
    const response = await GET(request('message-1'), { params: Promise.resolve({ id: 'message-1' }) });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).not.toMatch(/internal-host|8080|JMAP/);
  });
});
