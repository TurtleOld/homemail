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
    console.error('[apply-auto-sort-rules] Rule disabled:', rule.name);
    return false;
  }

  if (!isValidFilterGroup(rule.conditions)) {
    console.error('[apply-auto-sort-rules] Rule has invalid conditions:', rule.name);
    return false;
  }

  console.error('[apply-auto-sort-rules] Starting rule check:', {
    ruleName: rule.name,
    messageId: message.id,
    from: 'from' in message ? message.from.email : 'N/A',
    filterGroup: JSON.stringify(rule.conditions),
  });

  let messageToCheck: MessageListItem | MessageDetail = message;
  
  if (!('body' in message) && hasBodyCondition(rule.conditions)) {
    // Retry logic for fetching full message
    let fullMessage: MessageDetail | null = null;
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries && !fullMessage; attempt++) {
      try {
        // Exponential backoff: 200ms, 400ms, 800ms
        const delay = 200 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        
        fullMessage = await provider.getMessage(accountId, message.id);
        if (fullMessage) {
          messageToCheck = fullMessage;
          console.error('[apply-auto-sort-rules] Loaded full message for body check:', {
            messageId: message.id,
            attempt: attempt + 1,
            hasText: !!fullMessage.body.text,
            hasHtml: !!fullMessage.body.html,
            textLength: fullMessage.body.text?.length || 0,
            htmlLength: fullMessage.body.html?.length || 0,
          });
        }
      } catch (error) {
        console.error('[apply-auto-sort-rules] Error loading full message (attempt ' + (attempt + 1) + '):', error);
        if (error instanceof Error && error.message.includes('Too Many Requests')) {
          // Wait longer on rate limit
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        // Continue to next retry instead of returning false
      }
    }
    
    // If still no full message, log but don't fail - use snippet for body check
    if (!fullMessage) {
      console.error('[apply-auto-sort-rules] Failed to load full message after retries, will use snippet if available');
    }
  }

  const matches = await checkMessageMatchesFilterGroup(messageToCheck, rule.conditions, provider, accountId, folderId);
  
  console.error('[apply-auto-sort-rules] Rule check result:', {
    ruleName: rule.name,
    messageId: message.id,
    from: 'from' in messageToCheck ? messageToCheck.from.email : 'N/A',
    matches,
  });
  return matches;
}

async function checkMessageMatchesFilterGroup(
  message: MessageListItem | MessageDetail,
  group: FilterGroup,
  provider: MailProvider,
  accountId: string,
  folderId: string
): Promise<boolean> {
  if (!isValidFilterGroup(group)) {
    console.error('[apply-auto-sort-rules] Invalid filter group:', group);
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
        // Try text body first, then HTML body (strip HTML tags), then fallback to snippet
        let bodyText = message.body.text || '';
        
        if (!bodyText && message.body.html) {
          // Strip HTML tags from HTML body
          bodyText = message.body.html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
            .replace(/<[^>]+>/g, ' ') // Remove HTML tags
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .trim();
        }
        
        console.error('[apply-auto-sort-rules] Body check:', {
          hasBody: 'body' in message,
          hasText: !!message.body.text,
          hasHtml: !!message.body.html,
          textLength: message.body.text?.length || 0,
          htmlLength: message.body.html?.length || 0,
          extractedLength: bodyText.length,
          operator,
          value,
          match: checkStringMatch(bodyText, operator, value as string),
        });
        
        if (bodyText) {
          return checkStringMatch(bodyText, operator, value as string);
        }
      }
      if ('snippet' in message) {
        console.error('[apply-auto-sort-rules] Using snippet as fallback:', {
          snippetLength: message.snippet.length,
          operator,
          value,
          match: checkStringMatch(message.snippet, operator, value as string),
        });
        return checkStringMatch(message.snippet, operator, value as string);
      }
      console.error('[apply-auto-sort-rules] No body or snippet available for body check');
      return false;
    case 'date':
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