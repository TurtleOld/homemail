export type Account = {
  id: string;
  email: string;
  displayName: string;
};

export type FolderRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'custom';

export type Folder = {
  id: string;
  name: string;
  role: FolderRole;
  unreadCount: number;
};

export type MessageFlags = {
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
};

export type MessageListItem = {
  id: string;
  threadId: string;
  from: { email: string; name?: string };
  subject: string;
  snippet: string;
  date: Date;
  flags: MessageFlags;
  size: number;
};

export type Attachment = {
  id: string;
  filename: string;
  mime: string;
  size: number;
};

export type MessageDetail = {
  id: string;
  threadId: string;
  headers: Record<string, string>;
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  subject: string;
  date: Date;
  body: {
    text?: string;
    html?: string;
  };
  attachments: Attachment[];
  flags: MessageFlags;
};

export type Draft = {
  id?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  html?: string;
  lastSavedAt?: Date;
};

export type BulkAction = {
  ids: string[];
  action: 'markRead' | 'markUnread' | 'move' | 'delete' | 'spam' | 'star' | 'unstar';
  payload?: {
    folderId?: string;
  };
};
