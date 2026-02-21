import type { AutoSortRule, MessageListItem, MessageDetail, FilterGroup, FilterCondition } from './types';
import type { MailProvider } from '@/providers/mail-provider';

function isValidFilterGroup(group: FilterGroup | undefined | null): group is FilterGroup {
  return !!group && Array.isArray(group.conditions) && group.conditions.length > 0;
}

function hasBodyCondition(group: FilterGroup): boolean {
  if (group.conditions?.some((c) => c.field === 'body')) {
    return true;
  }
  if (group.groups) {
    return group.groups.some((g) => hasBodyCondition(g));
  }
  return false;
}

export async function checkMessageMatchesRule(
  message: MessageListItem | MessageDetail,
  rule: AutoSortRule,
  provider: MailProvider,
  accountId: string,
  folderId: string
): Promise<boolean> {
  if (!rule.enabled) {
    return false;
  }

  if (!isValidFilterGroup(rule.conditions)) {
    console.error('[apply-auto-sort-rules] Rule has invalid conditions:', rule.name);
    return false;
  }

  let messageToCheck: MessageListItem | MessageDetail = message;

  if (!('body' in message) && hasBodyCondition(rule.conditions)) {
    let fullMessage: MessageDetail | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries && !fullMessage; attempt++) {
      try {
        const delay = 200 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));

        fullMessage = await provider.getMessage(accountId, message.id);
        if (fullMessage) {
          messageToCheck = fullMessage;
        }
      } catch (error) {
        console.error('[apply-auto-sort-rules] Error loading full message (attempt ' + (attempt + 1) + '):', error);
        if (error instanceof Error && error.message.includes('Too Many Requests')) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  }

  return checkMessageMatchesFilterGroup(messageToCheck, rule.conditions, provider, accountId, folderId);
}

async function checkMessageMatchesFilterGroup(
  message: MessageListItem | MessageDetail,
  group: FilterGroup,
  provider: MailProvider,
  accountId: string,
  folderId: string
): Promise<boolean> {
  if (!isValidFilterGroup(group)) {
    return false;
  }

  const conditionResults = await Promise.all(
    group.conditions.map((condition) => checkMessageMatchesCondition(message, condition))
  );

  let result: boolean;
  if (group.logic === 'AND') {
    result = conditionResults.every((r) => r);
  } else {
    result = conditionResults.some((r) => r);
  }

  if (group.groups) {
    const groupResults = await Promise.all(
      group.groups.map((subGroup) =>
        checkMessageMatchesFilterGroup(message, subGroup, provider, accountId, folderId)
      )
    );
    if (group.logic === 'AND') {
      result = result && groupResults.every((r) => r);
    } else {
      result = result || groupResults.some((r) => r);
    }
  }

  return result;
}

async function checkMessageMatchesCondition(
  message: MessageListItem | MessageDetail,
  condition: FilterCondition
): Promise<boolean> {
  const { field, operator, value } = condition;

  switch (field) {
    case 'from': {
      const fromEmail = message.from.email;
      const fromName = message.from.name || '';
      return checkStringMatch(fromEmail, operator, value as string) ||
        checkStringMatch(fromName, operator, value as string);
    }
    case 'to':
      if ('to' in message) {
        return message.to.some((t) =>
          checkStringMatch(t.email, operator, value as string) ||
          checkStringMatch(t.name || '', operator, value as string)
        );
      }
      return false;
    case 'subject':
      return checkStringMatch(message.subject, operator, value as string);
    case 'body':
      if ('body' in message) {
        let bodyText = message.body.text || '';

        if (!bodyText && message.body.html) {
          bodyText = message.body.html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }

        if (bodyText) {
          return checkStringMatch(bodyText, operator, value as string);
        }
      }
      if ('snippet' in message) {
        return checkStringMatch(message.snippet, operator, value as string);
      }
      return false;
    case 'date': {
      const messageDateObj = message.date instanceof Date ? message.date : new Date(message.date);
      const messageDate = messageDateObj.getTime();
      if (operator === 'gte' || operator === 'gt') {
        const filterDate = typeof value === 'string' ? new Date(value).getTime() : (value as number);
        return operator === 'gte' ? messageDate >= filterDate : messageDate > filterDate;
      } else if (operator === 'lte' || operator === 'lt') {
        const filterDate = typeof value === 'string' ? new Date(value).getTime() : (value as number);
        return operator === 'lte' ? messageDate <= filterDate : messageDate < filterDate;
      }
      return false;
    }
    case 'size':
      if ('size' in message) {
        const messageSize = message.size;
        if (operator === 'gt' || operator === 'gte') {
          const filterSize = typeof value === 'number' ? value : parseInt(String(value), 10);
          return operator === 'gte' ? messageSize >= filterSize : messageSize > filterSize;
        } else if (operator === 'lt' || operator === 'lte') {
          const filterSize = typeof value === 'number' ? value : parseInt(String(value), 10);
          return operator === 'lte' ? messageSize <= filterSize : messageSize < filterSize;
        }
      }
      return false;
    case 'status':
      if ('flags' in message) {
        if (operator === 'equals' && value === 'unread') {
          return message.flags.unread;
        } else if (operator === 'equals' && value === 'read') {
          return !message.flags.unread;
        } else if (operator === 'equals' && value === 'starred') {
          return message.flags.starred;
        }
      }
      return false;
    default:
      return false;
  }
}

