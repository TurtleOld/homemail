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

    const conditions: FilterCondition[] = [];
    const tokens = this.tokenize(query);
    let i = 0;

    while (i < tokens.length) {
      const condition = this.parseCondition(tokens, i);
      if (condition) {
        conditions.push(condition.condition);
        i = condition.nextIndex;
      } else {
        i++;
      }
    }

    if (conditions.length === 0) {
      return undefined;
    }

    return {
      logic: 'AND',
      conditions,
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
          if (current.trim()) {
            tokens.push(current.trim());
            current = '';
          }
          inQuotes = false;
        } else {
          if (current.trim()) {
            tokens.push(current.trim());
            current = '';
          }
          inQuotes = true;
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
        const operator = this.detectOperator(value);
        const condition: FilterCondition = {
          field,
          operator: negate ? this.negateOperator(operator) : operator,
          value: this.parseValue(field, value, operator),
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

  private static buildQueryFromGroup(group: FilterGroup): string[] {
    const parts: string[] = [];

    for (const condition of group.conditions) {
      const fieldName = Object.entries(this.FIELD_PREFIXES).find(([, v]) => v === condition.field)?.[0] || condition.field;
      const operator = condition.operator;
      let value = condition.value;

      if (typeof value === 'string' && value.includes(' ')) {
        value = `"${value}"`;
      }

      if (operator === 'notIn') {
        parts.push(`-${fieldName}:${value}`);
      } else {
        parts.push(`${fieldName}:${value}`);
      }
    }

    if (group.groups) {
      for (const subGroup of group.groups) {
        const subParts = this.buildQueryFromGroup(subGroup);
        if (subParts.length > 0) {
          parts.push(`(${subParts.join(` ${subGroup.logic} `)})`);
        }
      }
    }

    return parts;
  }
}