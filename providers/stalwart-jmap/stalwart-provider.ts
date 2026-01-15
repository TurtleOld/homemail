import type { MailProvider } from '../mail-provider';
import type {
  Account,
  Folder,
  MessageListItem,
  MessageDetail,
  Draft,
  Attachment,
} from '@/lib/types';
import { JMAPClient } from './jmap-client';
import { convertFilterToJMAP } from '@/lib/filter-to-jmap';

interface JMAPAccount {
  id: string;
  name: string;
  isPersonal: boolean;
  isReadOnly: boolean;
  accountCapabilities: Record<string, any>;
}

interface StalwartConfig {
  baseUrl: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  authMode: 'basic' | 'bearer';
}

const config: StalwartConfig = {
  baseUrl: process.env.STALWART_BASE_URL || 'http://stalwart:8080',
  smtpHost: process.env.STALWART_SMTP_HOST || 'stalwart',
  smtpPort: parseInt(process.env.STALWART_SMTP_PORT || '587', 10),
  smtpSecure: process.env.STALWART_SMTP_SECURE === 'true',
  authMode: (process.env.STALWART_AUTH_MODE as 'basic' | 'bearer') || 'basic',
};

if (config.baseUrl.includes('://') && !config.baseUrl.includes('localhost') && !config.baseUrl.includes('127.0.0.1')) {
  try {
    const url = new URL(config.baseUrl);
    if (url.hostname.includes('.')) {
      console.warn(`[StalwartProvider] ⚠ WARNING: STALWART_BASE_URL contains domain name (${url.hostname}) instead of container name!`);
      console.warn(`[StalwartProvider] ⚠ Domain names resolve to external IPs and won't work for Docker container communication.`);
      console.warn(`[StalwartProvider] ⚠ Please use container name (e.g., 'stalwart' or 'homemail-stalwart') instead: STALWART_BASE_URL=http://stalwart:8080`);
    }
  } catch {
  }
}

import { getCredentials, setCredentials as saveCredentials, loadCredentials } from '@/lib/storage';

interface UserCredentials {
  email: string;
  password: string;
}

let credentialsStore: Map<string, UserCredentials> | null = null;

async function getCredentialsStore(): Promise<Map<string, UserCredentials>> {
  if (credentialsStore === null) {
    credentialsStore = new Map();
    const stored = await loadCredentials();
    for (const [accountId, creds] of stored.entries()) {
      credentialsStore.set(accountId, { email: creds.email, password: creds.password });
    }
  }
  return credentialsStore;
}

export async function setUserCredentials(accountId: string, email: string, password: string): Promise<void> {
  const store = await getCredentialsStore();
  store.set(accountId, { email, password });
  await saveCredentials(accountId, email, password);
}

export async function getUserCredentials(accountId: string): Promise<UserCredentials | null> {
  const store = await getCredentialsStore();
  const fromMemory = store.get(accountId);
  if (fromMemory) {
    return fromMemory;
  }
  
  const fromStorage = await getCredentials(accountId);
  if (fromStorage) {
    const creds = { email: fromStorage.email, password: fromStorage.password };
    store.set(accountId, creds);
    return creds;
  }
  
  return null;
}

/**
 * Проверяет, что email является валидным адресом электронной почты (содержит '@').
 * Выбрасывает ошибку, если это не email.
 */
function validateEmail(email: string, context: string = 'credentials'): void {
  if (!email || !email.includes('@')) {
    throw new Error(
      `Invalid email address in ${context}. Expected full email address (e.g., user@example.com), got: ${email}`
    );
  }
}

export class StalwartJMAPProvider implements MailProvider {
  private async getClient(accountId: string): Promise<JMAPClient> {
    const creds = await getUserCredentials(accountId);
    if (!creds) {
      throw new Error('User credentials not found');
    }

    // Проверяем, что creds.email является валидным email адресом
    validateEmail(creds.email, 'credentials');

    // Используем creds.email (теперь всегда должен быть полным email адресом)
    return new JMAPClient(config.baseUrl, creds.email, creds.password, accountId, config.authMode);
  }

