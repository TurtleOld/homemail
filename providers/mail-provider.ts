import type {
  Account,
  Folder,
  MessageListItem,
  MessageDetail,
  MessageThreadDetail,
  Draft,
  Attachment,
  MessageFilter,
  MessageSourceHandle,
} from '@/lib/types';

/**
 * Raised when a submission request may have reached the server but no
 * response was received.
 *
 * Retrying such a send could deliver the message twice, so callers must treat
 * the delivery result as unknown rather than as a normal failure.
 */
export class SendUnknownError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SendUnknownError';
  }
}

export interface MailProvider {
  getAccount(accountId: string): Promise<Account | null>;
  getFolders(accountId: string): Promise<Folder[]>;
  getMessages(
    accountId: string,
    folderId: string,
    options: {
      cursor?: string;
      limit?: number;
      q?: string;
      filter?: 'unread' | 'starred' | 'attachments';
      messageFilter?: MessageFilter;
    }
  ): Promise<{ messages: MessageListItem[]; nextCursor?: string }>;
  getMessage(accountId: string, messageId: string): Promise<MessageDetail | null>;
  // Exact server-provided RFC 822/MIME source of one message. Never
  // reconstructed from MessageDetail; the blob is resolved server-side
  // from the authenticated JMAP account, not accepted from the client.
  getMessageSource(accountId: string, messageId: string): Promise<MessageSourceHandle | null>;
  getThread(accountId: string, threadId: string, limit?: number): Promise<MessageThreadDetail | null>;
  updateMessageFlags(
    accountId: string,
    messageId: string,
    flags: Partial<{ unread: boolean; starred: boolean; important: boolean }>
  ): Promise<void>;
  bulkUpdateMessages(
    accountId: string,
    action: {
      ids: string[];
      action: 'markRead' | 'markUnread' | 'move' | 'delete' | 'spam' | 'star' | 'unstar' | 'markImportant' | 'unmarkImportant' | 'archive';
      payload?: { folderId?: string };
    }
  ): Promise<void>;
  sendMessage(
    accountId: string,
    message: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      html: string;
      attachments?: Array<{ filename: string; mime: string; data: Buffer }>;
      inReplyTo?: string;
      references?: string[];
      requestReadReceipt?: boolean;
    }
  ): Promise<string>;
  saveDraft(accountId: string, draft: Draft): Promise<string>;
  getDraft(accountId: string, draftId: string): Promise<Draft | null>;
  deleteDraft(accountId: string, draftId: string): Promise<void>;
  getAttachment(accountId: string, messageId: string, attachmentId: string): Promise<Attachment & { data: Buffer } | null>;
  createFolder(accountId: string, name: string, parentId?: string): Promise<Folder>;
  updateFolder?(accountId: string, folderId: string, updates: { name?: string; parentId?: string | null }): Promise<Folder>;
  deleteFolder(accountId: string, folderId: string): Promise<void>;
  subscribeToUpdates(
    accountId: string,
    callback: (event: { type: string; data: any }) => void
  ): () => void;
}
