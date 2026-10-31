import fs from 'node:fs/promises';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  // Must be set before lib/storage is imported: DATA_DIR is resolved at import
  // time, and the real withStorageLock writes lock files there.
  // No imports available in vi.hoisted, so the path is assembled by hand.
  const dataDir = `${process.env.TMPDIR || '/tmp'}/homemail-scheduled-test-${process.pid}-${Date.now()}`;
  process.env.DATA_DIR = dataDir;

  return {
    dataDir,
    readStorage: vi.fn(),
    writeStorage: vi.fn(),
    sendMessage: vi.fn(),
    bulkUpdateMessages: vi.fn(),
  };
});

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
import {
  SENDING_LEASE_MS,
  claimScheduledMessage,
  updateScheduledMessages,
  type ScheduledMessage,
  type ScheduledMessages,
} from '@/lib/scheduled-messages';
import { SendUnknownError } from '@/providers/mail-provider';
import { processScheduledMessages } from '@/scripts/process-scheduled-messages';

const pastSendAt = new Date(Date.now() - 60_000).toISOString();

type StoredMessage = ScheduledMessage;

let stored: ScheduledMessages = {};

function scheduledMessage(
  id: string,
  html: string,
  overrides: Partial<StoredMessage> = {},
): StoredMessage {
  return {
    id,
    accountId: 'acc-1',
    to: ['recipient@example.test'],
    subject: 'Hello',
    html,
    sendAt: pastSendAt,
    createdAt: pastSendAt,
    ...overrides,
  };
}

function storeMessage(message: StoredMessage) {
  stored = { [message.accountId]: [message] };
}

afterAll(async () => {
  await fs.rm(mocks.dataDir, { recursive: true, force: true });
});

