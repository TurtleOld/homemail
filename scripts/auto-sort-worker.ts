/**
 * Standalone auto-sort background worker.
 *
 * Runs independently of the Next.js process. Can be started via:
 *   npx tsx scripts/auto-sort-worker.ts
 *
 * Or as a systemd service / Docker sidecar for reliable background processing.
 *
 * Responsibilities:
 * 1. Process the filter-job queue (apply rules to existing messages)
 * 2. Periodically run a full-scan of all accounts/folders
 * 3. Watch for new messages via provider subscriptions (if supported)
 */

import { getPendingJobs, markJobProcessing, markJobCompleted, markJobFailed, cleanupOldJobs } from '../lib/filter-job-queue';
import { getMailProvider, getMailProviderForAccount } from '../lib/get-provider';
import { OAuthTokenStore } from '../lib/oauth-token-store';
import { processAutoSortRules } from './process-auto-sort-rules';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AutoSortRule } from '../lib/types';
import { checkMessageMatchesRule, applyRuleActions } from '../lib/apply-auto-sort-rules';

const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');

const JOB_POLL_INTERVAL = 10_000;     // 10 seconds
const FULL_SCAN_INTERVAL = 10 * 60_000; // 10 minutes
const CLEANUP_INTERVAL = 24 * 60 * 60_000; // 24 hours
const BATCH_MOVE_SIZE = 50;

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('429') || msg.toLowerCase().includes('too many');
}

function isDeletedFolderName(name: string | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes('deleted');
}

async function loadRules(accountId: string): Promise<AutoSortRule[]> {
  try {
    const data = await readFile(rulesFilePath, 'utf-8');
    const allRules = JSON.parse(data) as Record<string, AutoSortRule[]>;
    return (allRules[accountId] || []).filter((r) => r.enabled);
  } catch {
    return [];
  }
}

