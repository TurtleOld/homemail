import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  readStorage: vi.fn(),
  writeStorage: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/storage', () => ({
  readStorage: mocks.readStorage,
  writeStorage: mocks.writeStorage,
}));

import { POST } from '@/app/api/mail/read-receipt/route';

function readReceiptRequest(body: Record<string, unknown>, withCookie = false): NextRequest {
  return new NextRequest('https://app.example.test/api/mail/read-receipt', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(withCookie ? { cookie: 'mail_session=stale-cookie-value' } : {}),
    },
    body: JSON.stringify(body),
  });
}

const ownTracking = {
  messageId: 'message-1',
  status: 'delivered',
  sentAt: new Date('2026-10-01T10:00:00Z'),
  recipients: [{ email: 'recipient@example.test', status: 'delivered' }],
  createdAt: new Date('2026-10-01T10:00:00Z'),
  updatedAt: new Date('2026-10-01T10:00:00Z'),
};

describe('mail read receipt route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({ accountId: 'owner@example.test' });
    mocks.readStorage.mockResolvedValue(ownTracking);
    mocks.writeStorage.mockResolvedValue(undefined);
  });

  it('rejects a request without a valid session even when the cookie is present', async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(
      readReceiptRequest({ messageId: 'message-1', recipientEmail: 'recipient@example.test' }, true)
    );

    expect(response.status).toBe(401);
    expect(mocks.readStorage).not.toHaveBeenCalled();
    expect(mocks.writeStorage).not.toHaveBeenCalled();
  });

  it('reads and writes tracking for the session account, ignoring a foreign accountId in the body', async () => {
    const response = await POST(
      readReceiptRequest({
        messageId: 'message-1',
        accountId: 'victim@example.test',
        recipientEmail: 'recipient@example.test',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.readStorage).toHaveBeenCalledWith(
      'delivery:owner@example.test:message-1',
      null
    );
    expect(mocks.writeStorage).toHaveBeenCalledWith(
      'delivery:owner@example.test:message-1',
      expect.objectContaining({ status: 'read' })
    );
  });

  it('marks the matching recipient as read in the owner tracking', async () => {
    const response = await POST(
      readReceiptRequest({ messageId: 'message-1', recipientEmail: 'recipient@example.test' })
    );

    expect(response.status).toBe(200);
    const written = mocks.writeStorage.mock.calls[0][1];
    expect(written.recipients[0]).toEqual(
      expect.objectContaining({ email: 'recipient@example.test', status: 'read' })
    );
    expect(written.recipients[0].readAt).toBeInstanceOf(Date);
  });

  it('returns 400 when messageId is missing', async () => {
    const response = await POST(readReceiptRequest({ recipientEmail: 'recipient@example.test' }));

    expect(response.status).toBe(400);
    expect(mocks.writeStorage).not.toHaveBeenCalled();
  });

  it('returns 404 when the owner has no tracking for the message', async () => {
    mocks.readStorage.mockResolvedValue(null);

    const response = await POST(readReceiptRequest({ messageId: 'message-1' }));

    expect(response.status).toBe(404);
    expect(mocks.writeStorage).not.toHaveBeenCalled();
  });
});
