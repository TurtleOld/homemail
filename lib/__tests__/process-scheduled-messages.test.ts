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
  getMailProviderForAccount: () => ({
    sendMessage: mocks.sendMessage,
    bulkUpdateMessages: mocks.bulkUpdateMessages,
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { encryptData } from '@/lib/storage';
import { updateScheduledMessages } from '@/lib/scheduled-messages';
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

  it('passes threading headers saved with a scheduled reply', async () => {
    mocks.readStorage.mockResolvedValue({
      'acc-1': [
        {
          ...scheduledMessage('reply', '<p>Reply body</p>'),
          inReplyTo: 'original@example.test',
          references: ['root@example.test', 'original@example.test'],
        },
      ],
    });

    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({
        inReplyTo: 'original@example.test',
        references: ['root@example.test', 'original@example.test'],
      }),
    );
  });

  it('keeps a message queued when its body cannot be decrypted', async () => {
    process.env.SESSION_SECRET = 'a-different-session-secret-at-least-32-chars';
    const foreignBody = encryptData('<p>Encrypted with the old secret</p>');
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';

    mocks.readStorage.mockResolvedValue({
      'acc-1': [scheduledMessage('foreign', foreignBody)],
    });

    await processScheduledMessages();

    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.writeStorage).not.toHaveBeenCalled();
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

  it('keeps a message added while a run is sending', async () => {
    let stored: Record<string, ReturnType<typeof scheduledMessage>[]> = {
      'acc-1': [scheduledMessage('due', encryptData('<p>Due body</p>'))],
    };
    mocks.readStorage.mockImplementation(async () => structuredClone(stored));
    mocks.writeStorage.mockImplementation(async (_key: string, value: typeof stored) => {
      stored = structuredClone(value);
    });

    let finishSend: ((id: string) => void) | undefined;
    mocks.sendMessage.mockImplementation(
      () => new Promise<string>((resolve) => { finishSend = resolve; }),
    );

    const run = processScheduledMessages();
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    // Same write the send route performs while the run is awaiting sendMessage.
    await updateScheduledMessages((current) => {
      current['acc-1'] = [...(current['acc-1'] ?? []), scheduledMessage('added', '<p>New body</p>')];
      return current;
    });

    finishSend?.('sent-id');
    await run;

    expect(stored['acc-1'].map((message) => message.id)).toEqual(['added']);
  });
});
