/**
 * Shared access to the `allScheduledMessages` storage slot.
 *
 * The send route appends messages and the scheduled-send runner claims, sends
 * and removes them. Both go through the cross-process lock in `storage.ts`, so
 * a manual command-line run cannot race the in-process daemon.
 */

import { decryptData, readStorage, withStorageLock, writeStorage } from '@/lib/storage';

/**
 * Processing state of a scheduled message.
 *
 * A missing `status` on rows written before this field existed means `pending`.
 * `needs_review` means a send may have reached the server but its result was
 * lost: the runner never retries it automatically. To resolve one, check the
 * Sent folder for the message, then set `status` back to `pending` to retry or
 * delete the entry to give up.
 */
export type ScheduledMessageStatus = 'pending' | 'sending' | 'sent' | 'needs_review';

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
  status?: ScheduledMessageStatus;
  attempt?: {
    owner: string;
    startedAt: string;
  };
  sentAt?: string;
  sentMessageId?: string;
  lastError?: string;
}

export type ScheduledMessages = Record<string, ScheduledMessage[]>;

/**
 * How long a `sending` claim stays valid before another run treats it as an
 * interrupted send whose result is unknown.
 */
export const SENDING_LEASE_MS = 10 * 60_000;

function messageStatus(message: ScheduledMessage): ScheduledMessageStatus {
  return message.status ?? 'pending';
}

/**
 * Applies an update to `allScheduledMessages` under a cross-process lock.
 *
 * The stored map is re-read inside the lock, right before writing, so callers
 * never persist a snapshot taken before a long operation such as sending mail.
 *
 * Args:
 *   update: Receives the freshest map and returns the map to persist.
 *
 * Returns:
 *   Promise that settles when the update has been written.
 */
export function updateScheduledMessages(
  update: (current: ScheduledMessages) => ScheduledMessages,
): Promise<void> {
  return withStorageLock('allScheduledMessages', async () => {
    const current = await readStorage<ScheduledMessages>('allScheduledMessages', {});
    await writeStorage('allScheduledMessages', update(current));
  });
}

/**
 * Atomically takes a due message for one runner.
 *
 * A message is claimed only while it is `pending`, so two processes that both
 * saw it in an earlier snapshot cannot send it at the same time.
 *
 * Args:
 *   accountId: Account that owns the message.
 *   messageId: Scheduled-message id.
 *   owner: Unique id of the current processing run.
 *   now: Current time used for the due check.
 *
 * Returns:
 *   The claimed message, or `null` when another run has it or it is not due.
 */
export async function claimScheduledMessage(
  accountId: string,
  messageId: string,
  owner: string,
  now: Date,
): Promise<ScheduledMessage | null> {
  let claimed: ScheduledMessage | null = null;

  await updateScheduledMessages((current) => {
    const message = current[accountId]?.find((item) => item.id === messageId);
    if (
      !message ||
      messageStatus(message) !== 'pending' ||
      new Date(message.sendAt).getTime() > now.getTime()
    ) {
      return current;
    }

    message.status = 'sending';
    message.attempt = { owner, startedAt: now.toISOString() };
    claimed = { ...message };
    return current;
  });

  return claimed;
}

/**
 * Records that the server accepted a message.
 *
 * This write happens immediately after `sendMessage` resolves, before the
 * entry is removed, so a crash during cleanup leaves a `sent` marker instead
 * of a message that looks unsent.
 *
 * Args:
 *   accountId: Account that owns the message.
 *   messageId: Scheduled-message id.
 *   sentMessageId: Server id of the accepted message.
 *   sentAt: Time at which the server accepted the message.
 */
export async function markScheduledMessageSent(
  accountId: string,
  messageId: string,
  sentMessageId: string,
  sentAt: Date,
): Promise<void> {
  await updateScheduledMessages((current) => {
    const message = current[accountId]?.find((item) => item.id === messageId);
    if (!message) {
      return current;
    }
    message.status = 'sent';
    message.sentAt = sentAt.toISOString();
    message.sentMessageId = sentMessageId;
    delete message.attempt;
    delete message.lastError;
    return current;
  });
}

/**
 * Returns a message to the queue after a failure that provably happened
 * before the server accepted it.
 *
 * Args:
 *   accountId: Account that owns the message.
 *   messageId: Scheduled-message id.
 *   owner: Unique id of the run that held the claim.
 *   error: Short description stored for diagnostics.
 */
