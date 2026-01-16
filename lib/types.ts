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
  important: boolean;
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
  action: 'markRead' | 'markUnread' | 'move' | 'delete' | 'spam' | 'star' | 'unstar' | 'markImportant' | 'unmarkImportant';
  payload?: {
    folderId?: string;
  };
};

export type QuickFilterType =
  | 'unread'
  | 'read'
  | 'hasAttachments'
  | 'attachmentsImages'
  | 'attachmentsDocuments'
  | 'attachmentsArchives'
  | 'starred'
  | 'important'
  | 'drafts'
  | 'sent'
  | 'incoming'
  | 'bounce'
  | 'bulk';

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
  | 'status';

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
  updatedAt: Date;
};

export type AutoSortRule = {
  id: string;
  name: string;
  enabled: boolean;
  filterGroup: FilterGroup;
  actions: AutoSortAction[];
  applyToExisting?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AutoSortAction =
  | { type: 'moveToFolder'; folderId: string }
  | { type: 'addLabel'; label: string }
  | { type: 'markRead' }
  | { type: 'markImportant' }
  | { type: 'autoArchive'; days: number }
  | { type: 'autoDelete'; days: number }
  | { type: 'forward'; email: string }
  | { type: 'notify'; service: 'telegram' | 'matrix'; target: string };

export type SecurityFilter = {
  spf?: 'pass' | 'fail' | 'none';
  dkim?: 'pass' | 'fail' | 'none';
  dmarc?: 'pass' | 'fail' | 'none';
  externalDomain?: boolean;
  suspiciousDomain?: boolean;
  dangerousAttachments?: boolean;
};

export type MessageFilter = {
  quickFilter?: QuickFilterType;
  filterGroup?: FilterGroup;
  securityFilter?: SecurityFilter;
  savedFilterId?: string;
};
