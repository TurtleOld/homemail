/**
 * Sends due scheduled messages and removes them from storage.
 *
 * Runs from the in-process daemon started by `instrumentation.ts`, and once
 * from the command line when this file is executed directly.
 */

import { readStorage } from '../lib/storage';
import {
  readScheduledHtml,
  updateScheduledMessages,
  type ScheduledMessages,
} from '../lib/scheduled-messages';
import { getMailProviderForAccount } from '../lib/get-provider';
import { logger } from '../lib/logger';

declare global {
  var __scheduledSendDaemonStarted: boolean | undefined;
}

let isProcessing = false;

/**
 * Sends every scheduled message whose time has come.
 *
 * A message that cannot be sent stays in storage and is retried on the next
 * run, because send failures are usually transient (network or token refresh).
 */
async function processScheduledMessages() {
  // The interval and a manual run must not write allScheduledMessages concurrently.
  if (isProcessing) {
    logger.warn('Skipping scheduled-message run: previous run is still in progress');
    return;
  }
  isProcessing = true;
  try {
    const allScheduled = await readStorage<ScheduledMessages>('allScheduledMessages', {});
    const now = new Date();
    const processed: string[] = [];

    for (const [accountId, messages] of Object.entries(allScheduled)) {
      const pendingMessages = messages.filter((msg) => {
        const sendAt = new Date(msg.sendAt);
        return sendAt.getTime() <= now.getTime();
      });

      if (pendingMessages.length === 0) {
        continue;
      }

      const provider = getMailProviderForAccount(accountId);

      for (const message of pendingMessages) {
        const html = readScheduledHtml(message.html);
        if (html === null) {
          logger.error(
            `Cannot decrypt scheduled message ${message.id}; keeping it queued instead of sending ciphertext`,
          );
          continue;
        }

        try {
          await provider.sendMessage(accountId, {
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

          processed.push(message.id);
          logger.info(`Sent scheduled message ${message.id} for account ${accountId}`);
        } catch (error) {
          logger.error(`Failed to send scheduled message ${message.id}:`, error);
        }
      }
    }

    // Remove only ids sent in this run, from the freshest stored copy: the send
    // route may have appended messages while this run was awaiting sendMessage.
    if (processed.length > 0) {
      const sentIds = new Set(processed);
      await updateScheduledMessages((current) => {
        for (const [accountId, messages] of Object.entries(current)) {
          const remainingMessages = messages.filter((msg) => !sentIds.has(msg.id));
          if (remainingMessages.length === 0) {
            delete current[accountId];
          } else {
            current[accountId] = remainingMessages;
          }
        }
        return current;
      });
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
