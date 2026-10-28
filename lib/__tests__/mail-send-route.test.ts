import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  validateCsrf: vi.fn(),
  getSession: vi.fn(),
  getMailProviderForAccount: vi.fn(),
  sendMessage: vi.fn(),
  deleteDraft: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({ validateCsrf: mocks.validateCsrf }));
vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/get-provider', () => ({
  getMailProviderForAccount: mocks.getMailProviderForAccount,
}));
vi.mock('@/lib/email-validator', () => ({
  validateEmailList: (emails: string[]) => ({
    valid: true,
    validEmails: emails,
    invalidEmails: [],
  }),
  sanitizeEmail: (email: string) => email,
}));
vi.mock('@/lib/security-logger', () => ({
  SecurityLogger: { logSuspiciousActivity: vi.fn() },
}));
vi.mock('@/lib/storage', () => ({
  writeStorage: vi.fn(),
  readStorage: vi.fn(),
  encryptData: (value: string) => value,
  decryptData: (value: string) => value,
}));

import { POST } from '@/app/api/mail/send/route';

function sendRequest(body: Record<string, unknown>) {
  return new NextRequest('https://app.example.test/api/mail/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('mail send route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.validateCsrf.mockResolvedValue(true);
    mocks.getSession.mockResolvedValue({ accountId: 'current-account' });
    mocks.sendMessage.mockResolvedValue('sent-message-id');
    mocks.deleteDraft.mockResolvedValue(undefined);
    mocks.getMailProviderForAccount.mockReturnValue({
      sendMessage: mocks.sendMessage,
      deleteDraft: mocks.deleteDraft,
    });
  });

  it('permanently removes only the saved draft after a successful self-send', async () => {
    const response = await POST(sendRequest({
      to: ['owner@example.test'],
      subject: 'Forwarded message',
      html: '<p>Forwarded body</p>',
      draftId: 'draft-message-id',
    }));

    expect(response.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    expect(mocks.deleteDraft).toHaveBeenCalledWith('current-account', 'draft-message-id');
  });

  it('passes the original Message-ID and references when sending a reply', async () => {
    const response = await POST(sendRequest({
      to: ['recipient@example.test'],
      subject: 'Re: Hello',
      html: '<p>Reply body</p>',
      inReplyTo: 'original@example.test',
      references: ['root@example.test', 'original@example.test'],
    }));

    expect(response.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      'current-account',
      expect.objectContaining({
        inReplyTo: 'original@example.test',
        references: ['root@example.test', 'original@example.test'],
      })
    );
  });

  it('returns validation issues as details for an invalid body', async () => {
    const response = await POST(sendRequest({ subject: 'Hello', html: '<p>Hi</p>' }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid input');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_type',
          path: ['to'],
          message: expect.any(String),
        }),
      ])
    );
  });
});
