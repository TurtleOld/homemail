import { readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../lib/logger';
import { getMailProvider, getMailProviderForAccount } from '../lib/get-provider';
import { checkMessageMatchesRule, applyRuleActions } from '../lib/apply-auto-sort-rules';
import type { AutoSortRule, MessageListItem, Folder } from '../lib/types';
import { readStorage } from '../lib/storage';
import { OAuthTokenStore } from '../lib/oauth-token-store';

const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');
const PROCESSED_MESSAGES_KEY = 'autoSortProcessedMessages';
const MAX_PROCESSED_MESSAGES = 10000;

const EXCLUDED_FOLDER_ROLES = new Set(['sent', 'trash', 'drafts']);

async function loadRules(accountId: string): Promise<AutoSortRule[]> {
  try {
    const data = await readFile(rulesFilePath, 'utf-8');
    const allRules = JSON.parse(data) as Record<string, AutoSortRule[]>;
    return (allRules[accountId] || []).filter((r) => r.enabled);
  } catch (error) {
    logger.error(`[auto-sort] Error loading rules for account ${accountId}:`, error);
    return [];
  }
}

async function getProcessedMessages(): Promise<Set<string>> {
  try {
    const processed = await readStorage<Record<string, number>>(PROCESSED_MESSAGES_KEY, {});
    return new Set(Object.keys(processed));
  } catch {
    return new Set();
  }
}

async function markMessageAsProcessed(messageId: string): Promise<void> {
  try {
    const processed = await readStorage<Record<string, number>>(PROCESSED_MESSAGES_KEY, {});
    const now = Date.now();

    processed[messageId] = now;

    // Remove old entries (older than 30 days)
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const cleaned: Record<string, number> = {};
    for (const [id, timestamp] of Object.entries(processed)) {
      if (timestamp > thirtyDaysAgo) {
        cleaned[id] = timestamp;
      }
    }

    // Also limit by count
    const entries = Object.entries(cleaned).sort((a, b) => b[1] - a[1]);
    const limited = entries.slice(0, MAX_PROCESSED_MESSAGES);
    const finalProcessed: Record<string, number> = {};
    for (const [id, timestamp] of limited) {
      finalProcessed[id] = timestamp;
    }

    const { writeStorage } = await import('../lib/storage');
    await writeStorage(PROCESSED_MESSAGES_KEY, finalProcessed);
  } catch (error) {
    logger.error(`[auto-sort] Error marking message as processed:`, error);
  }
}

async function processAccount(accountId: string, provider: any): Promise<void> {
  try {
    logger.info(`[auto-sort] Processing account ${accountId}`);

    const rules = await loadRules(accountId);
    if (rules.length === 0) {
      logger.info(`[auto-sort] No enabled rules for account ${accountId}`);
      return;
    }

    const processed = await getProcessedMessages();
    const folders = await provider.getFolders(accountId);

    // Process all folders except system ones
    const foldersToCheck = folders.filter((f: Folder) => {
      if (f.role && EXCLUDED_FOLDER_ROLES.has(f.role)) return false;
      return true;
    });

    logger.info(`[auto-sort] Checking ${foldersToCheck.length} folder(s) for account ${accountId}`);

    for (const folder of foldersToCheck) {
      logger.info(`[auto-sort] Checking folder ${folder.name} (${folder.id})`);

      try {
        // Use getMessages (compatible with both old listMessages and new provider API)
        const getMessagesFn = provider.getMessages || provider.listMessages;
        const result = await getMessagesFn.call(provider, accountId, folder.id, {
          limit: 2000,
          sortOrder: 'desc',
        });

        const messages: MessageListItem[] = Array.isArray(result)
          ? result
          : result?.messages ?? [];

        logger.info(`[auto-sort] Found ${messages.length} messages in folder ${folder.name}`);

        let processedCount = 0;
        let matchedCount = 0;

        for (const message of messages) {
          // Skip if already processed by this script
          if (processed.has(message.id)) {
            continue;
          }

          processedCount++;

          try {
            let applied = false;
            // Check each rule in order; stop at first match
            for (const rule of rules) {
              try {
                const matches = await checkMessageMatchesRule(
                  message,
                  rule,
                  provider,
                  accountId,
                  folder.id
                );

                if (matches) {
                  logger.info(`[auto-sort] Message ${message.id} matches rule "${rule.name}"`);
                  await applyRuleActions(message.id, rule, provider, accountId);
                  matchedCount++;
                  applied = true;
                  break;
                }
              } catch (ruleError) {
                logger.error(`[auto-sort] Error processing rule ${rule.name} for message ${message.id}:`, ruleError);
              }
            }

            // Mark as processed regardless of match to skip on next run
            await markMessageAsProcessed(message.id);
            if (!applied) {
              // Also add to in-memory set so we don't re-check within the same run
              processed.add(message.id);
            }
          } catch (messageError) {
            logger.error(`[auto-sort] Error processing message ${message.id}:`, messageError);
          }

          // Small delay to avoid hammering the server
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        logger.info(`[auto-sort] Folder ${folder.name}: processed ${processedCount} messages, matched ${matchedCount}`);
      } catch (folderError) {
        logger.error(`[auto-sort] Error processing folder ${folder.name}:`, folderError);
      }

      // Small delay between folders
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error) {
    logger.error(`[auto-sort] Error processing account ${accountId}:`, error);
  }
}

export async function processAutoSortRules(): Promise<void> {
  logger.info('[auto-sort] Starting auto-sort rules processing');

  try {
    // Primary: load account IDs from OAuth token store (OAuth-only mode)
    const accountIds = new Set<string>();

    try {
      const tokenStore = new OAuthTokenStore();
      const tokens = await tokenStore.loadTokens();
      for (const id of tokens.keys()) {
        accountIds.add(id);
      }
    } catch (e) {
      logger.error('[auto-sort] Failed to load OAuth tokens:', e);
    }

    // Fallback: try storage-based accounts list (legacy)
    if (accountIds.size === 0) {
      try {
        const accounts = await readStorage<any[]>('accounts', []);
        for (const account of accounts) {
          if (account?.id) accountIds.add(account.id);
        }
      } catch (e) {
        logger.error('[auto-sort] Failed to load accounts from storage:', e);
      }
    }

    if (accountIds.size === 0) {
      logger.info('[auto-sort] No accounts found');
      return;
    }

    logger.info(`[auto-sort] Found ${accountIds.size} account(s)`);

    for (const accountId of accountIds) {
      const provider =
        process.env.MAIL_PROVIDER === 'stalwart'
          ? getMailProviderForAccount(accountId)
          : getMailProvider();

      await processAccount(accountId, provider);
    }

    logger.info('[auto-sort] Auto-sort rules processing completed');
  } catch (error) {
    logger.error('[auto-sort] Error in auto-sort processing:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  processAutoSortRules()
    .then(() => {
      logger.info('[auto-sort] Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('[auto-sort] Script failed:', error);
      process.exit(1);
    });
}
