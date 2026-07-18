import { describe, expect, it } from 'vitest';
import {
  protectMessageForDelivery,
  signImageResourceToken,
  verifyImageResourceToken,
} from '@/lib/protected-message-content';
import type { MessageDetail } from '@/lib/types';

const environment = { SESSION_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters' };

function message(html: string): MessageDetail {
  return {
    id: 'message-1',
    from: { email: 'sender@example.com' },
    to: [{ email: 'member@example.com' }],
    subject: 'Images',
    date: new Date('2026-07-18T10:00:00Z'),
    body: { html },
    attachments: [{
      id: 'blob-1',
      filename: 'inline.png',
      mime: 'image/png',
      size: 68,
      contentId: '<logo@example.com>',
      disposition: 'inline',
    }],
    flags: { unread: false, starred: false, important: false, hasAttachments: true },
  };
}

describe('protected message content', () => {
  it('signs scoped, expiring resource tokens and rejects tampering', () => {
    const token = signImageResourceToken({
      kind: 'external', accountId: 'account-1', messageId: 'message-1', url: 'https://images.example/logo.png',
    }, { now: 1_000, environment });
    expect(verifyImageResourceToken(token, { now: 2_000, environment })).toMatchObject({
      kind: 'external', accountId: 'account-1', messageId: 'message-1',
    });
    expect(verifyImageResourceToken(`${token.slice(0, -1)}x`, { now: 2_000, environment })).toBeNull();
    expect(verifyImageResourceToken(token, { now: 1_000 + 16 * 60 * 1000, environment })).toBeNull();
  });

  it('rewrites cid and remote images to signed HomeMail resources', () => {
    const protectedMessage = protectMessageForDelivery(message(
      '<p><img src="cid:logo@example.com"><img src="https://tracker.example/pixel.gif"></p>',
    ), 'account-1', { remoteImagesEnabled: true, now: 1_000, environment });
    const html = protectedMessage.body.html || '';
    expect(html).not.toContain('cid:');
    expect(html).not.toContain('https://tracker.example');
    expect(html.match(/\/api\/mail\/resources\/image\//g)).toHaveLength(2);
  });

  it('fails closed for remote images while preserving an authenticated cid path', () => {
    const protectedMessage = protectMessageForDelivery(message(
      '<img src="cid:logo@example.com"><img src="https://tracker.example/pixel.gif">',
    ), 'account-1', { remoteImagesEnabled: false, now: 1_000, environment });
    const html = protectedMessage.body.html || '';
    expect(html).toContain('/api/mail/resources/image/');
    expect(html).not.toContain('tracker.example');
  });
});
