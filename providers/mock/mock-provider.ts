import type { MailProvider } from '../mail-provider';
import type {
  Account,
  Folder,
  MessageListItem,
  MessageDetail,
  Draft,
  Attachment,
} from '@/lib/types';
import { generateMockData } from './data-generator';

const MOCK_ACCOUNTS = new Map<string, Account>();
const MOCK_FOLDERS = new Map<string, Folder[]>();
const MOCK_MESSAGES = new Map<string, Map<string, MessageDetail>>();
const MOCK_DRAFTS = new Map<string, Map<string, Draft>>();
const MOCK_ATTACHMENTS = new Map<string, Buffer>();

const subscribers = new Map<string, Set<(event: { type: string; data: any }) => void>>();

const SEED_SIZE = parseInt(process.env.NEXT_PUBLIC_SEED_SIZE || '10000', 10);
const SEED = process.env.NEXT_PUBLIC_SEED || 'default';

let initialized = false;

function initializeAccount(accountId: string, email: string) {
  if (MOCK_ACCOUNTS.has(accountId)) {
    return;
  }

  const account: Account = {
    id: accountId,
    email,
    displayName: email.split('@')[0],
  };

  MOCK_ACCOUNTS.set(accountId, account);

  const folders: Folder[] = [
    { id: 'inbox', name: 'Входящие', role: 'inbox', unreadCount: 0 },
    { id: 'sent', name: 'Отправленные', role: 'sent', unreadCount: 0 },
    { id: 'drafts', name: 'Черновики', role: 'drafts', unreadCount: 0 },
    { id: 'trash', name: 'Корзина', role: 'trash', unreadCount: 0 },
    { id: 'spam', name: 'Спам', role: 'spam', unreadCount: 0 },
  ];

  MOCK_FOLDERS.set(accountId, folders);

  const messages = generateMockData(SEED_SIZE, SEED, email);
  const messageMap = new Map<string, MessageDetail>();

  for (const msg of messages) {
    messageMap.set(msg.id, msg);
  }

  MOCK_MESSAGES.set(accountId, messageMap);
  MOCK_DRAFTS.set(accountId, new Map());

  const inboxMessages = Array.from(messageMap.values()).filter((m) => {
    const folder = folders.find((f) => f.role === 'inbox');
    return folder && m.id.startsWith('inbox_');
  });

  const inboxFolder = folders.find((f) => f.role === 'inbox');
  if (inboxFolder) {
    inboxFolder.unreadCount = inboxMessages.filter((m) => m.flags.unread).length;
  }
}

export class MockMailProvider implements MailProvider {
  async getAccount(accountId: string): Promise<Account | null> {
    return MOCK_ACCOUNTS.get(accountId) || null;
  }

  async getFolders(accountId: string): Promise<Folder[]> {
    if (!MOCK_ACCOUNTS.has(accountId)) {
      return [];
    }
    return MOCK_FOLDERS.get(accountId) || [];
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
    const messageMap = MOCK_MESSAGES.get(accountId);
    if (!messageMap) {
      return { messages: [] };
    }

    let allMessages = Array.from(messageMap.values());

    const folder = (MOCK_FOLDERS.get(accountId) || []).find((f) => f.id === folderId);
    if (folder) {
      allMessages = allMessages.filter((m) => {
        if (folder.role === 'inbox') return m.id.startsWith('inbox_');
        if (folder.role === 'sent') return m.id.startsWith('sent_');
        if (folder.role === 'drafts') return m.id.startsWith('draft_');
        if (folder.role === 'trash') return m.id.startsWith('trash_');
        if (folder.role === 'spam') return m.id.startsWith('spam_');
        return false;
      });
    }

    if (options.filter === 'unread') {
      allMessages = allMessages.filter((m) => m.flags.unread);
    } else if (options.filter === 'starred') {
      allMessages = allMessages.filter((m) => m.flags.starred);
    } else if (options.filter === 'attachments') {
      allMessages = allMessages.filter((m) => m.attachments.length > 0);
    }

    if (options.q) {
      const query = options.q.toLowerCase();
      allMessages = allMessages.filter(
        (m) =>
          m.subject.toLowerCase().includes(query) ||
          m.from.email.toLowerCase().includes(query) ||
          m.body.text?.toLowerCase().includes(query) ||
          m.body.html?.toLowerCase().includes(query)
      );
    }

    allMessages.sort((a, b) => b.date.getTime() - a.date.getTime());

    const limit = options.limit || 50;
    let startIndex = 0;

    if (options.cursor) {
      const cursorData = JSON.parse(Buffer.from(options.cursor, 'base64').toString('utf-8'));
      startIndex = cursorData.page * cursorData.pageSize;
    }

    const paginatedMessages = allMessages.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < allMessages.length;

    const listItems: MessageListItem[] = paginatedMessages.map((msg) => ({
      id: msg.id,
      threadId: msg.threadId,
      from: msg.from,
      subject: msg.subject,
      snippet: msg.body.text?.substring(0, 100) || msg.body.html?.replace(/<[^>]*>/g, '').substring(0, 100) || '',
      date: msg.date,
      flags: msg.flags,
      size: JSON.stringify(msg).length,
    }));

    let nextCursor: string | undefined;
    if (hasMore) {
      const nextPage = Math.floor((startIndex + limit) / limit);
      nextCursor = Buffer.from(JSON.stringify({ page: nextPage, pageSize: limit })).toString('base64');
    }

    return { messages: listItems, nextCursor };
  }

