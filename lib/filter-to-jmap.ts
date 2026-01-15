import type { FilterGroup, FilterCondition, QuickFilterType, SecurityFilter } from './types';

export interface JMAPEmailFilter {
  inMailbox?: string;
  text?: string;
  hasAttachment?: boolean;
  isUnread?: boolean;
  isFlagged?: boolean;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  header?: string[];
  after?: string;
  before?: string;
  minSize?: number;
  maxSize?: number;
}

export function convertFilterToJMAP(
  filterGroup?: FilterGroup,
  quickFilter?: QuickFilterType,
  securityFilter?: SecurityFilter,
  folderId?: string
): JMAPEmailFilter {
  const jmapFilter: JMAPEmailFilter = {};

  if (quickFilter) {
    applyQuickFilter(jmapFilter, quickFilter, folderId);
  }

  if (filterGroup) {
    applyFilterGroup(jmapFilter, filterGroup);
  }

  if (securityFilter) {
    applySecurityFilter(jmapFilter, securityFilter);
  }

  if (folderId && !jmapFilter.inMailbox) {
    jmapFilter.inMailbox = folderId;
  }

  console.error('[filter-to-jmap] Converting filter:', {
    filterGroup: filterGroup ? JSON.stringify(filterGroup) : undefined,
    quickFilter,
    securityFilter: securityFilter ? JSON.stringify(securityFilter) : undefined,
    folderId,
  });
  console.error('[filter-to-jmap] Converted filter:', JSON.stringify(jmapFilter, null, 2));
  return jmapFilter;
}

function applyQuickFilter(filter: JMAPEmailFilter, quickFilter: QuickFilterType, folderId?: string): void {
  switch (quickFilter) {
    case 'unread':
      filter.isUnread = true;
      break;
    case 'read':
      filter.isUnread = false;
      break;
    case 'hasAttachments':
      filter.hasAttachment = true;
      break;
    case 'attachmentsImages':
      filter.hasAttachment = true;
      break;
    case 'attachmentsDocuments':
      filter.hasAttachment = true;
      break;
    case 'attachmentsArchives':
      filter.hasAttachment = true;
      break;
    case 'starred':
      filter.isFlagged = true;
      break;
    case 'important':
      filter.isFlagged = true;
      break;
    case 'drafts':
      break;
    case 'sent':
      break;
    case 'incoming':
      break;
    case 'bounce':
      filter.text = 'bounce delivery-status notification';
      break;
    case 'bulk':
      filter.text = 'List-Id Precedence: bulk unsubscribe';
      break;
  }
}

function applyFilterGroup(filter: JMAPEmailFilter, group: FilterGroup): void {
  for (const condition of group.conditions) {
    applyCondition(filter, condition);
  }

  if (group.groups) {
    for (const subGroup of group.groups) {
      applyFilterGroup(filter, subGroup);
    }
  }
}

function applyCondition(filter: JMAPEmailFilter, condition: FilterCondition): void {
  const { field, operator, value } = condition;

  switch (field) {
    case 'from':
      if (operator === 'contains' || operator === 'equals') {
        filter.from = typeof value === 'string' ? value : String(value);
      }
      break;
    case 'to':
      if (operator === 'contains' || operator === 'equals') {
        filter.to = typeof value === 'string' ? value : String(value);
      }
      break;
    case 'cc':
      if (operator === 'contains' || operator === 'equals') {
        filter.cc = typeof value === 'string' ? value : String(value);
      }
      break;
    case 'bcc':
      if (operator === 'contains' || operator === 'equals') {
        filter.bcc = typeof value === 'string' ? value : String(value);
      }
      break;
    case 'subject':
      if (operator === 'contains' || operator === 'equals') {
        if (!filter.subject) {
          filter.subject = typeof value === 'string' ? value : String(value);
        } else {
          filter.subject = `${filter.subject} ${value}`;
        }
      }
      break;
    case 'body':
      if (operator === 'contains' || operator === 'equals') {
        if (!filter.text) {
          filter.text = typeof value === 'string' ? value : String(value);
        } else {
          filter.text = `${filter.text} ${value}`;
        }
      }
      break;
    case 'date':
      if (operator === 'gte' || operator === 'gt') {
        if (typeof value === 'string') {
          filter.after = value;
        } else if (value instanceof Date) {
          filter.after = value.toISOString();
        } else if (typeof value === 'number') {
          filter.after = new Date(value).toISOString();
        }
      } else if (operator === 'lte' || operator === 'lt') {
        if (typeof value === 'string') {
          filter.before = value;
        } else if (value instanceof Date) {
          filter.before = value.toISOString();
        } else if (typeof value === 'number') {
          filter.before = new Date(value).toISOString();
        }
      }
      break;
    case 'size':
      if (operator === 'gt' || operator === 'gte') {
        filter.minSize = typeof value === 'number' ? value : parseInt(String(value), 10);
      } else if (operator === 'lt' || operator === 'lte') {
        filter.maxSize = typeof value === 'number' ? value : parseInt(String(value), 10);
      } else if (operator === 'between' && typeof value === 'object' && 'from' in value && 'to' in value) {
        filter.minSize = typeof value.from === 'number' ? value.from : parseInt(String(value.from), 10);
        filter.maxSize = typeof value.to === 'number' ? value.to : parseInt(String(value.to), 10);
      }
      break;
    case 'folder':
      if (operator === 'equals' && typeof value === 'string') {
        filter.inMailbox = value;
      }
      break;
  }
}

function applySecurityFilter(filter: JMAPEmailFilter, securityFilter: SecurityFilter): void {
  filter.header = filter.header || [];

  if (securityFilter.spf) {
    filter.header.push(`Authentication-Results: spf=${securityFilter.spf}`);
  }
  if (securityFilter.dkim) {
    filter.header.push(`Authentication-Results: dkim=${securityFilter.dkim}`);
  }
  if (securityFilter.dmarc) {
    filter.header.push(`Authentication-Results: dmarc=${securityFilter.dmarc}`);
  }
  if (securityFilter.dangerousAttachments) {
    filter.header.push('X-Dangerous-Attachment: true');
  }
}