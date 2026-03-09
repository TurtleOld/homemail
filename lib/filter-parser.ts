import type { FilterGroup, FilterCondition, FilterField, FilterOperator, QuickFilterType } from './types';

export class FilterQueryParser {
  private static readonly FIELD_PREFIXES: Record<string, FilterField> = {
    'from': 'from',
    'to': 'to',
    'cc': 'cc',
    'bcc': 'bcc',
    'subject': 'subject',
    'body': 'body',
    'date': 'date',
    'folder': 'folder',
    'tag': 'tags',
    'tags': 'tags',
    'size': 'size',
    'message-id': 'messageId',
    'messageid': 'messageId',
    'id': 'messageId',
    'attachment': 'attachment',
    'attachments': 'attachment',
    'filename': 'filename',
  };

  private static readonly QUICK_FILTERS: Record<string, QuickFilterType> = {
    'has:attachment': 'hasAttachments',
    'has:attachments': 'hasAttachments',
    'has:image': 'attachmentsImages',
    'has:images': 'attachmentsImages',
    'has:document': 'attachmentsDocuments',
    'has:documents': 'attachmentsDocuments',
    'has:archive': 'attachmentsArchives',
    'has:archives': 'attachmentsArchives',
    'is:unread': 'unread',
    'is:read': 'read',
    'is:starred': 'starred',
    'is:important': 'important',
    'is:draft': 'drafts',
    'is:sent': 'sent',
    'is:incoming': 'incoming',
    'is:bounce': 'bounce',
    'is:bulk': 'bulk',
  };

  static parse(query: string): { quickFilter?: QuickFilterType; filterGroup?: FilterGroup } {
    if (!query || !query.trim()) {
      return {};
    }

    const quickFilter = this.extractQuickFilter(query);
    const cleanedQuery = this.removeQuickFilters(query);
    const filterGroup = this.parseFilterGroup(cleanedQuery);

    return { quickFilter, filterGroup };
  }

  private static extractQuickFilter(query: string): QuickFilterType | undefined {
    const lowerQuery = query.toLowerCase();
    for (const [key, value] of Object.entries(this.QUICK_FILTERS)) {
      if (lowerQuery.includes(key)) {
        return value;
      }
    }
    return undefined;
  }

