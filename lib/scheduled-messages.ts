import { readStorage, writeStorage } from '@/lib/storage';

export interface ScheduledMessage {
  id: string;
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    mime: string;
    data: string;
  }>;
  sendAt: string;
  draftId?: string;
  createdAt: string;
}

type ScheduledMessages = Record<string, ScheduledMessage[]>;

// The send route and the scheduled-send run both read-modify-write the same
// file; queueing the cycles in-process keeps one from overwriting the other.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Applies an update to `allScheduledMessages` through a serialized queue.
 *
 * The stored map is re-read inside the queue, right before writing, so callers
 * never persist a snapshot taken before a long operation such as sending mail.
 *
 * @param update Receives the freshest map and returns the map to persist.
 * @returns Promise that settles when the update has been written.
 */
export function updateScheduledMessages(
  update: (current: ScheduledMessages) => ScheduledMessages,
): Promise<void> {
  const next = queue.then(async () => {
    const current = await readStorage<ScheduledMessages>('allScheduledMessages', {});
    await writeStorage('allScheduledMessages', update(current));
  });
  queue = next.catch(() => {});
  return next;
}