function checkStringMatch(text: string, operator: string, value: string | string[]): boolean {
  const searchText = Array.isArray(value) ? value.join(' ') : value;
  const lowerText = text.toLowerCase();
  const lowerValue = searchText.toLowerCase();

  switch (operator) {
    case 'equals':
      return lowerText === lowerValue;
    case 'contains':
      return lowerText.includes(lowerValue);
    case 'startsWith':
      return lowerText.startsWith(lowerValue);
    case 'endsWith':
      return lowerText.endsWith(lowerValue);
    case 'matches':
      try {
        // Escape all regex special chars first, then restore * as .* and ? as .
        const escaped = searchText.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
        const regex = new RegExp(`^${pattern}$`, 'i');
        return regex.test(text);
      } catch (error) {
        console.error('[apply-auto-sort-rules] Regex error:', error, { pattern: searchText, text });
        return false;
      }
    case 'in':
      if (Array.isArray(value)) {
        return value.some((v) => lowerText.includes(v.toLowerCase()));
      }
      return lowerText.includes(lowerValue);
    case 'notIn':
      if (Array.isArray(value)) {
        return !value.some((v) => lowerText.includes(v.toLowerCase()));
      }
      return !lowerText.includes(lowerValue);
    default:
      return false;
  }
}

export async function applyRuleActions(
  messageId: string,
  rule: AutoSortRule,
  provider: MailProvider,
  accountId: string
): Promise<void> {
  for (let i = 0; i < rule.actions.length; i++) {
    const action = rule.actions[i];
    try {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      switch (action.type) {
        case 'moveToFolder':
          await provider.bulkUpdateMessages(accountId, {
            ids: [messageId],
            action: 'move',
            payload: { folderId: action.folderId },
          });
          break;
        case 'markRead':
          await provider.updateMessageFlags(accountId, messageId, { unread: false });
          break;
        case 'markImportant':
          await provider.updateMessageFlags(accountId, messageId, { starred: true });
          break;
        case 'label':
          break;
        case 'autoArchive': {
          const message = await provider.getMessage(accountId, messageId);
          if (message) {
            const messageDate = new Date(message.date);
            const daysSinceMessage = Math.floor((Date.now() - messageDate.getTime()) / (1000 * 60 * 60 * 24));
            if (action.payload?.days && daysSinceMessage >= action.payload.days) {
              const folders = await provider.getFolders(accountId);
              const archiveFolder = folders.find((f) => f.role === 'trash' || f.name.toLowerCase().includes('archive'));
              if (archiveFolder) {
                await provider.bulkUpdateMessages(accountId, {
                  ids: [messageId],
                  action: 'move',
                  payload: { folderId: archiveFolder.id },
                });
              }
            }
          }
          break;
        }
        case 'autoDelete': {
          const message = await provider.getMessage(accountId, messageId);
          if (message) {
            const messageDate = new Date(message.date);
            const daysSinceMessage = Math.floor((Date.now() - messageDate.getTime()) / (1000 * 60 * 60 * 24));
            if (action.payload?.days && daysSinceMessage >= action.payload.days) {
              await provider.bulkUpdateMessages(accountId, {
                ids: [messageId],
                action: 'delete',
              });
            }
          }
          break;
        }
        case 'forward':
          break;
      }
    } catch (error) {
      console.error(`[apply-auto-sort-rules] Error applying action ${action.type}:`, error);
      if (error instanceof Error && error.message.includes('Too Many Requests')) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
}
