import { describe, expect, it, vi } from 'vitest';
import { JMAPClient } from '@/providers/stalwart-jmap/jmap-client';
import { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';

function providerWithClient(client: unknown) {
  const provider = new StalwartJMAPProvider();
  (provider as unknown as { getClient: () => Promise<unknown> }).getClient = vi
    .fn()
    .mockResolvedValue(client);
  vi.spyOn(provider, 'getAccount').mockResolvedValue({
    id: 'account-1',
    email: 'user@example.test',
    displayName: 'user',
  });
  return provider;
}

describe('StalwartJMAPProvider sendMessage', () => {
  it('adds In-Reply-To and References headers when replying', async () => {
    const request = vi.fn().mockResolvedValue({
      methodResponses: [['Email/set', { created: { message1: { id: 'email-1' } } }, '0']],
    });
    const client = {
      getSession: vi.fn().mockResolvedValue({
        primaryAccounts: { mail: 'account-1' },
        accounts: { 'account-1': {} },
      }),
      getMailboxes: vi.fn().mockResolvedValue([
        { id: 'drafts-1', role: 'drafts' },
        { id: 'sent-1', role: 'sent' },
      ]),
      request,
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };

    const provider = providerWithClient(client);

    await provider.sendMessage('account-1', {
      to: ['recipient@example.test'],
      subject: 'Re: Subject',
      html: '<p>Reply</p>',
      inReplyTo: 'original@example.test',
      references: ['root@example.test', 'original@example.test'],
    });

    const [methodCalls] = request.mock.calls[0];
    const [method, args] = methodCalls[0];
    expect(method).toBe('Email/set');
    expect(args.create.message1.inReplyTo).toEqual(['original@example.test']);
    expect(args.create.message1.references).toEqual([
      'root@example.test',
      'original@example.test',
    ]);
  });

  it('keeps the email out of Sent when EmailSubmission/set is rejected', async () => {
    const request = vi.fn().mockResolvedValue({
      methodResponses: [['Email/set', { created: { message1: { id: 'email-1' } } }, '0']],
    });
    const sendEmail = vi
      .fn()
      .mockRejectedValue(new Error('JMAP email submission error: forbiddenFrom'));
    const client = {
      getSession: vi.fn().mockResolvedValue({
        primaryAccounts: { mail: 'account-1' },
        accounts: { 'account-1': {} },
      }),
      getMailboxes: vi.fn().mockResolvedValue([
        { id: 'drafts-1', role: 'drafts' },
        { id: 'sent-1', role: 'sent' },
      ]),
      request,
      sendEmail,
    };

    const provider = providerWithClient(client);

    await expect(
      provider.sendMessage('account-1', {
        to: ['recipient@example.test'],
        subject: 'Subject',
        html: '<p>Hello</p>',
      })
    ).rejects.toThrow(/forbiddenFrom/);

    const [methodCalls] = request.mock.calls[0];
    const [method, args] = methodCalls[0];
    expect(method).toBe('Email/set');
    expect(args.create.message1.mailboxIds).toEqual({ 'drafts-1': true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith('email-1', 'account-1', undefined, {
      fromEmail: 'user@example.test',
      sentMailboxId: 'sent-1',
    });
  });
});

describe('JMAPClient sendEmail', () => {
  it('picks the identity matching the sender address and moves the email to Sent on success', async () => {
    const client = new JMAPClient(
      'https://stalwart.example.test',
      'user@example.test',
      'token',
      'account-1',
      'bearer'
    );
    vi.spyOn(client, 'getIdentities').mockResolvedValue([
      { id: 'identity-alias', email: 'alias@example.test' },
      { id: 'identity-main', email: 'user@example.test' },
    ]);
    const requestWithUsing = vi.spyOn(client, 'requestWithUsing').mockResolvedValue({
      methodResponses: [
        ['EmailSubmission/set', { created: { submission1: { id: 'submission-1' } } }, '0'],
      ],
    });

    await client.sendEmail('email-1', 'account-1', undefined, {
      fromEmail: 'user@example.test',
      sentMailboxId: 'sent-1',
    });

    const [methodCalls] = requestWithUsing.mock.calls[0];
    const [method, args] = methodCalls[0];
    expect(method).toBe('EmailSubmission/set');
    expect(args.create.submission1.identityId).toBe('identity-main');
    expect(args.onSuccessUpdateEmail).toEqual({
      '#submission1': {
        mailboxIds: { 'sent-1': true },
        keywords: { $seen: true },
      },
    });
  });

  it('refuses to submit from an address the account has no identity for', async () => {
    const client = new JMAPClient(
      'https://stalwart.example.test',
      'user@example.test',
      'token',
      'account-1',
      'bearer'
    );
    vi.spyOn(client, 'getIdentities').mockResolvedValue([
      { id: 'identity-main', email: 'user@example.test' },
    ]);
    const requestWithUsing = vi.spyOn(client, 'requestWithUsing');

    await expect(
      client.sendEmail('email-1', 'account-1', undefined, { fromEmail: 'other@example.test' })
    ).rejects.toThrow(/other@example\.test/);
    expect(requestWithUsing).not.toHaveBeenCalled();
  });
});
