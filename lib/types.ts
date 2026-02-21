export type Account = {
  id: string;
  email: string;
  displayName: string;
};

export type Contact = {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  notes?: string;
  groups?: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ContactGroup = {
  id: string;
  name: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type FolderRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'custom';

export type Folder = {
  id: string;
  name: string;
  role: FolderRole;
  unreadCount: number;
  parentId?: string;
  color?: string;
};

export type Label = {
  id: string;
  name: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageFlags = {
  unread: boolean;
  starred: boolean;
  important: boolean;
  hasAttachments: boolean;
};

export type MessageListItem = {
  id: string;
  threadId?: string;
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  subject: string;
  snippet: string;
  date: Date;
  flags: MessageFlags;
  labels?: string[];
  size: number;
};

export type MessageDetail = {
  id: string;
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  subject: string;
  date: Date;
  body: { html?: string; text?: string };
  attachments: Attachment[];
  flags: MessageFlags;
  labels?: string[];
  replyTo?: Array<{ email: string; name?: string }>;
  inReplyTo?: string;
  references?: string[];
  messageId?: string;
};

export type Attachment = {
  id: string;
  filename: string;
  mime: string;
  size: number;
};

export type Draft = {
  id?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; mime: string; data: Buffer }>;
};

export type QuickFilterType =
  | 'unread'
  | 'read'
  | 'starred'
  | 'important'
  | 'drafts'
  | 'sent'
  | 'incoming'
  | 'bounce'
  | 'bulk'
  | 'hasAttachments'
  | 'attachmentsImages'
  | 'attachmentsDocuments'
  | 'attachmentsArchives';

export type FilterField =
  | 'from'
  | 'to'
  | 'cc'
  | 'bcc'
  | 'subject'
  | 'body'
  | 'date'
  | 'folder'
  | 'tags'
  | 'size'
  | 'messageId'
  | 'status'
  | 'attachment'
  | 'filename';

export type FilterOperator = 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'notIn';

export type FilterCondition = {
  field: FilterField;
  operator: FilterOperator;
  value: string | number | string[] | { from: Date | string; to: Date | string };
  caseSensitive?: boolean;
};

export type FilterLogic = 'AND' | 'OR';

export type FilterGroup = {
  logic: FilterLogic;
  conditions: FilterCondition[];
  groups?: FilterGroup[];
};

export type SavedFilter = {
  id: string;
  name: string;
  query: string;
  filterGroup?: FilterGroup;
  quickFilter?: QuickFilterType;
  isPinned?: boolean;
  createdAt: Date;
  updatedAt?: Date;
};

export type AutoSortRule = {
  id: string;
  name: string;
  enabled: boolean;
  conditions: FilterGroup;
  actions: Array<{
    type: 'move' | 'moveToFolder' | 'label' | 'markRead' | 'markImportant' | 'delete' | 'forward' | 'autoReply' | 'autoArchive' | 'autoDelete';
    folderId?: string;
    payload?: { folderId?: string; labelIds?: string[]; email?: string; templateId?: string; days?: number };
  }>;
  priority: number;
  applyToExisting?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SieveScript = {
  id: string;
  name: string | null;
  blobId?: string;
  isActive: boolean;
  content?: string;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  category?: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type EmailSubscription = {
  id: string;
  senderEmail: string;
  senderName?: string;
  category?: string;
  unsubscribeUrl?: string;
  listUnsubscribe?: string;
  lastMessageDate: Date;
  messageCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export type DeliveryTracking = {
  messageId: string;
  status: DeliveryStatus;
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  recipients: Array<{
    email: string;
    status: DeliveryStatus;
    deliveredAt?: Date;
    readAt?: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

export type PGPKey = {
  id: string;
  email: string;
  name?: string;
  publicKey: string;
  privateKey?: string;
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageFilter = {
  filterGroup?: FilterGroup;
  quickFilter?: QuickFilterType;
  securityFilter?: any;
};
