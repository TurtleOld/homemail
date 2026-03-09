import { readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../lib/logger';
import { getMailProvider, getMailProviderForAccount } from '../lib/get-provider';
import { checkMessageMatchesRule, applyRuleActions } from '../lib/apply-auto-sort-rules';
import type { AutoSortRule, MessageListItem, Folder } from '../lib/types';
import { readStorage, writeStorage } from '../lib/storage';
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

/**
 * Load processed messages map from disk.
 * Returns a mutable object that callers can add entries to.
 */
async function loadProcessedMessages(): Promise<Record<string, number>> {
  try {
    return await readStorage<Record<string, number>>(PROCESSED_MESSAGES_KEY, {});
  } catch {
    return {};
  }
}

/**
 * Flush the processed messages map to disk.
 * Performs cleanup (remove entries older than 30 days, cap at MAX_PROCESSED_MESSAGES).
 * Should be called infrequently — once per folder or per account, NOT per message.
 */
async function flushProcessedMessages(processed: Record<string, number>): Promise<void> {
  try {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Filter and sort in a single pass
    const entries = Object.entries(processed)
      .filter(([, timestamp]) => timestamp > thirtyDaysAgo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_PROCESSED_MESSAGES);

    const cleaned: Record<string, number> = {};
    for (const [id, timestamp] of entries) {
      cleaned[id] = timestamp;
    }

    await writeStorage(PROCESSED_MESSAGES_KEY, cleaned);
  } catch (error) {
    logger.error(`[auto-sort] Error flushing processed messages:`, error);
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

    // Load once at the start — all mutations happen in memory
    const processedMap = await loadProcessedMessages();
    const processedSet = new Set(Object.keys(processedMap));
    const folders = await provider.getFolders(accountId);

    // Process all folders except system ones
    const foldersToCheck = folders.filter((f: Folder) => {
      if (f.role && EXCLUDED_FOLDER_ROLES.has(f.role)) return false;
      return true;
    });

    logger.info(`[auto-sort] Checking ${foldersToCheck.length} folder(s) for account ${accountId}`);

    let dirtyCount = 0;

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
          if (processedSet.has(message.id)) {
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

            // Mark as processed in memory (NOT on disk — we flush once per folder)
            const now = Date.now();
            processedMap[message.id] = now;
            processedSet.add(message.id);
            dirtyCount++;
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

      // Flush processed messages to disk after each folder (not per message)
      if (dirtyCount > 0) {
        await flushProcessedMessages(processedMap);
        dirtyCount = 0;
      }

      // Small delay between folders
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Final flush in case there are remaining dirty entries
    if (dirtyCount > 0) {
      await flushProcessedMessages(processedMap);
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
      tokenStore.invalidateCache();
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
