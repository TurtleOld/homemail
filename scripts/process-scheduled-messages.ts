/**
 * Sends due scheduled messages and records the result of each one.
 *
 * Runs from the in-process daemon started by `instrumentation.ts`, and once
 * from the command line when this file is executed directly.
 */

import crypto from 'node:crypto';
import { readStorage } from '../lib/storage';
import {
  claimScheduledMessage,
  markScheduledMessageNeedsReview,
  markScheduledMessagePending,
  markScheduledMessageSent,
  readScheduledHtml,
  recoverInterruptedScheduledSends,
  removeSentScheduledMessage,
  removeSentScheduledMessages,
  type ScheduledMessage,
  type ScheduledMessages,
} from '../lib/scheduled-messages';
import { getMailProviderForAccount } from '../lib/get-provider';
import { SendUnknownError } from '../providers/mail-provider';
import { logger } from '../lib/logger';

declare global {
  var __scheduledSendDaemonStarted: boolean | undefined;
}

let isProcessing = false;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function isDue(message: ScheduledMessage, now: Date): boolean {
  return new Date(message.sendAt).getTime() <= now.getTime();
}

/**
 * Sends every scheduled message whose time has come.
 *
 * Each message is claimed in storage before the network call, and its result
 * is written back on its own. A crash therefore leaves either a `sent` marker
 * (cleaned up on the next run) or a `sending` claim that is later moved to
 * `needs_review` instead of being sent a second time.
 */
async function processScheduledMessages() {
  // The interval and a manual run in this process must not overlap.
  if (isProcessing) {
    logger.warn('Skipping scheduled-message run: previous run is still in progress');
    return;
  }
  isProcessing = true;

  const owner = `${process.pid}:${crypto.randomUUID()}`;

  try {
    const now = new Date();
    const recovered = await recoverInterruptedScheduledSends(now);
    if (recovered > 0) {
      logger.warn(
        `Moved ${recovered} interrupted scheduled send(s) to needs_review; check the Sent folder before retrying`,
      );
    }
    await removeSentScheduledMessages();

    const allScheduled = await readStorage<ScheduledMessages>('allScheduledMessages', {});

    for (const [accountId, messages] of Object.entries(allScheduled)) {
      const provider = getMailProviderForAccount(accountId);

      for (const stored of messages) {
        if (!isDue(stored, now) || (stored.status && stored.status !== 'pending')) {
          continue;
        }

        let message: ScheduledMessage | null;
        try {
          message = await claimScheduledMessage(accountId, stored.id, owner, now);
        } catch (error) {
          logger.error(`Failed to claim scheduled message ${stored.id}:`, error);
          continue;
        }
        if (!message) {
          continue;
        }

        const html = readScheduledHtml(message.html);
        if (html === null) {
          logger.error(
            `Cannot decrypt scheduled message ${message.id}; keeping it queued instead of sending ciphertext`,
          );
          await markScheduledMessagePending(
            accountId,
            message.id,
            owner,
            'Body cannot be decrypted with the current SESSION_SECRET',
          ).catch((error) => logger.error(`Failed to release scheduled message ${message.id}:`, error));
          continue;
        }

        let sentMessageId: string;
        try {
          sentMessageId = await provider.sendMessage(accountId, {
            to: message.to,
            cc: message.cc,
            bcc: message.bcc,
            subject: message.subject,
            html,
            inReplyTo: message.inReplyTo,
            references: message.references,
            requestReadReceipt: message.requestReadReceipt,
            attachments: message.attachments?.map((att) => ({
              filename: att.filename,
              mime: att.mime,
              data: Buffer.from(att.data, 'base64'),
            })),
          });
        } catch (error) {
          if (error instanceof SendUnknownError) {
            logger.error(
              `Delivery result for scheduled message ${message.id} is unknown; ` +
                'marked needs_review. Check the Sent folder, then set its status to pending to retry or delete it.',
              error,
            );
            await markScheduledMessageNeedsReview(
              accountId,
              message.id,
              `Delivery result unknown: ${errorMessage(error)}`,
            ).catch((stateError) =>
              logger.error(`Failed to mark scheduled message ${message.id} for review:`, stateError),
            );
          } else {
            logger.error(`Failed to send scheduled message ${message.id}:`, error);
            await markScheduledMessagePending(
              accountId,
              message.id,
              owner,
              errorMessage(error),
            ).catch((stateError) =>
              logger.error(`Failed to requeue scheduled message ${message.id}:`, stateError),
            );
          }
          continue;
        }

        // The server accepted the message. From here on a storage error must
        // never turn into a retry: the claim left in storage makes recovery
        // treat the delivery as unknown rather than sending it again.
        try {
          await markScheduledMessageSent(accountId, message.id, sentMessageId, new Date());
          await removeSentScheduledMessage(accountId, message.id);
        } catch (error) {
          logger.error(
            `Scheduled message ${message.id} was sent but its state could not be saved; ` +
              'it will not be sent again automatically. Check the Sent folder and resolve the entry manually.',
            error,
          );
        }

        if (message.draftId) {
          try {
            await provider.bulkUpdateMessages(accountId, {
              ids: [message.draftId],
              action: 'delete',
            });
          } catch (error) {
            logger.error(`Failed to delete draft ${message.draftId}:`, error);
          }
        }

        logger.info(`Sent scheduled message ${message.id} for account ${accountId}`);
      }
    }
  } catch (error) {
    logger.error('Error processing scheduled messages:', error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Starts the in-process scheduled-send loop.
 *
 * Runs inside Next.js so OAuth token refreshes and schedule-file writes stay in
 * one process; a separate script could rotate tokens behind Next's cache.
 * Repeated calls are ignored, and overlapping runs are skipped in
 * processScheduledMessages itself.
 */
function startScheduledSendDaemon() {
  if (globalThis.__scheduledSendDaemonStarted) {
    return;
  }
  globalThis.__scheduledSendDaemonStarted = true;

  const run = () => {
    void processScheduledMessages();
  };

  run();
  setInterval(run, 60_000);
}

if (require.main === module) {
  processScheduledMessages()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Fatal error:', error);
      process.exit(1);
    });
}

export { processScheduledMessages, startScheduledSendDaemon };
