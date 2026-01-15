import type { FilterGroup, FilterCondition, MessageListItem, AutoSortRule } from '@/lib/types';

function normalizeValue(value: string, caseSensitive?: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}

function toBoolean(value: string | number | boolean | undefined): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function toNumber(value: string | number | boolean | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value: string | number | boolean | Date | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function matchPattern(text: string, pattern: string, caseSensitive?: boolean): boolean {
  const escaped = escapeRegExp(pattern)
    .replaceAll(String.raw`\*`, '.*')
    .replaceAll(String.raw`\?`, '.');
  const flags = caseSensitive ? '' : 'i';
  const regex = new RegExp(`^${escaped}$`, flags);
  return regex.test(text);
}

function matchCondition(message: MessageListItem, condition: FilterCondition): boolean {
  const { field, operator, value, caseSensitive } = condition;

  if (field === 'status') {
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (normalized === 'unread' || normalized === 'read') {
        const isUnread = normalized === 'unread';
        return message.flags.unread === isUnread;
      }
      if (normalized === 'starred' || normalized === 'important') {
        return message.flags.starred === true;
      }
      if (normalized === 'hasattachments' || normalized === 'has attachments') {
        return message.flags.hasAttachments === true;
      }
    }
    if (Array.isArray(value)) {
      return value.some((v) => {
        if (typeof v === 'string') {
          const normalized = v.toLowerCase();
          if (normalized === 'unread') return message.flags.unread;
          if (normalized === 'read') return !message.flags.unread;
          if (normalized === 'starred' || normalized === 'important') return message.flags.starred;
          if (normalized === 'hasattachments' || normalized === 'has attachments') return message.flags.hasAttachments;
        }
        return false;
      });
    }
    return false;
  }

  if (field === 'size') {
    if (typeof value === 'number') {
      if (operator === 'gt') {
        return message.size > value;
      }
      if (operator === 'gte') {
        return message.size >= value;
      }
      if (operator === 'lt') {
        return message.size < value;
      }
      if (operator === 'lte') {
        return message.size <= value;
      }
      if (operator === 'equals') {
        return message.size === value;
      }
    }
    if (typeof value === 'string') {
      const expected = toNumber(value);
      if (expected === null) {
        return false;
      }
      if (operator === 'gt') {
        return message.size > expected;
      }
      if (operator === 'gte') {
        return message.size >= expected;
      }
      if (operator === 'lt') {
        return message.size < expected;
      }
      if (operator === 'lte') {
        return message.size <= expected;
      }
      if (operator === 'equals') {
        return message.size === expected;
      }
    }
    return false;
  }

  if (field === 'date') {
    if (operator === 'between' && typeof value === 'object' && 'from' in value && 'to' in value) {
      const from = toDate(value.from);
      const to = toDate(value.to);
      if (from && to) {
        const timestamp = message.date.getTime();
        return timestamp >= from.getTime() && timestamp <= to.getTime();
      }
      return false;
    }
    const expected = typeof value === 'string' || typeof value === 'number' ? toDate(value) : null;
    if (!expected) {
      return false;
    }
    const timestamp = message.date.getTime();
    const expectedTimestamp = expected.getTime();
    if (operator === 'lt') {
      return timestamp < expectedTimestamp;
    }
    if (operator === 'gt') {
      return timestamp > expectedTimestamp;
    }
    if (operator === 'equals') {
      return timestamp === expectedTimestamp;
    }
    return false;
  }

  if (typeof value !== 'string' && !Array.isArray(value)) {
    return false;
  }

  const target = field === 'subject'
    ? message.subject || ''
    : field === 'body'
      ? `${message.from.name || ''} ${message.from.email || ''} ${message.subject || ''} ${message.snippet || ''}`
      : message.from.email || '';
  const candidates = field === 'from'
    ? [message.from.email || '', message.from.name || ''].filter(Boolean)
    : [target];

  if (Array.isArray(value)) {
    return candidates.some((text) => {
      const normalizedText = normalizeValue(text, caseSensitive);
      return value.some((v) => {
        if (typeof v !== 'string') return false;
        const normalizedValue = normalizeValue(v, caseSensitive);
        if (operator === 'in') {
          return normalizedText.includes(normalizedValue) || normalizedValue.includes(normalizedText);
        }
        if (operator === 'notIn') {
          return !normalizedText.includes(normalizedValue) && !normalizedValue.includes(normalizedText);
        }
        return false;
      });
    });
  }

  return candidates.some((text) => {
    const normalizedText = normalizeValue(text, caseSensitive);
    const normalizedValue = normalizeValue(value, caseSensitive);
    if (operator === 'contains') {
      return normalizedText.includes(normalizedValue);
    }
    if (operator === 'equals') {
      return normalizedText === normalizedValue;
    }
    if (operator === 'startsWith') {
      return normalizedText.startsWith(normalizedValue);
    }
    if (operator === 'endsWith') {
      return normalizedText.endsWith(normalizedValue);
    }
    if (operator === 'matches') {
      return matchPattern(text, value, caseSensitive);
    }
    return false;
  });
}

export function matchFilterGroup(message: MessageListItem, group: FilterGroup): boolean {
  if (!group.conditions || group.conditions.length === 0) {
    if (!group.groups || group.groups.length === 0) {
      return false;
    }
  }

  const conditionResults = (group.conditions || []).map((condition) => matchCondition(message, condition));
  const groupResults = (group.groups || []).map((subGroup) => matchFilterGroup(message, subGroup));
  const allResults = [...conditionResults, ...groupResults];

  if (allResults.length === 0) {
    return false;
  }

  return group.logic === 'OR' ? allResults.some(Boolean) : allResults.every(Boolean);
}

export function applyRulesToMessages(
  messages: MessageListItem[],
  rules: AutoSortRule[],
  sourceFolderId?: string
): { remaining: MessageListItem[]; moves: Record<string, string[]>; total: number; applied: number } {
  const moves: Record<string, string[]> = {};
  const remaining: MessageListItem[] = [];
  let applied = 0;

  const enabledRules = rules.filter((rule) => rule.enabled);

  for (const message of messages) {
    const matchedRule = enabledRules.find((rule) => matchFilterGroup(message, rule.filterGroup));
    if (matchedRule) {
      const moveAction = matchedRule.actions.find((action) => action.type === 'moveToFolder');
      if (moveAction && moveAction.type === 'moveToFolder' && moveAction.folderId !== sourceFolderId) {
        if (!moves[moveAction.folderId]) {
          moves[moveAction.folderId] = [];
        }
        moves[moveAction.folderId].push(message.id);
        applied += 1;
      } else {
        remaining.push(message);
      }
    } else {
      remaining.push(message);
    }
  }

  return { remaining, moves, total: messages.length, applied };
}