  async getAccount(accountId: string): Promise<Account | null> {
    try {
      // Получаем credentials
      const creds = await getUserCredentials(accountId);
      if (!creds) {
        const { logger } = await import('@/lib/logger');
        logger.warn(`No credentials found for accountId: ${accountId}`);
        return null;
      }

      // Проверяем, что creds.email является валидным email адресом
      validateEmail(creds.email, 'credentials');

      // Создаём client с email адресом
      const client = await this.getClient(accountId);

      try {
        const session = await client.getSession();

        let account: JMAPAccount | undefined;

        if (session.primaryAccounts?.mail) {
          account = session.accounts[session.primaryAccounts.mail];
        } else {
          const accountKeys = Object.keys(session.accounts);
          if (accountKeys.length > 0) {
            account = session.accounts[accountKeys[0]];
          }
        }

        if (!account) {
          const { logger } = await import('@/lib/logger');
          logger.warn(`No account found in session for accountId: ${accountId}`);
          return null;
        }

        // Используем email из credentials (теперь всегда должен быть полным email адресом)
        const email = creds.email;

        return {
          id: account.id || accountId,
          email: email,
          displayName: account.name || email.split('@')[0],
        };
      } catch (sessionError) {
        // Если не удалось получить session, логируем детали для отладки
        const { logger } = await import('@/lib/logger');
        const errorMessage = sessionError instanceof Error ? sessionError.message : String(sessionError);
        const errorStack = sessionError instanceof Error ? sessionError.stack : undefined;
        logger.error(`Failed to get JMAP session for account ${accountId} (email: ${creds.email}):`, errorMessage, errorStack ? `\n${errorStack}` : '');

        // Пробрасываем ошибку дальше, чтобы вызывающий код мог понять, что произошло
        throw sessionError;
      }
    } catch (error) {
      const { logger } = await import('@/lib/logger');
      logger.error('Failed to get account:', error instanceof Error ? error.message : error);
      // Пробрасываем ошибку дальше, чтобы вызывающий код мог понять, что произошло
      throw error;
    }
  }

