import type { AutoSortRule, MessageListItem, MessageDetail, FilterGroup, FilterCondition } from './types';
import type { MailProvider } from '@/providers/mail-provider';

export async function checkMessageMatchesRule(
  message: MessageListItem | MessageDetail,
  rule: AutoSortRule,
  provider: MailProvider,
  accountId: string,
  folderId: string
): Promise<boolean> {
  if (!rule.enabled) {
    console.error('[apply-auto-sort-rules] Rule disabled:', rule.name);
    return false;
  }

  console.error('[apply-auto-sort-rules] Starting rule check:', {
    ruleName: rule.name,
    messageId: message.id,
    from: 'from' in message ? message.from.email : 'N/A',
    filterGroup: JSON.stringify(rule.filterGroup),
  });

  const matches = checkMessageMatchesFilterGroup(message, rule.filterGroup, provider, accountId, folderId);
  
  console.error('[apply-auto-sort-rules] Rule check result:', {
    ruleName: rule.name,
    messageId: message.id,
    from: 'from' in message ? message.from.email : 'N/A',
    matches,
  });
  return matches;
}

function checkMessageMatchesFilterGroup(
  message: MessageListItem | MessageDetail,
  group: FilterGroup,
  provider: MailProvider,
  accountId: string,
  folderId: string
): boolean {
  const conditionResults = group.conditions.map((condition) =>
    checkMessageMatchesCondition(message, condition)
  );

  let result: boolean;
  if (group.logic === 'AND') {
    result = conditionResults.every((r) => r);
  } else {
    result = conditionResults.some((r) => r);
  }

  if (group.groups) {
    const groupResults = group.groups.map((subGroup) =>
      checkMessageMatchesFilterGroup(message, subGroup, provider, accountId, folderId)
    );
    if (group.logic === 'AND') {
      result = result && groupResults.every((r) => r);
    } else {
      result = result || groupResults.some((r) => r);
    }
  }

  return result;
}

function checkMessageMatchesCondition(
  message: MessageListItem | MessageDetail,
  condition: FilterCondition
): boolean {
  const { field, operator, value } = condition;

  switch (field) {
    case 'from':
      const fromEmail = message.from.email;
      const fromName = message.from.name || '';
      const emailMatch = checkStringMatch(fromEmail, operator, value as string);
      const nameMatch = checkStringMatch(fromName, operator, value as string);
      const result = emailMatch || nameMatch;
      console.error('[apply-auto-sort-rules] Checking from condition:', {
        field,
        operator,
        value,
        fromEmail,
        fromName,
        emailMatch,
        nameMatch,
        result,
      });
      return result;
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
        const bodyText = message.body.text || message.body.html || '';
        return checkStringMatch(bodyText, operator, value as string);
      }
      if ('snippet' in message) {
        return checkStringMatch(message.snippet, operator, value as string);
      }
      return false;
    case 'date':
      const messageDate = message.date.getTime();
      if (operator === 'gte' || operator === 'gt') {
        const filterDate = typeof value === 'string' ? new Date(value).getTime() : (value as number);
        return operator === 'gte' ? messageDate >= filterDate : messageDate > filterDate;
      } else if (operator === 'lte' || operator === 'lt') {
        const filterDate = typeof value === 'string' ? new Date(value).getTime() : (value as number);
        return operator === 'lte' ? messageDate <= filterDate : messageDate < filterDate;
      }
      return false;
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
        const pattern = searchText.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`, 'i');
        const result = regex.test(text);
        console.error('[apply-auto-sort-rules] Pattern match:', {
          pattern: searchText,
          regex: regex.toString(),
          text,
          result,
        });
        return result;
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
  for (const action of rule.actions) {
    try {
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
        case 'addLabel':
          break;
        case 'autoArchive':
        case 'autoDelete':
        case 'forward':
        case 'notify':
          break;
      }
    } catch (error) {
      console.error(`[apply-auto-sort-rules] Error applying action ${action.type}:`, error);
    }
  }
}