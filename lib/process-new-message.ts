import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AutoSortRule, MessageListItem, MessageDetail } from './types';
import { checkMessageMatchesRule, applyRuleActions } from './apply-auto-sort-rules';
import type { MailProvider } from '@/providers/mail-provider';

const EXCLUDED_FOLDER_ROLES = new Set(['sent', 'trash', 'drafts']);

type FolderRoleCacheEntry = {
  rolesByFolderId: Map<string, string>;
  expiresAt: number;
};

// In-memory cache to avoid fetching folders on every incoming message.
const folderRoleCache = new Map<string, FolderRoleCacheEntry>();

async function getFolderRole(
  provider: MailProvider,
  accountId: string,
  folderId: string
): Promise<string | undefined> {
  const now = Date.now();
  const cached = folderRoleCache.get(accountId);

  if (cached && cached.expiresAt > now) {
    return cached.rolesByFolderId.get(folderId);
  }

  try {
    const folders = await provider.getFolders(accountId);
    const rolesByFolderId = new Map(folders.map((f) => [f.id, f.role]));
    folderRoleCache.set(accountId, {
      rolesByFolderId,
      // folders don't change often; 5 minutes is enough.
      expiresAt: now + 5 * 60 * 1000,
    });
    return rolesByFolderId.get(folderId);
  } catch {
    return undefined;
  }
}

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
  message: MessageListItem | MessageDetail,
  accountId: string,
  folderId: string,
  provider: MailProvider
): Promise<void> {
  try {
    // Do not auto-sort messages in excluded/system folders.
    // folderId can be either a role-like string ('sent') or a real mailbox id.
    const lowerFolderId = String(folderId || '').toLowerCase();
    if (EXCLUDED_FOLDER_ROLES.has(lowerFolderId) || lowerFolderId.includes('deleted')) {
      return;
    }
    const role = await getFolderRole(provider, accountId, folderId);
    if (role && EXCLUDED_FOLDER_ROLES.has(role)) {
      return;
    }

    const rules = await loadRules(accountId);

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      try {
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        
        const matches = await checkMessageMatchesRule(message, rule, provider, accountId, folderId);
        if (matches) {
          console.log(`[process-new-message] Message ${message.id} matches rule ${rule.name}, applying actions...`);
          await applyRuleActions(message.id, rule, provider, accountId);
          break;
        }
      } catch (error) {
        console.error(`[process-new-message] Error processing rule ${rule.name} for message ${message.id}:`, error);
        if (error instanceof Error && error.message.includes('Too Many Requests')) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  } catch (error) {
    console.error('[process-new-message] Error loading rules:', error);
  }
}