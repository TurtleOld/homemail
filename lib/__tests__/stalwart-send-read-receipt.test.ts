import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  getSession: vi.fn(),
  getMailboxes: vi.fn(),
  sendEmail: vi.fn(),
}));

const SENDER = 'sender@example.test';

function createProvider() {
  const provider = new StalwartJMAPProvider();
  const client = {
    getSession: mocks.getSession,
    getMailboxes: mocks.getMailboxes,
    request: mocks.request,
    sendEmail: mocks.sendEmail,
  };
  (provider as unknown as { getClient: () => Promise<unknown> }).getClient = vi
    .fn()
    .mockResolvedValue(client);
  vi.spyOn(provider, 'getAccount').mockResolvedValue({
    id: 'account-1',
    email: SENDER,
    displayName: 'sender',
  });
  return provider;
}

function createdEmailBody() {
  const [[methodCalls]] = mocks.request.mock.calls.at(-1) as [
    Array<[string, { create: { message1: Record<string, unknown> } }, string]>,
  ];
  expect(methodCalls[0]).toBe('Email/set');
  return methodCalls[1].create.message1;
}

describe('StalwartJMAPProvider.sendMessage read receipt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({
      primaryAccounts: { mail: 'account-1' },
      accounts: { 'account-1': { id: 'account-1', name: SENDER } },
    });
    mocks.getMailboxes.mockResolvedValue([
      { id: 'sent-mailbox', role: 'sent' },
      { id: 'drafts-mailbox', role: 'drafts' },
    ]);
    mocks.request.mockResolvedValue({
      methodResponses: [['Email/set', { created: { message1: { id: 'email-1' } } }, '0']],
    });
    mocks.sendEmail.mockResolvedValue(undefined);
  });

  it('adds Disposition-Notification-To when a read receipt is requested', async () => {
    const provider = createProvider();

    await provider.sendMessage('account-1', {
      to: ['recipient@example.test'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      requestReadReceipt: true,
    });

    expect(createdEmailBody()['header:Disposition-Notification-To:asAddresses']).toEqual([
      { email: SENDER },
    ]);
  });

  it('omits Disposition-Notification-To when no read receipt is requested', async () => {
    const provider = createProvider();

    await provider.sendMessage('account-1', {
      to: ['recipient@example.test'],
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    expect(createdEmailBody()).not.toHaveProperty('header:Disposition-Notification-To:asAddresses');
  });
});