async function processFilterJob(jobId: string, accountId: string, ruleId: string): Promise<void> {
  console.log(`[worker] Processing job ${jobId} for rule ${ruleId}`);

  const provider = process.env.MAIL_PROVIDER === 'stalwart'
    ? getMailProviderForAccount(accountId)
    : getMailProvider();

  const rules = await loadRules(accountId);
  const rule = rules.find((r) => r.id === ruleId);

  if (!rule) throw new Error(`Rule ${ruleId} not found`);
  if (!rule.enabled) throw new Error(`Rule ${ruleId} is disabled`);

  const folders = await provider.getFolders(accountId);

  const moveToFolderAction = rule.actions.find((a) => a.type === 'moveToFolder');
  let destinationFolderId: string | null = null;

  if (moveToFolderAction && moveToFolderAction.type === 'moveToFolder' && moveToFolderAction.folderId) {
    destinationFolderId = moveToFolderAction.folderId;
    const roleAliases = ['inbox', 'sent', 'drafts', 'trash', 'spam'];
    if (roleAliases.includes(destinationFolderId)) {
      const dest = folders.find((f) => f.role === destinationFolderId);
      if (dest) destinationFolderId = dest.id;
    }
  }

  const hasOnlyMoveAction = rule.actions.length === 1 && moveToFolderAction != null;

  const foldersToSearch = folders.filter((f) => {
    if (f.role === 'trash' || f.role === 'sent' || f.role === 'drafts') return false;
    if (isDeletedFolderName(f.name)) return false;
    if (hasOnlyMoveAction && destinationFolderId && f.id === destinationFolderId) return false;
    return true;
  });

  let totalProcessed = 0;
  let totalApplied = 0;

  for (const folder of foldersToSearch) {
    try {
      console.log(`[worker] Job ${jobId}: folder ${folder.name}`);

      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const result = await provider.getMessages(accountId, folder.id, {
          limit: 500,
          ...(cursor ? { cursor } : {}),
        });

        if (!result?.messages?.length) break;

        const messages = result.messages;
        hasMore = !!result.nextCursor;
        cursor = result.nextCursor;

        const matchedIds: string[] = [];

        for (const message of messages) {
          try {
            const matches = await checkMessageMatchesRule(message, rule, provider, accountId, folder.id);
            if (matches) matchedIds.push(message.id);
            totalProcessed++;
          } catch (error) {
            if (isRateLimitError(error)) await delay(2000);
          }
        }

        if (matchedIds.length === 0) continue;

        console.log(`[worker] Job ${jobId}: ${matchedIds.length} matches in ${folder.name}`);

        // Batch move
        if (destinationFolderId) {
          for (let i = 0; i < matchedIds.length; i += BATCH_MOVE_SIZE) {
            const batch = matchedIds.slice(i, i + BATCH_MOVE_SIZE);
            try {
              await provider.bulkUpdateMessages(accountId, {
                ids: batch,
                action: 'move',
                payload: { folderId: destinationFolderId },
              });
              totalApplied += batch.length;
            } catch (error) {
              if (isRateLimitError(error)) await delay(3000);
              // Fallback: individual moves
              for (const id of batch) {
                try {
                  await provider.bulkUpdateMessages(accountId, {
                    ids: [id], action: 'move', payload: { folderId: destinationFolderId! },
                  });
                  totalApplied++;
                } catch { /* skip */ }
                await delay(100);
              }
            }
            if (i + BATCH_MOVE_SIZE < matchedIds.length) await delay(200);
          }
        }

        // Non-move actions
        const nonMoveActions = rule.actions.filter((a) => a.type !== 'moveToFolder');
        if (nonMoveActions.length > 0) {
          for (const id of matchedIds) {
            for (const action of nonMoveActions) {
              try {
                if (action.type === 'markRead') {
                  await provider.updateMessageFlags(accountId, id, { unread: false });
                } else if (action.type === 'markImportant') {
                  await provider.updateMessageFlags(accountId, id, { starred: true });
                } else if (action.type === 'delete') {
                  await provider.bulkUpdateMessages(accountId, { ids: [id], action: 'delete' });
                }
              } catch { /* skip */ }
            }
            if (!destinationFolderId) totalApplied++;
            await delay(50);
          }
        }

        await delay(200);
      }

      await delay(300);
    } catch (error) {
      console.error(`[worker] Job ${jobId}: folder ${folder.id} error:`, error);
      if (isRateLimitError(error)) await delay(3000);
    }
  }

  console.log(`[worker] Job ${jobId} done: ${totalApplied}/${totalProcessed} applied`);
  return void (totalProcessed); // return value unused, just for logging context
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processJobQueue(): Promise<void> {
  try {
    const pendingJobs = await getPendingJobs();
    if (pendingJobs.length === 0) return;

    console.log(`[worker] ${pendingJobs.length} pending job(s)`);

    for (const job of pendingJobs) {
      try {
        await markJobProcessing(job.id);
        await processFilterJob(job.id, job.accountId, job.ruleId);
        await markJobCompleted(job.id, { processed: 0, total: 0 });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[worker] Job ${job.id} failed:`, msg);
        await markJobFailed(job.id, msg);
      }
    }
  } catch (error) {
    console.error('[worker] Job queue error:', error);
  }
}

async function main(): Promise<void> {
  console.log('[worker] Auto-sort worker starting...');

  // Process any pending jobs immediately
  await processJobQueue();

  // Job queue polling
  setInterval(() => {
    void processJobQueue();
  }, JOB_POLL_INTERVAL);

  // Full scan
  const runFullScan = async () => {
    try {
      console.log('[worker] Starting full scan...');
      await processAutoSortRules();
      console.log('[worker] Full scan complete');
    } catch (error) {
      console.error('[worker] Full scan error:', error);
    }
  };

  // First full scan after 30s startup delay
  setTimeout(() => {
    void runFullScan();
    setInterval(() => void runFullScan(), FULL_SCAN_INTERVAL);
  }, 30_000);

  // Cleanup old jobs daily
  setInterval(() => void cleanupOldJobs(), CLEANUP_INTERVAL);

  console.log('[worker] Auto-sort worker running. Press Ctrl+C to stop.');

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('[worker] Shutting down...');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('[worker] Shutting down...');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('[worker] Fatal error:', error);
  process.exit(1);
});
