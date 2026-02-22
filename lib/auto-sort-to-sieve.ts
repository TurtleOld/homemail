/**
 * Converts AutoSortRule[] to a Sieve script string.
 *
 * Supported filter fields → Sieve tests:
 *   from, to, cc, bcc  → header :contains/:matches "Header" "value"
 *   subject            → header :contains/:matches "Subject" "value"
 *   size (gt/gte)      → size :over N
 *   size (lt/lte)      → size :under N
 *
 * Unsupported fields (body, date, tags, folder, status, messageId,
 * attachment, filename) cause the rule to be skipped — it continues
 * to work via the client-side auto-sort engine.
 *
 * Supported actions → Sieve commands:
 *   moveToFolder / move  → fileinto "FolderName"
 *   markRead             → addflag "\\Seen"
 *   markImportant        → addflag "\\Flagged"
 *   delete               → discard
 *   forward              → redirect "email"
 *
 * Unsupported actions (label, autoArchive, autoDelete, autoReply) are
 * silently skipped; if a rule has no convertible actions it is omitted.
 */

import type { AutoSortRule, FilterCondition, FilterGroup } from './types';

const HEADER_FIELD_MAP: Record<string, string> = {
  from: 'From',
  to: 'To',
  cc: 'Cc',
  bcc: 'Bcc',
  subject: 'Subject',
};

function escapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function hasWildcard(value: string): boolean {
  return value.includes('*') || value.includes('?');
}

/**
 * Converts a single FilterCondition to a Sieve test string.
 * Returns null if the condition cannot be represented in Sieve.
 */
function conditionToSieve(cond: FilterCondition): string | null {
  const { field, operator, value } = cond;

  // Header-based conditions
  if (field in HEADER_FIELD_MAP) {
    const header = HEADER_FIELD_MAP[field];
    if (typeof value !== 'string') return null;

    const matchType = hasWildcard(value) ? ':matches' : ':contains';

    if (operator === 'equals') {
      return `header :is "${escapeString(header)}" "${escapeString(value)}"`;
    }
    if (operator === 'contains' || operator === 'matches' || operator === 'startsWith' || operator === 'endsWith') {
      return `header ${matchType} "${escapeString(header)}" "${escapeString(value)}"`;
    }
    if (operator === 'notIn') {
      return `not header ${matchType} "${escapeString(header)}" "${escapeString(value)}"`;
    }
    return null;
  }

  // Size conditions
  if (field === 'size') {
    const num = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (isNaN(num)) return null;

    if (operator === 'gt' || operator === 'gte') return `size :over ${num}`;
    if (operator === 'lt' || operator === 'lte') return `size :under ${num}`;
    return null;
  }

  // All other fields are unsupported
  return null;
}

/**
 * Converts a FilterGroup to a Sieve test expression.
 * Returns null if any condition in the group cannot be converted.
 */
function groupToSieve(group: FilterGroup): string | null {
  const parts: string[] = [];

  for (const cond of group.conditions) {
    const sieve = conditionToSieve(cond);
    if (sieve === null) return null;
    parts.push(sieve);
  }

  if (group.groups) {
    for (const subGroup of group.groups) {
      const sub = groupToSieve(subGroup);
      if (sub === null) return null;
      parts.push(sub);
    }
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];

  const logic = group.logic === 'OR' ? 'anyof' : 'allof';
  return `${logic} (${parts.join(',\n    ')})`;
}

interface ConvertedRule {
  name: string;
  test: string;
  actions: string[];
  requires: string[];
}

/**
 * Tries to convert a single AutoSortRule to Sieve.
 * Returns null if the rule cannot be represented (unsupported conditions,
 * no convertible actions, or the rule is disabled).
 */
function convertRule(
  rule: AutoSortRule,
  getFolderName: (id: string) => string | undefined
): ConvertedRule | null {
  if (!rule.enabled) return null;

  const test = groupToSieve(rule.conditions);
  if (!test) return null;

  const actions: string[] = [];
  const requires = new Set<string>();

  for (const action of rule.actions) {
    switch (action.type) {
      case 'moveToFolder':
      case 'move': {
        const folderId = action.folderId || action.payload?.folderId;
        if (!folderId) continue;
        const folderName = getFolderName(folderId);
        if (!folderName) continue;
        actions.push(`fileinto "${escapeString(folderName)}";`);
        requires.add('fileinto');
        break;
      }
      case 'markRead':
        actions.push('addflag "\\\\Seen";');
        requires.add('imap4flags');
        break;
      case 'markImportant':
        actions.push('addflag "\\\\Flagged";');
        requires.add('imap4flags');
        break;
      case 'delete':
        actions.push('discard;');
        break;
      case 'forward': {
        const email = action.payload?.email;
        if (!email) continue;
        actions.push(`redirect "${escapeString(email)}";`);
        break;
      }
      // label, autoArchive, autoDelete, autoReply — not representable in basic Sieve
    }
  }

  if (actions.length === 0) return null;

  return {
    name: rule.name,
    test,
    actions,
    requires: [...requires],
  };
}

/**
 * Converts an array of AutoSortRules to a Sieve script string.
 *
 * Rules that cannot be expressed in Sieve are silently skipped —
 * they continue to be processed by the client-side auto-sort engine.
 *
 * @param rules       Enabled AutoSortRules for the account
 * @param getFolderName  Resolver from folder ID to folder name
 * @returns           Sieve script as a string (may be empty if no rules convert)
 */
export function convertRulesToSieve(
  rules: AutoSortRule[],
  getFolderName: (id: string) => string | undefined
): string {
  const converted: ConvertedRule[] = [];
  const allRequires = new Set<string>();

  for (const rule of rules) {
    const result = convertRule(rule, getFolderName);
    if (!result) continue;
    converted.push(result);
    for (const req of result.requires) {
      allRequires.add(req);
    }
  }

  if (converted.length === 0) {
    return '# No auto-sort rules could be converted to Sieve.\n';
  }

  const lines: string[] = [];

  // require statement
  if (allRequires.size > 0) {
    const reqs = [...allRequires].map((r) => `"${r}"`).join(', ');
    lines.push(`require [${reqs}];`);
    lines.push('');
  }

  for (const rule of converted) {
    lines.push(`# Rule: ${rule.name}`);
    lines.push(`if ${rule.test} {`);
    for (const action of rule.actions) {
      lines.push(`  ${action}`);
    }
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}