  async getMessage(accountId: string, messageId: string): Promise<MessageDetail | null> {
    const messageMap = MOCK_MESSAGES.get(accountId);
    if (!messageMap) {
      return null;
    }
    return messageMap.get(messageId) || null;
  }

  async updateMessageFlags(
    accountId: string,
    messageId: string,
    flags: Partial<{ unread: boolean; starred: boolean }>
  ): Promise<void> {
    const messageMap = MOCK_MESSAGES.get(accountId);
    if (!messageMap) {
      return;
    }

    const message = messageMap.get(messageId);
    if (!message) {
      return;
    }

    if (flags.unread !== undefined) {
      message.flags.unread = flags.unread;
    }
    if (flags.starred !== undefined) {
      message.flags.starred = flags.starred;
    }

    this.notifySubscribers(accountId, {
      type: 'message.updated',
      data: { messageId, flags: message.flags },
    });
  }

  async bulkUpdateMessages(
    accountId: string,
    action: {
      ids: string[];
      action: 'markRead' | 'markUnread' | 'move' | 'delete' | 'spam' | 'star' | 'unstar';
      payload?: { folderId?: string };
    }
  ): Promise<void> {
    const messageMap = MOCK_MESSAGES.get(accountId);
    if (!messageMap) {
      return;
    }

    for (const id of action.ids) {
      const message = messageMap.get(id);
      if (!message) continue;

      switch (action.action) {
        case 'markRead':
          message.flags.unread = false;
          break;
        case 'markUnread':
          message.flags.unread = true;
          break;
        case 'star':
          message.flags.starred = true;
          break;
        case 'unstar':
          message.flags.starred = false;
          break;
        case 'delete':
          messageMap.delete(id);
          break;
        case 'spam':
          message.id = `spam_${message.id}`;
          break;
        case 'move':
          if (action.payload?.folderId) {
            const prefix = action.payload.folderId + '_';
            if (!message.id.startsWith(prefix)) {
              message.id = prefix + message.id.replace(/^[^_]+_/, '');
            }
          }
          break;
      }
    }

    this.notifySubscribers(accountId, {
      type: 'mailbox.counts',
      data: {},
    });
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
    const messageMap = MOCK_MESSAGES.get(accountId);
    if (!messageMap) {
      throw new Error('Account not found');
    }

    const account = MOCK_ACCOUNTS.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    const messageId = `sent_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const sentMessage: MessageDetail = {
      id: messageId,
      threadId: messageId,
      headers: {},
      from: { email: account.email, name: account.displayName },
      to: message.to.map((email) => ({ email })),
      cc: message.cc?.map((email) => ({ email })),
      bcc: message.bcc?.map((email) => ({ email })),
      subject: message.subject,
      date: new Date(),
      body: { html: message.html },
      attachments: (message.attachments || []).map((att, idx) => ({
        id: `${messageId}_att_${idx}`,
        filename: att.filename,
        mime: att.mime,
        size: att.data.length,
      })),
      flags: {
        unread: false,
        starred: false,
        hasAttachments: (message.attachments?.length || 0) > 0,
      },
    };

    messageMap.set(messageId, sentMessage);

    for (const att of message.attachments || []) {
      MOCK_ATTACHMENTS.set(`${messageId}_${att.filename}`, att.data);
    }

    return messageId;
  }

  async saveDraft(accountId: string, draft: Draft): Promise<string> {
    const draftsMap = MOCK_DRAFTS.get(accountId);
    if (!draftsMap) {
      throw new Error('Account not found');
    }

    const draftId = draft.id || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const fullDraft: Draft = {
      ...draft,
      id: draftId,
      lastSavedAt: new Date(),
    };

    draftsMap.set(draftId, fullDraft);

    const messageMap = MOCK_MESSAGES.get(accountId);
    if (messageMap) {
      const draftMessage: MessageDetail = {
        id: draftId,
        threadId: draftId,
        headers: {},
        from: { email: MOCK_ACCOUNTS.get(accountId)?.email || '' },
        to: draft.to?.map((email) => ({ email })) || [],
        cc: draft.cc?.map((email) => ({ email })),
        bcc: draft.bcc?.map((email) => ({ email })),
        subject: draft.subject || '(без темы)',
        date: fullDraft.lastSavedAt || new Date(),
        body: { html: draft.html },
        attachments: [],
        flags: {
          unread: false,
          starred: false,
          hasAttachments: false,
        },
      };
      messageMap.set(draftId, draftMessage);
    }

    return draftId;
  }

  async getDraft(accountId: string, draftId: string): Promise<Draft | null> {
    const draftsMap = MOCK_DRAFTS.get(accountId);
    if (!draftsMap) {
      return null;
    }
    return draftsMap.get(draftId) || null;
  }

  async getAttachment(
    accountId: string,
    messageId: string,
    attachmentId: string
  ): Promise<(Attachment & { data: Buffer }) | null> {
    const messageMap = MOCK_MESSAGES.get(accountId);
    if (!messageMap) {
      return null;
    }

    const message = messageMap.get(messageId);
    if (!message) {
      return null;
    }

    const attachment = message.attachments.find((att) => att.id === attachmentId);
    if (!attachment) {
      return null;
    }

    const data = MOCK_ATTACHMENTS.get(`${messageId}_${attachment.filename}`) || Buffer.from('mock attachment data');

    return {
      ...attachment,
      data,
    };
  }

  subscribeToUpdates(
    accountId: string,
    callback: (event: { type: string; data: any }) => void
  ): () => void {
    if (!subscribers.has(accountId)) {
      subscribers.set(accountId, new Set());
    }
    subscribers.get(accountId)!.add(callback);

    return () => {
      const callbacks = subscribers.get(accountId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          subscribers.delete(accountId);
        }
      }
    };
  }

  private notifySubscribers(accountId: string, event: { type: string; data: any }): void {
    const callbacks = subscribers.get(accountId);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(event);
        } catch (error) {
          console.error('Error in subscriber callback:', error);
        }
      }
    }
  }

  async simulateNewMessage(accountId: string): Promise<void> {
    const messageMap = MOCK_MESSAGES.get(accountId);
    if (!messageMap) {
      return;
    }

    const account = MOCK_ACCOUNTS.get(accountId);
    if (!account) {
      return;
    }

    const senders = [
      { email: 'sender1@example.com', name: 'Отправитель 1' },
      { email: 'sender2@example.com', name: 'Отправитель 2' },
      { email: 'sender3@example.com', name: 'Отправитель 3' },
    ];

    const sender = senders[Math.floor(Math.random() * senders.length)];
    const subjects = [
      'Новое важное сообщение',
      'Обновление по проекту',
      'Встреча завтра',
      'Отчет готов',
      'Вопрос по задаче',
    ];

    const messageId = `inbox_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const newMessage: MessageDetail = {
      id: messageId,
      threadId: messageId,
      headers: {},
      from: sender,
      to: [{ email: account.email }],
      subject: subjects[Math.floor(Math.random() * subjects.length)],
      date: new Date(),
      body: {
        text: 'Это новое тестовое сообщение, сгенерированное для демонстрации realtime обновлений.',
        html: '<p>Это новое тестовое сообщение, сгенерированное для демонстрации realtime обновлений.</p>',
      },
      attachments: [],
      flags: {
        unread: true,
        starred: false,
        hasAttachments: false,
      },
    };

    messageMap.set(messageId, newMessage);

    const folders = MOCK_FOLDERS.get(accountId);
    const inboxFolder = folders?.find((f) => f.role === 'inbox');
    if (inboxFolder) {
      inboxFolder.unreadCount += 1;
    }

    this.notifySubscribers(accountId, {
      type: 'message.new',
      data: { messageId },
    });

    this.notifySubscribers(accountId, {
      type: 'mailbox.counts',
      data: {},
    });
  }

