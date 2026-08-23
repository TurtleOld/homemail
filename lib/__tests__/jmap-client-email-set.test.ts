import { describe, expect, it, vi } from 'vitest';
import { JMAPClient } from '@/providers/stalwart-jmap/jmap-client';

function clientWithMockedRequest(methodResponse: [string, any, string]) {
  const client = new JMAPClient('https://stalwart.example.test', '', 'token', 'account-1', 'bearer');
  (client as unknown as { request: (...args: any[]) => Promise<any> }).request = vi
    .fn()
    .mockResolvedValue({ methodResponses: [methodResponse] });
  return client;
}

describe('JMAPClient Email/set notUpdated handling', () => {
  it('bulkSetEmails throws when the server silently refuses to update a message (e.g. a rejected Junk move)', async () => {
    const client = clientWithMockedRequest([
      'Email/set',
      {
        updated: {},
        notUpdated: { 'message-1': { type: 'forbidden', description: 'cannot move to Junk directly' } },
      },
      '0',
    ]);

    await expect(client.bulkSetEmails({ 'message-1': { mailboxIds: { 'spam-mailbox': true } } })).rejects.toThrow(
      /message-1/
    );
  });

  it('bulkSetEmails resolves when every message was actually updated', async () => {
    const client = clientWithMockedRequest([
      'Email/set',
      { updated: { 'message-1': null } },
      '0',
    ]);

    await expect(
      client.bulkSetEmails({ 'message-1': { mailboxIds: { 'spam-mailbox': true } } })
    ).resolves.toBeUndefined();
  });

  it('setEmailFlags throws when the server silently refuses to update the message', async () => {
    const client = clientWithMockedRequest([
      'Email/set',
      { updated: {}, notUpdated: { 'message-1': { type: 'forbidden' } } },
      '0',
    ]);

    await expect(client.setEmailFlags('message-1', { mailboxIds: { 'spam-mailbox': true } })).rejects.toThrow(
      /message-1/
    );
  });
});
