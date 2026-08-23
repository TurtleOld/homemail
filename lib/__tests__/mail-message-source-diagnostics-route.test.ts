import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

import { GET } from '@/app/api/mail/messages/[id]/source/diagnostics/route';

function request(id: string) {
  return new NextRequest(`https://app.example.test/api/mail/messages/${id}/source/diagnostics`);
}

describe('message source diagnostics HTTP route', () => {
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

  it('returns 404 for a message outside the active mailbox', async () => {
    mocks.getMessageSource.mockResolvedValue(null);
    const response = await GET(request('missing'), { params: Promise.resolve({ id: 'missing' }) });
    expect(response.status).toBe(404);
  });

  it('never opens the source stream just to report diagnostics', async () => {
    const openStream = vi.fn();
    mocks.getMessageSource.mockResolvedValue({
      size: 42,
      diagnostics: {
        from: { email: 'sender@example.test' },
        to: [{ email: 'recipient@example.test' }],
        subject: 'Hi',
        messageId: '<abc@example.test>',
        spf: { status: 'pass', domain: 'example.test' },
        dkim: { status: 'unavailable' },
        dmarc: { status: 'fail' },
      },
      openStream,
    });

    const response = await GET(request('message-1'), { params: Promise.resolve({ id: 'message-1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.size).toBe(42);
    expect(body.diagnostics.spf).toEqual({ status: 'pass', domain: 'example.test' });
    expect(body.diagnostics.dkim).toEqual({ status: 'unavailable' });
    expect(openStream).not.toHaveBeenCalled();
  });
});
