import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AutoSortRule, MessageListItem } from './types';
import { checkMessageMatchesRule, applyRuleActions } from './apply-auto-sort-rules';
import type { MailProvider } from '@/providers/mail-provider';

const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');

async function loadRules(accountId: string): Promise<AutoSortRule[]> {
  try {
    const data = await readFile(rulesFilePath, 'utf-8');
    const allRules = JSON.parse(data) as Record<string, AutoSortRule[]>;
    return (allRules[accountId] || []).filter((r) => r.enabled);
  } catch {
    return [];
  }
}

export async function processNewMessage(
  message: MessageListItem,
  accountId: string,
  folderId: string,
  provider: MailProvider
): Promise<void> {
  try {
    const rules = await loadRules(accountId);

    for (const rule of rules) {
      try {
        const matches = await checkMessageMatchesRule(message, rule, provider, accountId, folderId);
        if (matches) {
          console.log(`[process-new-message] Message ${message.id} matches rule ${rule.name}, applying actions...`);
          await applyRuleActions(message.id, rule, provider, accountId);
        }
      } catch (error) {
        console.error(`[process-new-message] Error processing rule ${rule.name} for message ${message.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[process-new-message] Error loading rules:', error);
  }
}