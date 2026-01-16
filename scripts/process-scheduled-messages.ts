import { readStorage, writeStorage } from '../lib/storage';
import { getMailProvider, getMailProviderForAccount } from '../lib/get-provider';
import { logger } from '../lib/logger';

interface ScheduledMessage {
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

async function processScheduledMessages() {
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
            html: message.html,
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

      const remainingMessages = messages.filter((msg) => !processed.includes(msg.id));
      if (remainingMessages.length === 0) {
        delete allScheduled[accountId];
      } else {
        allScheduled[accountId] = remainingMessages;
      }
    }

    if (Object.keys(allScheduled).length > 0) {
      await writeStorage('allScheduledMessages', allScheduled);
    } else {
      await writeStorage('allScheduledMessages', {});
    }
  } catch (error) {
    logger.error('Error processing scheduled messages:', error);
  }
}

if (require.main === module) {
  processScheduledMessages()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Fatal error:', error);
      process.exit(1);
    });
}

export { processScheduledMessages };
