import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readStorage: vi.fn(),
  writeStorage: vi.fn(),
  sendMessage: vi.fn(),
  bulkUpdateMessages: vi.fn(),
}));

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    readStorage: mocks.readStorage,
    writeStorage: mocks.writeStorage,
  };
});

vi.mock('@/lib/get-provider', () => ({
  getMailProvider: () => ({
    sendMessage: mocks.sendMessage,
    bulkUpdateMessages: mocks.bulkUpdateMessages,
  }),
  getMailProviderForAccount: () => ({
    sendMessage: mocks.sendMessage,
    bulkUpdateMessages: mocks.bulkUpdateMessages,
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { encryptData } from '@/lib/storage';
import { processScheduledMessages } from '@/scripts/process-scheduled-messages';

const pastSendAt = new Date(Date.now() - 60_000).toISOString();

function scheduledMessage(id: string, html: string) {
  return {
    id,
    accountId: 'acc-1',
    to: ['recipient@example.test'],
    subject: 'Hello',
    html,
    sendAt: pastSendAt,
    createdAt: pastSendAt,
  };
}

describe('processScheduledMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
    process.env.MAIL_PROVIDER = 'stalwart';
    mocks.sendMessage.mockResolvedValue('sent-id');
    mocks.bulkUpdateMessages.mockResolvedValue(undefined);
    mocks.writeStorage.mockResolvedValue(undefined);
  });

  it('sends the original HTML for encrypted and legacy plain-text rows', async () => {
    mocks.readStorage.mockResolvedValue({
      'acc-1': [
        scheduledMessage('encrypted', encryptData('<p>Encrypted body</p>')),
        scheduledMessage('legacy', '<p>Legacy body</p>'),
      ],
    });

    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenNthCalledWith(
      1,
      'acc-1',
      expect.objectContaining({ html: '<p>Encrypted body</p>' }),
    );
    expect(mocks.sendMessage).toHaveBeenNthCalledWith(
      2,
      'acc-1',
      expect.objectContaining({ html: '<p>Legacy body</p>' }),
    );
    expect(mocks.writeStorage).toHaveBeenCalledWith('allScheduledMessages', {});
  });

  it('does not start a second run while a run is still in progress', async () => {
    let finishSend: ((id: string) => void) | undefined;
    mocks.sendMessage.mockImplementation(
      () => new Promise<string>((resolve) => { finishSend = resolve; }),
    );
    mocks.readStorage.mockResolvedValue({
      'acc-1': [scheduledMessage('slow', encryptData('<p>Slow body</p>'))],
    });

    const firstRun = processScheduledMessages();
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    await processScheduledMessages();

    expect(mocks.readStorage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

    finishSend?.('sent-id');
    await firstRun;
  });
});