export async function markScheduledMessagePending(
  accountId: string,
  messageId: string,
  owner: string,
  error: string,
): Promise<void> {
  await updateScheduledMessages((current) => {
    const message = current[accountId]?.find((item) => item.id === messageId);
    if (!message || message.status === 'sent' || message.attempt?.owner !== owner) {
      return current;
    }
    message.status = 'pending';
    message.lastError = error;
    delete message.attempt;
    return current;
  });
}

/**
 * Stops automatic processing of a message whose delivery result is unknown.
 *
 * Args:
 *   accountId: Account that owns the message.
 *   messageId: Scheduled-message id.
 *   reason: Explanation stored for the operator.
 */
export async function markScheduledMessageNeedsReview(
  accountId: string,
  messageId: string,
  reason: string,
): Promise<void> {
  await updateScheduledMessages((current) => {
    const message = current[accountId]?.find((item) => item.id === messageId);
    if (!message || message.status === 'sent') {
      return current;
    }
    message.status = 'needs_review';
    message.lastError = reason;
    delete message.attempt;
    return current;
  });
}

/**
 * Turns abandoned `sending` claims into `needs_review` entries.
 *
 * A claim older than the lease means the runner stopped between writing the
 * claim and recording the result. The message may already have been delivered,
 * so it must not be sent again automatically.
 *
 * Args:
 *   now: Current time used to age the claims.
 *   leaseMs: How long a claim is trusted without a newer result.
 *
 * Returns:
 *   Number of messages moved to `needs_review`.
 */
export async function recoverInterruptedScheduledSends(
  now: Date,
  leaseMs = SENDING_LEASE_MS,
): Promise<number> {
  let recovered = 0;

  await updateScheduledMessages((current) => {
    for (const messages of Object.values(current)) {
      for (const message of messages) {
        if (message.status !== 'sending') {
          continue;
        }
        const startedAt = message.attempt ? Date.parse(message.attempt.startedAt) : Number.NaN;
        if (Number.isFinite(startedAt) && now.getTime() - startedAt < leaseMs) {
          continue;
        }
        message.status = 'needs_review';
        message.lastError = 'Previous run stopped while sending; delivery result is unknown';
        delete message.attempt;
        recovered++;
      }
    }
    return current;
  });

  return recovered;
}

/**
 * Removes entries whose send was confirmed.
 *
 * Returns:
 *   Number of removed messages.
 */
export async function removeSentScheduledMessages(): Promise<number> {
  let removed = 0;

  await updateScheduledMessages((current) => {
    for (const [accountId, messages] of Object.entries(current)) {
      const remaining = messages.filter((message) => message.status !== 'sent');
      removed += messages.length - remaining.length;
      if (remaining.length === 0) {
        delete current[accountId];
      } else {
        current[accountId] = remaining;
      }
    }
    return current;
  });

  return removed;
}

/**
 * Removes one confirmed-sent entry from the freshest stored copy.
 *
 * Args:
 *   accountId: Account that owns the message.
 *   messageId: Scheduled-message id.
 */
export async function removeSentScheduledMessage(
  accountId: string,
  messageId: string,
): Promise<void> {
  await updateScheduledMessages((current) => {
    const messages = current[accountId];
    if (!messages) {
      return current;
    }
    const remaining = messages.filter(
      (message) => !(message.id === messageId && message.status === 'sent'),
    );
    if (remaining.length === 0) {
      delete current[accountId];
    } else {
      current[accountId] = remaining;
    }
    return current;
  });
}

/**
 * Tells whether a stored body has the shape of an encrypted payload.
 *
 * Bodies are AES-GCM ciphertext encoded as base64url: only the base64url
 * alphabet, no whitespace, and at least an IV plus an auth tag.
 *
 * Args:
 *   value: Stored `html` field of a scheduled message.
 *
 * Returns:
 *   True when the value round-trips through base64url decoding.
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
 * Args:
 *   storedHtml: Stored `html` field of a scheduled message.
 *
 * Returns:
 *   Body to send, or `null` when the body cannot be decrypted.
 */
export function readScheduledHtml(storedHtml: string): string | null {
  const decrypted = decryptData(storedHtml);
  if (decrypted !== null) {
    return decrypted;
  }
  return looksEncrypted(storedHtml) ? null : storedHtml;
}
