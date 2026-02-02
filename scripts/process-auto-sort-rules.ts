import { readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../lib/logger';
import { getMailProvider, getMailProviderForAccount } from '../lib/get-provider';
import { checkMessageMatchesRule, applyRuleActions } from '../lib/apply-auto-sort-rules';
import type { AutoSortRule, MessageListItem, Folder } from '../lib/types';
import { readStorage } from '../lib/storage';

const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');
const PROCESSED_MESSAGES_KEY = 'autoSortProcessedMessages';
const MAX_PROCESSED_MESSAGES = 10000;

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
    
    // Add new message
    processed[messageId] = now;
    
    // Remove old entries (older than 30 days)
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
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
    
    // Process inbox and spam folders
    const foldersToCheck = folders.filter((f: Folder) => 
      f.role === 'inbox' || f.role === 'spam' || f.name.toLowerCase() === 'inbox' || f.name.toLowerCase() === 'spam'
    );
    
    for (const folder of foldersToCheck) {
      logger.info(`[auto-sort] Checking folder ${folder.name} (${folder.id})`);
      
      try {
        // Get recent messages from last 7 days
        const messages = await provider.listMessages(accountId, folder.id, {
          limit: 100,
          sortOrder: 'desc',
        });
        
        logger.info(`[auto-sort] Found ${messages.length} messages in folder ${folder.name}`);
        
        let processedCount = 0;
        let matchedCount = 0;
        
        for (const message of messages as MessageListItem[]) {
          // Skip if already processed
          if (processed.has(message.id)) {
            continue;
          }
          
          // Check if message is recent (last 7 days)
          const messageDate = message.date instanceof Date ? message.date : new Date(message.date);
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          
          if (messageDate < sevenDaysAgo) {
            continue;
          }
          
          processedCount++;
          
          try {
            // Process each rule
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
                  await markMessageAsProcessed(message.id);
                  break; // Stop processing other rules after first match
                }
              } catch (ruleError) {
                logger.error(`[auto-sort] Error processing rule ${rule.name} for message ${message.id}:`, ruleError);
              }
            }
            
            // If no rules matched, still mark as processed to avoid re-checking
            if (!processed.has(message.id)) {
              await markMessageAsProcessed(message.id);
            }
          } catch (messageError) {
            logger.error(`[auto-sort] Error processing message ${message.id}:`, messageError);
          }
        }
        
        logger.info(`[auto-sort] Folder ${folder.name}: processed ${processedCount} messages, matched ${matchedCount}`);
      } catch (folderError) {
        logger.error(`[auto-sort] Error processing folder ${folder.name}:`, folderError);
      }
    }
  } catch (error) {
    logger.error(`[auto-sort] Error processing account ${accountId}:`, error);
  }
}

export async function processAutoSortRules(): Promise<void> {
  logger.info('[auto-sort] Starting auto-sort rules processing');
  
  try {
    const { readStorage } = await import('../lib/storage');
    const accounts = await readStorage<any[]>('accounts', []);
    
    if (accounts.length === 0) {
      logger.info('[auto-sort] No accounts found');
      return;
    }
    
    for (const account of accounts) {
      const provider = process.env.MAIL_PROVIDER === 'stalwart'
        ? getMailProviderForAccount(account.id)
        : getMailProvider();
      
      await processAccount(account.id, provider);
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