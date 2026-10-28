/**
 * Shared access to the `allScheduledMessages` storage slot.
 *
 * The send route writes to the slot and the in-process scheduled-send daemon
 * removes entries from it, so both go through the serialized queue below.
 */

import { decryptData, readStorage, writeStorage } from '@/lib/storage';

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
  inReplyTo?: string;
  references?: string[];
  requestReadReceipt?: boolean;
  createdAt: string;
}

export type ScheduledMessages = Record<string, ScheduledMessage[]>;

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

/**
 * Tells whether a stored body has the shape of an encrypted payload.
 *
 * Bodies are AES-GCM ciphertext encoded as base64url: only the base64url
 * alphabet, no whitespace, and at least an IV plus an auth tag.
 *
 * @param value Stored `html` field of a scheduled message.
 * @returns True when the value round-trips through base64url decoding.
 */
function looksEncrypted(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return false;
  }
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length >= 32 && bytes.toString('base64url') === value;
}

/**
 * Decodes the HTML body stored with a scheduled message.
 *
 * Bodies are encrypted at rest, but rows written before that change hold plain
 * HTML. An encrypted-looking body that this process cannot decrypt (for
 * example after a `SESSION_SECRET` rotation) returns `null` so the caller can
 * keep the message queued instead of mailing the recipient ciphertext.
 *
 * @param storedHtml Stored `html` field of a scheduled message.
 * @returns Body to send, or `null` when the body cannot be decrypted.
 */
export function readScheduledHtml(storedHtml: string): string | null {
  const decrypted = decryptData(storedHtml);
  if (decrypted !== null) {
    return decrypted;
  }
  return looksEncrypted(storedHtml) ? null : storedHtml;
}
