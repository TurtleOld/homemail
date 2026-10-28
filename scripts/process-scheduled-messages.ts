import { readStorage, decryptData } from '../lib/storage';
import { updateScheduledMessages, type ScheduledMessage } from '../lib/scheduled-messages';
import { getMailProvider, getMailProviderForAccount } from '../lib/get-provider';
import { logger } from '../lib/logger';

declare global {
  var __scheduledSendDaemonStarted: boolean | undefined;
}

let isProcessing = false;

async function processScheduledMessages() {
  // The interval and a manual run must not write allScheduledMessages concurrently.
  if (isProcessing) {
    logger.warn('Skipping scheduled-message run: previous run is still in progress');
    return;
  }
  isProcessing = true;
  try {
    const allScheduled = await readStorage<Record<string, ScheduledMessage[]>>('allScheduledMessages', {});
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

      const provider = process.env.MAIL_PROVIDER === 'stalwart'
        ? getMailProviderForAccount(accountId)
        : getMailProvider();

      for (const message of pendingMessages) {
        try {
          await provider.sendMessage(accountId, {
            to: message.to,
            cc: message.cc,
            bcc: message.bcc,
            subject: message.subject,
            // Rows written before the encryption change hold plain HTML.
            html: decryptData(message.html) ?? message.html,
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
