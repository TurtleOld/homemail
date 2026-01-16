import type { MailProvider } from '../mail-provider';
import type { Account, Folder, MessageListItem, MessageDetail, Draft, Attachment } from '@/lib/types';

export class ImapMailProvider implements MailProvider {
  async getAccount(accountId: string): Promise<Account | null> {
    throw new Error('IMAP provider not implemented. See providers/imap/README.md for implementation guide.');
  }

  async getFolders(accountId: string): Promise<Folder[]> {
    throw new Error('IMAP provider not implemented');
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
    throw new Error('IMAP provider not implemented');
  }

  async getMessage(accountId: string, messageId: string): Promise<MessageDetail | null> {
    throw new Error('IMAP provider not implemented');
  }

  async updateMessageFlags(
    accountId: string,
    messageId: string,
    flags: Partial<{ unread: boolean; starred: boolean; important: boolean }>
  ): Promise<void> {
    throw new Error('IMAP provider not implemented');
  }

  async bulkUpdateMessages(
    accountId: string,
    action: {
      ids: string[];
      action: 'markRead' | 'markUnread' | 'move' | 'delete' | 'spam' | 'star' | 'unstar' | 'markImportant' | 'unmarkImportant';
      payload?: { folderId?: string };
    }
  ): Promise<void> {
    throw new Error('IMAP provider not implemented');
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
    throw new Error('IMAP provider not implemented');
  }

  async saveDraft(accountId: string, draft: Draft): Promise<string> {
    throw new Error('IMAP provider not implemented');
  }

  async getDraft(accountId: string, draftId: string): Promise<Draft | null> {
    throw new Error('IMAP provider not implemented');
  }

  async getAttachment(
    accountId: string,
    messageId: string,
    attachmentId: string
  ): Promise<(Attachment & { data: Buffer }) | null> {
    throw new Error('IMAP provider not implemented');
  }

  async createFolder(accountId: string, name: string, parentId?: string): Promise<Folder> {
    throw new Error('IMAP provider not implemented');
  }

  async deleteFolder(accountId: string, folderId: string): Promise<void> {
    throw new Error('IMAP provider not implemented');
  }

  subscribeToUpdates(
    accountId: string,
    callback: (event: { type: string; data: any }) => void
  ): () => void {
    throw new Error('IMAP provider not implemented');
  }
}