  async getFolders(accountId: string): Promise<Folder[]> {
    try {
      const client = await this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;
      const mailboxes = await client.getMailboxes(actualAccountId);

      if (!mailboxes || mailboxes.length === 0) {
        console.warn(`[StalwartProvider] No mailboxes found for accountId: ${accountId}, actualAccountId: ${actualAccountId}`);
        return [];
      }

      return mailboxes.map((mb) => {
        let role: Folder['role'] = 'custom';
        if (mb.role) {
          if (mb.role === 'junk') {
            role = 'spam';
          } else if (['inbox', 'sent', 'drafts', 'trash', 'spam'].includes(mb.role)) {
            role = mb.role as Folder['role'];
          }
        }

        return {
          id: mb.id,
          name: mb.name,
          role,
          unreadCount: mb.unreadEmails || 0,
        };
      });
    } catch (error) {
      const stalwartUrl = config.baseUrl;
      if (error instanceof Error && (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed'))) {
        console.error(`[StalwartProvider] Connection error in getFolders for accountId ${accountId}. Cannot connect to Stalwart at ${stalwartUrl}:`, error);
      } else {
        console.error(`[StalwartProvider] Error in getFolders for accountId ${accountId}:`, error);
      }
      throw error;
    }
  }

  async getMessages(
    accountId: string,
    folderId: string,
    options: {
      cursor?: string;
      limit?: number;
      q?: string;
      filter?: 'unread' | 'starred' | 'attachments';
      messageFilter?: import('@/lib/types').MessageFilter;
    }
  ): Promise<{ messages: MessageListItem[]; nextCursor?: string }> {
    try {
      const client = await this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;

      let position = 0;
      let queryState: string | undefined;

      if (options.cursor) {
        try {
          const cursorData = JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf-8'));
          position = cursorData.position || 0;
          queryState = cursorData.queryState;
        } catch {
          position = 0;
        }
      }

      let filter: any = {
        inMailbox: folderId,
      };

      if (options.messageFilter) {
        const jmapFilter = convertFilterToJMAP(
          options.messageFilter.filterGroup,
          options.messageFilter.quickFilter,
          options.messageFilter.securityFilter,
          folderId
        );
        filter = { ...filter, ...jmapFilter };
        if (jmapFilter.inMailbox && jmapFilter.inMailbox !== folderId) {
          filter.inMailbox = jmapFilter.inMailbox;
        }
      }

      if (options.q && !filter.text) {
        filter.text = options.q;
      }

      if (options.filter === 'unread') {
        filter.isUnread = true;
      } else if (options.filter === 'starred') {
        filter.isFlagged = true;
      } else if (options.filter === 'attachments') {
        filter.hasAttachment = true;
      }

      const limit = options.limit || 50;
      const queryResult = await client.queryEmails(folderId, {
        accountId: actualAccountId,
        position,
        limit: limit + 1,
        filter,
        sort: [{ property: 'receivedAt', isAscending: false }],
      });

      const emailIds = queryResult.ids.slice(0, limit);
      const hasMore = queryResult.ids.length > limit;

      if (emailIds.length === 0) {
        return { messages: [] };
      }

      const emails = await client.getEmails(emailIds, {
        accountId: actualAccountId,
        properties: [
          'id',
          'threadId',
          'from',
          'subject',
          'receivedAt',
          'preview',
          'hasAttachment',
          'size',
          'keywords',
        ],
      });

      const messages: MessageListItem[] = emails.map((email) => {
        const from = email.from?.[0] || { email: 'unknown' };
        const isUnread = !email.keywords?.['$seen'];
        const isStarred = email.keywords?.['$flagged'] === true;

        return {
          id: email.id,
          threadId: email.threadId || email.id,
          from: {
            email: from.email,
            name: from.name,
          },
          subject: email.subject || '(без темы)',
          snippet: email.preview || '',
          date: new Date(email.receivedAt),
          flags: {
            unread: isUnread,
            starred: isStarred,
            hasAttachments: email.hasAttachment || false,
          },
          size: email.size || 0,
        };
      });

      let nextCursor: string | undefined;
      if (hasMore) {
        const nextPosition = position + limit;
        nextCursor = Buffer.from(
          JSON.stringify({
            position: nextPosition,
            queryState: queryResult.queryState,
            folderId,
            q: options.q,
            filter: options.filter,
          })
        ).toString('base64url');
      }

      return { messages, nextCursor };
    } catch (error) {
      const stalwartUrl = config.baseUrl;
      if (error instanceof Error && (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed'))) {
        console.error(`[StalwartProvider] Connection error in getMessages for accountId ${accountId}, folderId ${folderId}. Cannot connect to Stalwart at ${stalwartUrl}:`, error);
      } else {
        console.error(`[StalwartProvider] Error in getMessages for accountId ${accountId}, folderId ${folderId}:`, error);
      }
      throw error;
    }
  }

  async getMessage(accountId: string, messageId: string): Promise<MessageDetail | null> {
    try {
      const client = await this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;
      
      const emails = await client.getEmails([messageId], {
        accountId: actualAccountId,
        properties: [
          'id',
          'threadId',
          'mailboxIds',
          'keywords',
          'from',
          'to',
          'cc',
          'bcc',
          'subject',
          'receivedAt',
          'bodyStructure',
          'bodyValues',
          'textBody',
          'htmlBody',
          'hasAttachment',
          'size',
        ],
        fetchTextBodyValues: true,
        fetchHTMLBodyValues: true,
      });

      if (emails.length === 0) {
        return null;
      }

      const email = emails[0];
      const from = email.from?.[0] || { email: 'unknown' };

      const attachments: Attachment[] = [];
      if (email.bodyStructure) {
        const extractAttachments = (part: any): void => {
          if (part.disposition === 'attachment' || (part.disposition === 'inline' && part.name)) {
            attachments.push({
              id: part.blobId || part.partId || '',
              filename: part.name || part.filename || 'attachment',
              mime: part.type || 'application/octet-stream',
              size: part.size || 0,
            });
          }
          if (part.subParts) {
            for (const subPart of part.subParts) {
              extractAttachments(subPart);
            }
          }
        };

        extractAttachments(email.bodyStructure);
      }

      let textBody: string | undefined;
      let htmlBody: string | undefined;

      if (email.bodyValues && Object.keys(email.bodyValues).length > 0) {
        const hasTextBodyParts = email.textBody && email.textBody.length > 0;
        const hasHtmlBodyParts = email.htmlBody && email.htmlBody.length > 0;

        if (hasTextBodyParts || hasHtmlBodyParts) {
          for (const [partId, bodyValue] of Object.entries(email.bodyValues)) {
            const value = bodyValue as { value: string; isEncodingProblem?: boolean; isTruncated?: boolean };
            if (value.value) {
              if (hasTextBodyParts && email.textBody?.some((tb) => tb.partId === partId)) {
                textBody = value.value;
              }
              if (hasHtmlBodyParts && email.htmlBody?.some((hb) => hb.partId === partId)) {
                htmlBody = value.value;
              }
            }
          }
        }

        if (!textBody && !htmlBody) {
          for (const bodyValue of Object.values(email.bodyValues)) {
            const value = bodyValue as { value: string; isEncodingProblem?: boolean; isTruncated?: boolean };
            if (value?.value && value.value.trim().length > 0) {
              const content = value.value.trim();
              const looksLikeHtml = content.startsWith('<') && (content.includes('<html') || content.includes('<body') || content.includes('<div') || content.includes('<p'));
              
              if (looksLikeHtml && !htmlBody) {
                htmlBody = value.value;
              } else if (!looksLikeHtml && !textBody) {
                textBody = value.value;
              }
            }
          }
        }
      }

      if ((!textBody || !htmlBody) && email.bodyStructure) {
        const extractBodyFromStructure = (part: any, targetType: 'text' | 'html'): string | undefined => {
          if (!part) return undefined;

          const partType = part.type || '';
          if (partType.includes('text/plain') && targetType === 'text' && part.blobId) {
            return part.blobId;
          }
          if (partType.includes('text/html') && targetType === 'html' && part.blobId) {
            return part.blobId;
          }

          if (part.subParts && Array.isArray(part.subParts)) {
            for (const subPart of part.subParts) {
              const result = extractBodyFromStructure(subPart, targetType);
              if (result) return result;
            }
          }

          if (part.parts && Array.isArray(part.parts)) {
            for (const subPart of part.parts) {
              const result = extractBodyFromStructure(subPart, targetType);
              if (result) return result;
            }
          }

          return undefined;
        };

        if (!textBody) {
          const textBlobId = extractBodyFromStructure(email.bodyStructure, 'text');
          if (textBlobId && typeof textBlobId === 'string') {
            try {
              const downloadUrl = await client.getBlobDownloadUrl(textBlobId, actualAccountId);
              const response = await fetch(downloadUrl, {
                headers: {
                  'Authorization': client.getAuthHeader(),
                },
              });
              if (response.ok) {
                textBody = await response.text();
              }
            } catch {
            }
          }
        }

        if (!htmlBody) {
          const htmlBlobId = extractBodyFromStructure(email.bodyStructure, 'html');
          if (htmlBlobId && typeof htmlBlobId === 'string') {
            try {
              const downloadUrl = await client.getBlobDownloadUrl(htmlBlobId, actualAccountId);
              const response = await fetch(downloadUrl, {
                headers: {
                  'Authorization': client.getAuthHeader(),
                },
              });
              if (response.ok) {
                htmlBody = await response.text();
              }
            } catch {
            }
          }
        }
      }

      return {
        id: email.id,
        threadId: email.threadId || email.id,
        headers: {},
        from: {
          email: from.email,
          name: from.name,
        },
        to: (email.to || []).map((t) => ({ email: t.email, name: t.name })),
        cc: email.cc?.map((c) => ({ email: c.email, name: c.name })),
        bcc: email.bcc?.map((b) => ({ email: b.email, name: b.name })),
        subject: email.subject || '(без темы)',
        date: new Date(email.receivedAt),
        body: {
          text: textBody,
          html: htmlBody,
        },
        attachments,
        flags: {
          unread: !email.keywords?.['$seen'],
          starred: email.keywords?.['$flagged'] === true,
          hasAttachments: attachments.length > 0,
        },
      };
    } catch (error) {
      return null;
    }
  }

  async updateMessageFlags(
    accountId: string,
    messageId: string,
    flags: Partial<{ unread: boolean; starred: boolean }>
  ): Promise<void> {
    try {
      const client = await this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;
      const email = await client.getEmails([messageId], { accountId: actualAccountId, properties: ['keywords'] });

      if (email.length === 0) {
        throw new Error('Message not found');
      }

      const currentKeywords = email[0].keywords || {};
      const newKeywords: Record<string, boolean> = { ...currentKeywords };

      if (flags.unread !== undefined) {
        if (flags.unread) {
          delete newKeywords['$seen'];
        } else {
          newKeywords['$seen'] = true;
        }
      }

      if (flags.starred !== undefined) {
        if (flags.starred) {
          newKeywords['$flagged'] = true;
        } else {
          delete newKeywords['$flagged'];
        }
      }

      await client.setEmailFlags(messageId, { accountId: actualAccountId, keywords: newKeywords });
    } catch (error) {
      throw error;
    }
  }

  async bulkUpdateMessages(
    accountId: string,
    action: {
      ids: string[];
      action: 'markRead' | 'markUnread' | 'move' | 'delete' | 'spam' | 'star' | 'unstar';
      payload?: { folderId?: string };
    }
  ): Promise<void> {
    try {
      const client = await this.getClient(accountId);

      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;

      if (action.action === 'delete') {
        const mailboxes = await client.getMailboxes(actualAccountId);
        const trashMailbox = mailboxes.find((mb) => mb.role === 'trash');

        if (trashMailbox) {
          const emailsToMove: Record<string, { mailboxIds: Record<string, boolean> }> = {};
          const emailsToDestroy: string[] = [];

          for (const id of action.ids) {
            const email = await client.getEmails([id], { accountId: actualAccountId, properties: ['mailboxIds'] });
            if (email.length > 0) {
              const currentMailboxIds = email[0].mailboxIds || {};
              const isInTrash = currentMailboxIds[trashMailbox.id] === true;

              if (isInTrash) {
                emailsToDestroy.push(id);
              } else {
                const newMailboxIds: Record<string, boolean> = {};
                newMailboxIds[trashMailbox.id] = true;
                emailsToMove[id] = { mailboxIds: newMailboxIds };
              }
            }
          }

          if (Object.keys(emailsToMove).length > 0) {
            await client.bulkSetEmails(emailsToMove, actualAccountId);
          }

          if (emailsToDestroy.length > 0) {
            await client.destroyEmails(emailsToDestroy, actualAccountId);
          }
        } else {
          await client.destroyEmails(action.ids, actualAccountId);
        }
        return;
      }

      if (action.action === 'spam') {
        const mailboxes = await client.getMailboxes(actualAccountId);
        const spamMailbox = mailboxes.find((mb) => mb.role === 'spam' || mb.role === 'junk');

        if (spamMailbox) {
          const updates: Record<string, { mailboxIds: Record<string, boolean> }> = {};
          for (const id of action.ids) {
            const email = await client.getEmails([id], { accountId: actualAccountId, properties: ['mailboxIds'] });
            if (email.length > 0) {
              const newMailboxIds: Record<string, boolean> = {};
              newMailboxIds[spamMailbox.id] = true;
              updates[id] = { mailboxIds: newMailboxIds };
            }
          }
          if (Object.keys(updates).length > 0) {
            await client.bulkSetEmails(updates, actualAccountId);
          }
        }
        return;
      }

      if (action.action === 'move' && action.payload?.folderId) {
        const updates: Record<string, { mailboxIds: Record<string, boolean> }> = {};
        for (const id of action.ids) {
          const newMailboxIds: Record<string, boolean> = {};
          newMailboxIds[action.payload.folderId] = true;
          updates[id] = { mailboxIds: newMailboxIds };
        }
        await client.bulkSetEmails(updates, actualAccountId);
        return;
      }

      const emails = await client.getEmails(action.ids, { accountId: actualAccountId, properties: ['keywords'] });
      const updates: Record<string, { keywords: Record<string, boolean> }> = {};

      for (let i = 0; i < action.ids.length; i++) {
        const id = action.ids[i];
        const email = emails[i];
        const currentKeywords = email?.keywords || {};
        const newKeywords: Record<string, boolean> = { ...currentKeywords };

        switch (action.action) {
          case 'markRead':
            newKeywords['$seen'] = true;
            break;
          case 'markUnread':
            delete newKeywords['$seen'];
            break;
          case 'star':
            newKeywords['$flagged'] = true;
            break;
          case 'unstar':
            delete newKeywords['$flagged'];
            break;
        }

        updates[id] = { keywords: newKeywords };
      }

      await client.bulkSetEmails(updates, actualAccountId);
    } catch (error) {
      throw error;
    }
  }

  async sendMessage(
    accountId: string,
    message: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      html: string;
      attachments?: Array<{ filename: string; mime: string; data: Buffer }>;
    }
  ): Promise<string> {
    try {
      const creds = await getUserCredentials(accountId);
      if (!creds) {
        throw new Error('User credentials not found');
      }

      validateEmail(creds.email, 'credentials');

      const client = await this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;
      
      const mailboxes = await client.getMailboxes(actualAccountId);
      const sentMailbox = mailboxes.find((mb) => mb.role === 'sent');
      
      if (!sentMailbox) {
        throw new Error('Sent mailbox not found');
      }

      const account = await this.getAccount(accountId);
      const fromEmail = account?.email || creds.email;
      validateEmail(fromEmail, 'fromEmail');

      const from = [{ email: fromEmail, name: fromEmail.split('@')[0] }];
      const to = message.to.map((email) => ({ email }));
      const cc = message.cc?.map((email) => ({ email }));
      const bcc = message.bcc?.map((email) => ({ email }));

      const emailAttachments: Array<{ blobId: string; type: string; name: string; size: number }> = [];
      
      if (message.attachments && message.attachments.length > 0) {
        for (const att of message.attachments) {
          const blobId = await client.uploadBlob(att.data, actualAccountId, att.mime);
          emailAttachments.push({
            blobId,
            type: att.mime,
            name: att.filename,
            size: att.data.length,
          });
        }
      }

      const emailBody: any = {
        mailboxIds: { [sentMailbox.id]: true },
        from,
        to,
        subject: message.subject,
        keywords: {
          '$seen': true,
        },
        bodyStructure: {
          partId: 'body',
          type: 'text/html',
        },
        bodyValues: {
          body: {
            value: message.html,
          },
        },
      };

      if (cc && cc.length > 0) {
        emailBody.cc = cc;
      }
      if (bcc && bcc.length > 0) {
        emailBody.bcc = bcc;
      }

      if (emailAttachments.length > 0) {
        emailBody.attachments = emailAttachments;
      }

      const response = await client.request([
        [
          'Email/set',
          {
            accountId: actualAccountId,
            create: {
              message1: emailBody,
            },
          },
          '0',
        ],
      ]);

      const setResponse = response.methodResponses[0];
      if (setResponse[0] !== 'Email/set') {
        throw new Error('Invalid email create response');
      }

      if ('type' in setResponse[1] && setResponse[1].type === 'error') {
        const errorDesc = (setResponse[1] as any).description || 'Unknown error';
        throw new Error(`JMAP email create error: ${errorDesc}`);
      }

      const data = setResponse[1] as { created?: Record<string, { id: string }> };
      if (!data.created || Object.keys(data.created).length === 0) {
        throw new Error('Failed to create email');
      }

      const emailId = Object.values(data.created)[0].id;
      const submissionId = await client.sendEmail(emailId, actualAccountId);

      return emailId;
    } catch (error) {
      throw error;
    }
  }

  async saveDraft(accountId: string, draft: Draft): Promise<string> {
    try {
      const client = await this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;
      const mailboxes = await client.getMailboxes(actualAccountId);
      const draftsMailbox = mailboxes.find((mb) => mb.role === 'drafts');

      if (!draftsMailbox) {
        throw new Error('Drafts mailbox not found');
      }

      const creds = await getUserCredentials(accountId);
      if (!creds) {
        throw new Error('User credentials not found');
      }

      // Проверяем, что creds.email является валидным email адресом
      validateEmail(creds.email, 'credentials');

      const account = await this.getAccount(accountId);
      const fromEmail = account?.email || creds.email;
      
      // Проверяем, что fromEmail является валидным email адресом
      validateEmail(fromEmail, 'fromEmail');
      const from = [{ email: fromEmail, name: fromEmail.split('@')[0] }];
      const to = draft.to?.map((email) => ({ email })) || [];
      const cc = draft.cc?.map((email) => ({ email }));
      const bcc = draft.bcc?.map((email) => ({ email }));

      const draftEmail = {
        mailboxIds: { [draftsMailbox.id]: true },
        from,
        to,
        cc,
        bcc,
        subject: draft.subject || '(без темы)',
        keywords: { '$draft': true },
        bodyStructure: {
          partId: 'body',
          type: 'text/html',
        },
        bodyValues: {
          body: {
            value: draft.html || '',
          },
        },
      };

      const response = await client.request([
        [
          'Email/set',
          draft.id
            ? {
                accountId: actualAccountId,
                update: {
                  [draft.id]: {
                    bodyValues: draftEmail.bodyValues,
                    subject: draftEmail.subject,
                    to,
                    cc,
                    bcc,
                  },
                },
              }
            : {
                accountId: actualAccountId,
                create: {
                  draft1: draftEmail,
                },
              },
          '0',
        ],
      ]);

      const setResponse = response.methodResponses[0];
      if (setResponse[0] !== 'Email/set') {
        throw new Error('Invalid draft save response');
      }

      if ('type' in setResponse[1] && setResponse[1].type === 'error') {
        throw new Error(`JMAP draft save error: ${(setResponse[1] as any).description}`);
      }

      const data = setResponse[1] as { created?: Record<string, { id: string }>; updated?: Record<string, any> };
      if (draft.id && data.updated) {
        return draft.id;
      }
      if (data.created) {
        return Object.values(data.created)[0].id;
      }

      throw new Error('Failed to get draft ID');
    } catch (error) {
      throw error;
    }
  }

  async getDraft(accountId: string, draftId: string): Promise<Draft | null> {
    try {
      const client = await this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;
      
      const emails = await client.getEmails([draftId], {
        accountId: actualAccountId,
        properties: [
          'id',
          'to',
          'cc',
          'bcc',
          'subject',
          'bodyValues',
          'htmlBody',
        ],
      });

      if (emails.length === 0) {
        return null;
      }

      const email = emails[0];
      let html = '';

      if (email.bodyValues) {
        for (const [partId, bodyValue] of Object.entries(email.bodyValues)) {
          if (email.htmlBody?.some((hb) => hb.partId === partId)) {
            html = (bodyValue as { value: string }).value;
            break;
          }
        }
      }

      return {
        id: email.id,
        to: email.to?.map((t) => t.email),
        cc: email.cc?.map((c) => c.email),
        bcc: email.bcc?.map((b) => b.email),
        subject: email.subject,
        html,
      };
    } catch (error) {
      return null;
    }
  }

  async getAttachment(
    accountId: string,
    messageId: string,
    attachmentId: string
  ): Promise<(Attachment & { data: Buffer }) | null> {
    try {
      const message = await this.getMessage(accountId, messageId);

      if (!message) {
        return null;
      }

      const attachment = message.attachments.find((att) => att.id === attachmentId);
      if (!attachment) {
        return null;
      }

      const client = await this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;
      const downloadUrl = await client.getBlobDownloadUrl(attachmentId, actualAccountId, attachment.filename);

      const response = await fetch(downloadUrl, {
        headers: {
          'Authorization': client.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download attachment: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return {
        ...attachment,
        data: Buffer.from(arrayBuffer),
      };
    } catch (error) {
      return null;
    }
  }

  async createFolder(accountId: string, name: string, parentId?: string): Promise<Folder> {
    try {
      const client = await this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;

      const response = await client.request([
        [
          'Mailbox/set',
          {
            accountId: actualAccountId,
            create: {
              newFolder: {
                name,
                parentId: parentId || null,
                role: null,
              },
            },
          },
          '0',
        ],
      ]);

      const setResponse = response.methodResponses[0];
      if (setResponse[0] !== 'Mailbox/set') {
        throw new Error('Invalid mailbox create response');
      }

      if ('type' in setResponse[1] && setResponse[1].type === 'error') {
        const errorDesc = (setResponse[1] as any).description || 'Unknown error';
        throw new Error(`JMAP mailbox create error: ${errorDesc}`);
      }

      const data = setResponse[1] as { created?: Record<string, { id: string }> };
      if (!data.created || Object.keys(data.created).length === 0) {
        throw new Error('Failed to create mailbox');
      }

      const mailboxId = Object.values(data.created)[0].id;
      const mailboxes = await client.getMailboxes(actualAccountId);
      const newMailbox = mailboxes.find((mb) => mb.id === mailboxId);

      if (!newMailbox) {
        throw new Error('Created mailbox not found');
      }

      return {
        id: newMailbox.id,
        name: newMailbox.name,
        role: 'custom',
        unreadCount: newMailbox.unreadEmails || 0,
      };
    } catch (error) {
      throw error;
    }
  }

  async deleteFolder(accountId: string, folderId: string): Promise<void> {
    try {
      const client = await this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;

      const mailboxes = await client.getMailboxes(actualAccountId);
      const folder = mailboxes.find((mb) => mb.id === folderId);

      if (!folder) {
        throw new Error('Folder not found');
      }

      if (folder.role && ['inbox', 'sent', 'drafts', 'trash', 'spam', 'junk'].includes(folder.role)) {
        throw new Error('Cannot delete system folder');
      }

      const response = await client.request([
        [
          'Mailbox/set',
          {
            accountId: actualAccountId,
            destroy: [folderId],
          },
          '0',
        ],
      ]);

      const setResponse = response.methodResponses[0];
      if (setResponse[0] !== 'Mailbox/set') {
        throw new Error('Invalid mailbox delete response');
      }

      if ('type' in setResponse[1] && setResponse[1].type === 'error') {
        const errorDesc = (setResponse[1] as any).description || 'Unknown error';
        throw new Error(`JMAP mailbox delete error: ${errorDesc}`);
      }
    } catch (error) {
      throw error;
    }
  }

  subscribeToUpdates(
    accountId: string,
    callback: (event: { type: string; data: any }) => void
  ): () => void {
    let intervalId: NodeJS.Timeout | null = null;
    let lastQueryState: string | undefined;
    let isActive = true;

    const poll = async () => {
      if (!isActive) return;

      try {
        const client = await this.getClient(accountId);
        const session = await client.getSession();
        const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;
        const mailboxes = await client.getMailboxes(actualAccountId);
        const inbox = mailboxes.find((mb) => mb.role === 'inbox');

        if (!inbox) {
          return;
        }

        const queryResult = await client.queryEmails(inbox.id, {
          accountId: actualAccountId,
          position: 0,
          limit: 1,
          filter: { inMailbox: inbox.id },
        });

        if (queryResult.queryState !== lastQueryState) {
          lastQueryState = queryResult.queryState;
          callback({
            type: 'mailbox.counts',
            data: {},
          });
        }
      } catch (error) {
      }
    };

    intervalId = setInterval(poll, 15000);
    poll();

    return () => {
      isActive = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }
}
