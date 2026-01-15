import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilterRule, FilterGroup, FilterCondition, MessageListItem } from '@/lib/types';
import { logger } from '@/lib/logger';

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : process.cwd());
const FILTERS_FILE = path.join(DATA_DIR, '.filters.json');
const filtersStore = new Map<string, FilterRule[]>();
let isLoaded = false;

async function loadFilters(): Promise<void> {
  if (isLoaded) {
    return;
  }
  isLoaded = true;

  try {
    const data = await fs.readFile(FILTERS_FILE, 'utf-8');
    const trimmed = data.trim();
    if (!trimmed) {
      return;
    }
    const parsed = JSON.parse(trimmed) as Record<string, FilterRule[]>;
    for (const [accountId, rules] of Object.entries(parsed)) {
      filtersStore.set(accountId, Array.isArray(rules) ? rules : []);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Failed to load filters:', error);
    }
  }
}

async function saveFilters(): Promise<void> {
  try {
    const data = Object.fromEntries(filtersStore);
    await fs.writeFile(FILTERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    logger.error('Failed to save filters:', error);
  }
}

export async function getFilterRules(accountId: string): Promise<FilterRule[]> {
  await loadFilters();
  return filtersStore.get(accountId) || [];
}

export async function saveFilterRule(accountId: string, rule: FilterRule): Promise<void> {
  await loadFilters();
  const existing = filtersStore.get(accountId) || [];
  const next = existing.filter((item) => item.id !== rule.id);
  next.push(rule);
  filtersStore.set(accountId, next);
  await saveFilters();
}

export async function deleteFilterRule(accountId: string, ruleId: string): Promise<void> {
  await loadFilters();
  const existing = filtersStore.get(accountId) || [];
  const next = existing.filter((item) => item.id !== ruleId);
  filtersStore.set(accountId, next);
  await saveFilters();
}

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

function toDate(value: string | number | boolean | undefined): Date | null {
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

  if (field === 'hasAttachments' || field === 'unread' || field === 'starred') {
    const expected = toBoolean(value);
    if (expected === null) {
      return false;
    }
    let actual = false;
    if (field === 'hasAttachments') {
      actual = message.flags.hasAttachments;
    } else if (field === 'unread') {
      actual = message.flags.unread;
    } else {
      actual = message.flags.starred;
    }
    return actual === expected;
  }

  if (field === 'size') {
    const expected = toNumber(value);
    if (expected === null) {
      return false;
    }
    if (operator === 'greaterThan') {
      return message.size > expected;
    }
    if (operator === 'lessThan') {
      return message.size < expected;
    }
    if (operator === 'equals') {
      return message.size === expected;
    }
    return false;
  }

  if (field === 'date') {
    const expected = toDate(value);
    if (!expected) {
      return false;
    }
    const timestamp = message.date.getTime();
    const expectedTimestamp = expected.getTime();
    if (operator === 'before') {
      return timestamp < expectedTimestamp;
    }
    if (operator === 'after') {
      return timestamp > expectedTimestamp;
    }
    if (operator === 'equals') {
      return timestamp === expectedTimestamp;
    }
    return false;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const target = field === 'subject'
    ? message.subject || ''
    : field === 'snippet'
      ? message.snippet || ''
      : field === 'text'
        ? `${message.from.name || ''} ${message.from.email || ''} ${message.subject || ''} ${message.snippet || ''}`
        : message.from.email || '';
  const candidates = field === 'from'
    ? [message.from.email || '', message.from.name || ''].filter(Boolean)
    : [target];

  return candidates.some((text) => {
    const normalizedText = normalizeValue(text, caseSensitive);
    const normalizedValue = normalizeValue(value, caseSensitive);
    if (operator === 'contains') {
      return normalizedText.includes(normalizedValue);
    }
    if (operator === 'equals') {
      return normalizedText === normalizedValue;
    }
    return matchPattern(text, value, caseSensitive);
  });
}

export function matchFilterGroup(message: MessageListItem, group: FilterGroup): boolean {
  if (!group.conditions || group.conditions.length === 0) {
    return false;
  }

  const results = group.conditions.map((condition) => matchCondition(message, condition));
  return group.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

export function applyRulesToMessages(
  messages: MessageListItem[],
  rules: FilterRule[],
  sourceFolderId?: string
): { remaining: MessageListItem[]; moves: Record<string, string[]>; total: number; applied: number } {
  const moves: Record<string, string[]> = {};
  const remaining: MessageListItem[] = [];
  let applied = 0;

  for (const message of messages) {
    const matchedRule = rules.find((rule) => matchFilterGroup(message, rule.filterGroup));
    if (matchedRule?.folderId && matchedRule.folderId !== sourceFolderId) {
      if (!moves[matchedRule.folderId]) {
        moves[matchedRule.folderId] = [];
      }
      moves[matchedRule.folderId].push(message.id);
      applied += 1;
    } else {
      remaining.push(message);
    }
  }

  return { remaining, moves, total: messages.length, applied };
}