  async createFolder(accountId: string, name: string, parentId?: string): Promise<Folder> {
    const folders = MOCK_FOLDERS.get(accountId) || [];
    const folderId = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    const newFolder: Folder = {
      id: folderId,
      name,
      role: 'custom',
      unreadCount: 0,
    };

    folders.push(newFolder);
    MOCK_FOLDERS.set(accountId, folders);

    this.notifySubscribers(accountId, {
      type: 'mailbox.counts',
      data: {},
    });

    return newFolder;
  }

  async deleteFolder(accountId: string, folderId: string): Promise<void> {
    const folders = MOCK_FOLDERS.get(accountId) || [];
    const folder = folders.find((f) => f.id === folderId);

    if (!folder) {
      throw new Error('Folder not found');
    }

    if (folder.role !== 'custom') {
      throw new Error('Cannot delete system folder');
    }

    const updatedFolders = folders.filter((f) => f.id !== folderId);
    MOCK_FOLDERS.set(accountId, updatedFolders);

    const messageMap = MOCK_MESSAGES.get(accountId);
    if (messageMap) {
      for (const [messageId, message] of messageMap.entries()) {
        if (messageId.startsWith(`${folderId}_`)) {
          messageMap.delete(messageId);
        }
      }
    }

    this.notifySubscribers(accountId, {
      type: 'mailbox.counts',
      data: {},
    });
  }
}

export function getMockProvider(): MockMailProvider {
  if (!initialized) {
    initialized = true;
  }
  return new MockMailProvider();
}

export function getOrCreateAccount(accountId: string, email: string): void {
  if (!MOCK_ACCOUNTS.has(accountId)) {
    initializeAccount(accountId, email);
  }
}