describe('processScheduledMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stored = {};
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
    mocks.readStorage.mockImplementation(async () => structuredClone(stored));
    mocks.writeStorage.mockImplementation(async (_key: string, value: ScheduledMessages) => {
      stored = structuredClone(value);
    });
    mocks.sendMessage.mockResolvedValue('sent-id');
    mocks.bulkUpdateMessages.mockResolvedValue(undefined);
  });

  it('sends the original HTML for encrypted and legacy plain-text rows', async () => {
    stored = {
      'acc-1': [
        scheduledMessage('encrypted', encryptData('<p>Encrypted body</p>')),
        scheduledMessage('legacy', '<p>Legacy body</p>'),
      ],
    };

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
    expect(stored).toEqual({});
  });

  it('passes threading headers saved with a scheduled reply', async () => {
    storeMessage({
      ...scheduledMessage('reply', '<p>Reply body</p>'),
      inReplyTo: 'original@example.test',
      references: ['root@example.test', 'original@example.test'],
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

  it('keeps an undecryptable message queued for a later run', async () => {
    process.env.SESSION_SECRET = 'a-different-session-secret-at-least-32-chars';
    const foreignBody = encryptData('<p>Encrypted with the old secret</p>');
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
    storeMessage(scheduledMessage('foreign', foreignBody));

    await processScheduledMessages();

    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(stored['acc-1'][0]).toEqual(
      expect.objectContaining({
        id: 'foreign',
        status: 'pending',
        lastError: expect.stringContaining('decrypt'),
      }),
    );
  });

  it('does not start a second run while a run is still in progress', async () => {
    let finishSend: ((id: string) => void) | undefined;
    mocks.sendMessage.mockImplementation(
      () => new Promise<string>((resolve) => { finishSend = resolve; }),
    );
    storeMessage(scheduledMessage('slow', encryptData('<p>Slow body</p>')));

    const firstRun = processScheduledMessages();
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

    finishSend?.('sent-id');
    await firstRun;
  });

  it('keeps a message added while a run is sending', async () => {
    let finishSend: ((id: string) => void) | undefined;
    mocks.sendMessage.mockImplementation(
      () => new Promise<string>((resolve) => { finishSend = resolve; }),
    );
    storeMessage(scheduledMessage('due', encryptData('<p>Due body</p>')));

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

  it('records a result as soon as each message finishes', async () => {
    let finishSecond: ((id: string) => void) | undefined;
    mocks.sendMessage
      .mockResolvedValueOnce('first-id')
      .mockImplementationOnce(
        () => new Promise<string>((resolve) => { finishSecond = resolve; }),
      );
    stored = {
      'acc-1': [
        scheduledMessage('first', '<p>First</p>'),
        scheduledMessage('second', '<p>Second</p>'),
      ],
    };

    const run = processScheduledMessages();
    await vi.waitFor(() => expect(stored['acc-1'][0]?.status).toBe('sending'));
    expect(stored['acc-1'].map((message) => message.id)).toEqual(['second']);

    finishSecond?.('second-id');
    await run;
    expect(stored).toEqual({});
  });

  it('does not send again when cleanup fails after a confirmed send', async () => {
    storeMessage(scheduledMessage('sent', '<p>Sent body</p>'));
    mocks.writeStorage.mockImplementation(async (_key: string, value: ScheduledMessages) => {
      if (Object.keys(value).length === 0) {
        throw new Error('disk full');
      }
      stored = structuredClone(value);
    });

    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(stored['acc-1'][0]).toEqual(
      expect.objectContaining({ id: 'sent', status: 'sent', sentMessageId: 'sent-id' }),
    );

    mocks.writeStorage.mockImplementation(async (_key: string, value: ScheduledMessages) => {
      stored = structuredClone(value);
    });
    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(stored).toEqual({});
  });

  it('does not send again when the sent marker cannot be saved', async () => {
    storeMessage(scheduledMessage('lost-marker', '<p>Body</p>'));
    mocks.writeStorage.mockImplementation(async (_key: string, value: ScheduledMessages) => {
      if (value['acc-1']?.some((message) => message.status === 'sent')) {
        throw new Error('disk full');
      }
      stored = structuredClone(value);
    });

    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(stored['acc-1'][0].status).toBe('sending');

    stored['acc-1'][0].attempt = {
      owner: 'crashed-run',
      startedAt: new Date(Date.now() - SENDING_LEASE_MS - 1_000).toISOString(),
    };
    mocks.writeStorage.mockImplementation(async (_key: string, value: ScheduledMessages) => {
      stored = structuredClone(value);
    });
    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(stored['acc-1'][0]).toEqual(
      expect.objectContaining({ id: 'lost-marker', status: 'needs_review' }),
    );
  });

  it('does not retry a send whose network result is unknown', async () => {
    storeMessage(scheduledMessage('unknown', '<p>Body</p>'));
    mocks.sendMessage.mockRejectedValue(new SendUnknownError('connection reset'));

    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(stored['acc-1'][0]).toEqual(
      expect.objectContaining({ id: 'unknown', status: 'needs_review' }),
    );

    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(stored['acc-1'][0].status).toBe('needs_review');
  });

  it('retries after the server definitively rejected the send', async () => {
    storeMessage(scheduledMessage('rejected', '<p>Body</p>'));
    mocks.sendMessage.mockRejectedValueOnce(new Error('forbiddenFrom'));

    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(stored['acc-1'][0]).toEqual(
      expect.objectContaining({ id: 'rejected', status: 'pending' }),
    );

    await processScheduledMessages();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(stored).toEqual({});
  });

  it('does not send when the claim cannot be saved', async () => {
    storeMessage(scheduledMessage('unclaimed', '<p>Body</p>'));
    mocks.writeStorage.mockImplementation(async (_key: string, value: ScheduledMessages) => {
      if (value['acc-1']?.some((message) => message.status === 'sending')) {
        throw new Error('disk full');
      }
      stored = structuredClone(value);
    });

    await processScheduledMessages();

    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(stored['acc-1'][0].status).toBeUndefined();
  });

  it('lets only one runner claim the same due message', async () => {
    storeMessage(scheduledMessage('shared', '<p>Body</p>'));
    const now = new Date();

    const first = await claimScheduledMessage('acc-1', 'shared', 'runner-a', now);
    const second = await claimScheduledMessage('acc-1', 'shared', 'runner-b', now);

    expect(first?.status).toBe('sending');
    expect(second).toBeNull();
  });
});
