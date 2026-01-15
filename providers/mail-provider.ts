import type {
  Account,
  Folder,
  MessageListItem,
  MessageDetail,
  Draft,
  Attachment,
  MessageFilter,
} from '@/lib/types';

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
  updateMessageFlags(
    accountId: string,
    messageId: string,
    flags: Partial<{ unread: boolean; starred: boolean }>
  ): Promise<void>;
  bulkUpdateMessages(
    accountId: string,
    action: {
      ids: string[];
      action: 'markRead' | 'markUnread' | 'move' | 'delete' | 'spam' | 'star' | 'unstar';
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
    }
  ): Promise<string>;
  saveDraft(accountId: string, draft: Draft): Promise<string>;
  getDraft(accountId: string, draftId: string): Promise<Draft | null>;
  getAttachment(accountId: string, messageId: string, attachmentId: string): Promise<Attachment & { data: Buffer } | null>;
  createFolder(accountId: string, name: string, parentId?: string): Promise<Folder>;
  deleteFolder(accountId: string, folderId: string): Promise<void>;
  subscribeToUpdates(
    accountId: string,
    callback: (event: { type: string; data: any }) => void
  ): () => void;
}