  private static removeQuickFilters(query: string): string {
    let cleaned = query;
    for (const key of Object.keys(this.QUICK_FILTERS)) {
      const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '').trim();
    }
    return cleaned;
  }

  private static parseFilterGroup(query: string): FilterGroup | undefined {
    if (!query || !query.trim()) {
      return undefined;
    }

    const tokens = this.tokenize(query);

    // Split tokens into OR-separated segments, then each segment is AND-joined
    const orSegments: FilterCondition[][] = [[]];
    let i = 0;

    while (i < tokens.length) {
      const upper = tokens[i].toUpperCase();
      if (upper === 'OR') {
        // Start a new OR segment
        orSegments.push([]);
        i++;
        continue;
      }
      if (upper === 'AND') {
        // Explicit AND — just skip, conditions within a segment are AND-joined
        i++;
        continue;
      }

      const condition = this.parseCondition(tokens, i);
      if (condition) {
        orSegments[orSegments.length - 1].push(condition.condition);
        i = condition.nextIndex;
      } else {
        i++;
      }
    }

    // Remove empty segments
    const validSegments = orSegments.filter((s) => s.length > 0);
    if (validSegments.length === 0) {
      return undefined;
    }

    // Single segment — all conditions are AND-joined
    if (validSegments.length === 1) {
      return {
        logic: 'AND',
        conditions: validSegments[0],
      };
    }

    // Multiple OR segments — create an OR group with sub-groups
    // If each segment has exactly one condition, flatten to a single OR group
    const allSingle = validSegments.every((s) => s.length === 1);
    if (allSingle) {
      return {
        logic: 'OR',
        conditions: validSegments.map((s) => s[0]),
      };
    }

    // Mixed: OR group with AND sub-groups
    return {
      logic: 'OR',
      conditions: [],
      groups: validSegments.map((seg) => ({
        logic: 'AND' as const,
        conditions: seg,
      })),
    };
  }

  private static tokenize(query: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let inField = false;

    for (let i = 0; i < query.length; i++) {
      const char = query[i];
      const nextChar = query[i + 1];

      if (char === '"' && (i === 0 || query[i - 1] !== '\\')) {
        if (inQuotes) {
          // End of quoted section
          if (inField) {
            // field:"quoted value" — keep building the token
            current += '"';
            inQuotes = false;
          } else {
            if (current.trim()) {
              tokens.push(current.trim());
              current = '';
            }
            inQuotes = false;
          }
        } else {
          // Start of quoted section
          if (inField) {
            // field:" — start quoted value within field token
            current += '"';
            inQuotes = true;
          } else {
            if (current.trim()) {
              tokens.push(current.trim());
              current = '';
            }
            inQuotes = true;
          }
        }
        continue;
      }

      if (inQuotes) {
        current += char;
        continue;
      }

      if (char === ':' && !inField && current.trim()) {
        const fieldName = current.trim().toLowerCase();
        if (this.FIELD_PREFIXES[fieldName] || fieldName === 'after' || fieldName === 'before') {
          current += ':';
          inField = true;
          continue;
        }
      }

      if ((char === ' ' || char === '\t') && inField && current.trim()) {
        tokens.push(current.trim());
        current = '';
        inField = false;
        continue;
      }

      if (inField) {
        current += char;
        continue;
      }

      if ((char === '-' || char === '!') && !inField && current.trim() && (nextChar === ' ' || i === query.length - 1)) {
        if (current.trim()) {
          tokens.push(current.trim());
          current = '';
        }
        tokens.push('-');
        continue;
      }

      if (char === ' ' && !inField && current.trim()) {
        tokens.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      tokens.push(current.trim());
    }

    return tokens.filter((t) => t.length > 0);
  }

  private static parseCondition(tokens: string[], startIndex: number): { condition: FilterCondition; nextIndex: number } | null {
    let i = startIndex;
    let negate = false;

    if (i < tokens.length && (tokens[i] === '-' || tokens[i] === '!')) {
      negate = true;
      i++;
    }

    if (i >= tokens.length) {
      return null;
    }

    const token = tokens[i];
    const fieldMatch = token.match(/^([a-z-]+):(.+)$/i);

    if (fieldMatch) {
      const fieldName = fieldMatch[1].toLowerCase();
      const value = fieldMatch[2];

      if (fieldName === 'after' || fieldName === 'before') {
        const date = this.parseDate(value);
        if (date) {
          return {
            condition: {
              field: 'date',
              operator: fieldName === 'after' ? 'gte' : 'lte',
              value: date.toISOString(),
            },
            nextIndex: i + 1,
          };
        }
      }

      const field = this.FIELD_PREFIXES[fieldName];
      if (field) {
        let cleanValue = value;
        if (value.startsWith('has:')) {
          cleanValue = value.substring(4);
        }
        const operator = this.detectOperator(cleanValue);
        const condition: FilterCondition = {
          field,
          operator: negate ? this.negateOperator(operator) : operator,
          value: this.parseValue(field, cleanValue, operator),
          caseSensitive: false,
        };

        return { condition, nextIndex: i + 1 };
      }
    }

    if (token.startsWith('"') && token.endsWith('"')) {
      const value = token.slice(1, -1);
      return {
        condition: {
          field: 'body',
          operator: negate ? 'notIn' : 'contains',
          value,
          caseSensitive: false,
        },
        nextIndex: i + 1,
      };
    }

    return {
      condition: {
        field: 'body',
        operator: negate ? 'notIn' : 'contains',
        value: token,
        caseSensitive: false,
      },
      nextIndex: i + 1,
    };
  }

  private static detectOperator(value: string): FilterOperator {
    if (value.startsWith('"') && value.endsWith('"')) {
      return 'equals';
    }
    if (value.includes('*')) {
      return 'matches';
    }
    return 'contains';
  }

  private static negateOperator(operator: FilterOperator): FilterOperator {
    const negations: Record<FilterOperator, FilterOperator> = {
      equals: 'notIn',
      contains: 'notIn',
      startsWith: 'notIn',
      endsWith: 'notIn',
      matches: 'notIn',
      gt: 'lte',
      gte: 'lt',
      lt: 'gte',
      lte: 'gt',
      between: 'notIn',
      in: 'notIn',
      notIn: 'in',
    };
    return negations[operator] || operator;
  }

  private static parseValue(field: FilterField, value: string, operator: FilterOperator): string | number | string[] {
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1);
    }

    if (field === 'size') {
      const sizeMatch = value.match(/^([><=]+)?\s*(\d+)([kmg]?b?)?$/i);
      if (sizeMatch) {
        const num = parseInt(sizeMatch[2], 10);
        const unit = (sizeMatch[3] || '').toLowerCase();
        let multiplier = 1;
        if (unit.includes('k')) multiplier = 1024;
        else if (unit.includes('m')) multiplier = 1024 * 1024;
        else if (unit.includes('g')) multiplier = 1024 * 1024 * 1024;
        return num * multiplier;
      }
    }

    if (field === 'date') {
      const date = this.parseDate(value);
      if (date) {
        return date.toISOString();
      }
    }

    if (operator === 'in' || operator === 'notIn') {
      return value.split(',').map((v) => v.trim());
    }

    return value;
  }

  private static parseDate(value: string): Date | null {
    const trimmed = value.trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return new Date(trimmed);
    }

    if (trimmed === 'today') {
      return today;
    }

    if (trimmed === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }

    const relativeMatch = trimmed.match(/^(\d+)([dwmy])$/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();
      const date = new Date(today);

      if (unit === 'd') {
        date.setDate(date.getDate() - amount);
      } else if (unit === 'w') {
        date.setDate(date.getDate() - amount * 7);
      } else if (unit === 'm') {
        date.setMonth(date.getMonth() - amount);
      } else if (unit === 'y') {
        date.setFullYear(date.getFullYear() - amount);
      }

      return date;
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    return null;
  }

  static buildQuery(filterGroup?: FilterGroup, quickFilter?: QuickFilterType): string {
    const parts: string[] = [];

    if (quickFilter) {
      const quickFilterKey = Object.entries(this.QUICK_FILTERS).find(([, v]) => v === quickFilter)?.[0];
      if (quickFilterKey) {
        parts.push(quickFilterKey);
      }
    }

    if (filterGroup) {
      const queryParts = this.buildQueryFromGroup(filterGroup);
      parts.push(...queryParts);
    }

    return parts.join(' ');
  }

  // Preferred prefix for each FilterField when serializing back to query string
  private static readonly FIELD_TO_PREFIX: Record<string, string> = {
    from: 'from',
    to: 'to',
    cc: 'cc',
    bcc: 'bcc',
    subject: 'subject',
    body: 'body',
    date: 'date',
    folder: 'folder',
    tags: 'tag',
    size: 'size',
    messageId: 'message-id',
    status: 'status',
    attachment: 'attachment',
    filename: 'filename',
  };

  private static buildConditionString(condition: FilterCondition): string {
    const prefix = this.FIELD_TO_PREFIX[condition.field] || condition.field;
    let value: string;

    if (Array.isArray(condition.value)) {
      value = condition.value.join(',');
    } else {
      value = String(condition.value);
    }

    if (value.includes(' ')) {
      value = `"${value}"`;
    }

    if (condition.operator === 'notIn') {
      return `-${prefix}:${value}`;
    }
    return `${prefix}:${value}`;
  }

  private static buildQueryFromGroup(group: FilterGroup): string[] {
    const parts: string[] = [];
    const joiner = group.logic === 'OR' ? ' OR ' : ' ';

    // Serialize conditions
    const conditionStrings = group.conditions.map((c) => this.buildConditionString(c));
    if (conditionStrings.length > 0) {
      parts.push(conditionStrings.join(joiner));
    }

    // Serialize sub-groups
    if (group.groups) {
      for (const subGroup of group.groups) {
        const subParts = this.buildQueryFromGroup(subGroup);
        if (subParts.length > 0) {
          const subStr = subParts.join(' ');
          // Wrap in parens if the sub-group has multiple conditions and parent is OR
          const needsParens = subGroup.conditions.length > 1 && group.logic === 'OR';
          parts.push(needsParens ? `(${subStr})` : subStr);
        }
      }
    }

    return [parts.join(joiner)].filter((s) => s.length > 0);
  }
}