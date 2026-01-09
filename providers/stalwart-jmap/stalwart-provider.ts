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
import * as nodemailer from 'nodemailer';

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
  baseUrl: process.env.STALWART_BASE_URL || 'https://mail.pavlovteam.ru',
  smtpHost: process.env.STALWART_SMTP_HOST || 'mail.pavlovteam.ru',
  smtpPort: parseInt(process.env.STALWART_SMTP_PORT || '587', 10),
  smtpSecure: process.env.STALWART_SMTP_SECURE === 'true',
  authMode: (process.env.STALWART_AUTH_MODE as 'basic' | 'bearer') || 'basic',
};

interface UserCredentials {
  email: string;
  password: string;
}

const credentialsStore = new Map<string, UserCredentials>();

export function setUserCredentials(accountId: string, email: string, password: string): void {
  credentialsStore.set(accountId, { email, password });
}

export function getUserCredentials(accountId: string): UserCredentials | null {
  return credentialsStore.get(accountId) || null;
}

export class StalwartJMAPProvider implements MailProvider {
  private getClient(accountId: string): JMAPClient {
    const creds = getUserCredentials(accountId);
    if (!creds) {
      throw new Error('User credentials not found');
    }
    return new JMAPClient(config.baseUrl, creds.email, creds.password, accountId, config.authMode);
  }

  async getAccount(accountId: string): Promise<Account | null> {
    try {
      const creds = getUserCredentials(accountId);
      if (!creds) {
        return null;
      }

      const client = this.getClient(accountId);
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
        return null;
      }

      return {
        id: account.id || accountId,
        email: creds.email,
        displayName: account.name || creds.email.split('@')[0],
      };
    } catch (error) {
      console.error('Failed to get account:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  async getFolders(accountId: string): Promise<Folder[]> {
    try {
      const client = this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;
      const mailboxes = await client.getMailboxes(actualAccountId);

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
      return [];
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
    }
  ): Promise<{ messages: MessageListItem[]; nextCursor?: string }> {
    try {
      const client = this.getClient(accountId);
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

      const filter: any = {
        inMailbox: folderId,
      };

      if (options.q) {
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
      return { messages: [] };
    }
  }

  async getMessage(accountId: string, messageId: string): Promise<MessageDetail | null> {
    try {
      const client = this.getClient(accountId);
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

      if (email.bodyValues) {
        for (const [partId, bodyValue] of Object.entries(email.bodyValues)) {
          const value = bodyValue as { value: string; isEncodingProblem?: boolean; isTruncated?: boolean };
          if (email.textBody?.some((tb) => tb.partId === partId)) {
            textBody = value.value;
          }
          if (email.htmlBody?.some((hb) => hb.partId === partId)) {
            htmlBody = value.value;
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
      const client = this.getClient(accountId);
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
      const client = this.getClient(accountId);

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
      const creds = getUserCredentials(accountId);
      if (!creds) {
        throw new Error('User credentials not found');
      }

      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: {
          user: creds.email,
          pass: creds.password,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const mailOptions = {
        from: creds.email,
        to: message.to.join(', '),
        cc: message.cc?.join(', '),
        bcc: message.bcc?.join(', '),
        subject: message.subject,
        html: message.html,
        attachments: message.attachments?.map((att) => ({
          filename: att.filename,
          content: att.data,
          contentType: att.mime,
        })),
      };

      const info = await transporter.sendMail(mailOptions);
      return info.messageId || `sent_${Date.now()}`;
    } catch (error) {
      throw error;
    }
  }

  async saveDraft(accountId: string, draft: Draft): Promise<string> {
    try {
      const client = this.getClient(accountId);
      const session = await client.getSession();
      const actualAccountId = session.primaryAccounts?.mail || Object.keys(session.accounts)[0] || accountId;
      const mailboxes = await client.getMailboxes(actualAccountId);
      const draftsMailbox = mailboxes.find((mb) => mb.role === 'drafts');

      if (!draftsMailbox) {
        throw new Error('Drafts mailbox not found');
      }

      const creds = getUserCredentials(accountId);
      if (!creds) {
        throw new Error('User credentials not found');
      }

      const from = [{ email: creds.email, name: creds.email.split('@')[0] }];
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
      const client = this.getClient(accountId);
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

      const client = this.getClient(accountId);
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
        const client = this.getClient(accountId);
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
