import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { processNewMessage } from '@/lib/process-new-message';
import { OAuthTokenStore } from '@/lib/oauth-token-store';
import { getPendingJobs, markJobProcessing, markJobCompleted, markJobFailed, cleanupOldJobs } from '@/lib/filter-job-queue';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AutoSortRule } from '@/lib/types';
import { checkMessageMatchesRule, applyRuleActions } from '@/lib/apply-auto-sort-rules';

type Unsubscribe = () => void;

declare global {
  // eslint-disable-next-line no-var
  var __autoSortDaemonStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __autoSortDaemonUnsubscribes: Map<string, Unsubscribe> | undefined;
  // eslint-disable-next-line no-var
  var __autoSortDaemonQueues: Map<string, Array<() => Promise<void>>> | undefined;
  // eslint-disable-next-line no-var
  var __autoSortDaemonProcessing: Map<string, boolean> | undefined;
}

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('429') || msg.toLowerCase().includes('too many');
}

const EXCLUDED_FOLDER_ROLES = new Set(['sent', 'trash', 'drafts']);
const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');

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
  console.log(`[auto-sort-daemon] Processing filter job ${jobId} for rule ${ruleId}`);

  try {
    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(accountId)
      : getMailProvider();

    const rules = await loadRules(accountId);
    const rule = rules.find((r) => r.id === ruleId);

    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    if (!rule.enabled) {
      throw new Error(`Rule ${ruleId} is disabled`);
    }

    const folders = await provider.getFolders(accountId);

    // Determine destination folder if this is a move action
    const moveToFolderAction = rule.actions.find((a) => a.type === 'moveToFolder');
    let destinationFolderId: string | null = null;

    if (moveToFolderAction && moveToFolderAction.type === 'moveToFolder' && moveToFolderAction.folderId) {
      destinationFolderId = moveToFolderAction.folderId;

      if (destinationFolderId === 'inbox' || destinationFolderId === 'sent' || destinationFolderId === 'drafts' || destinationFolderId === 'trash' || destinationFolderId === 'spam') {
        const destinationFolder = folders.find((f) => f.role === destinationFolderId);
        if (destinationFolder) {
          destinationFolderId = destinationFolder.id;
        }
      }
    }

    // Filter folders to search (exclude system folders and destination folder)
    const foldersToSearch = folders.filter((f) => {
      if (f.role === 'trash' || f.role === 'sent' || f.role === 'drafts') {
        return false;
      }
      if (isDeletedFolderName(f.name)) {
        return false;
      }
      if (destinationFolderId && f.id === destinationFolderId) {
        return false;
      }
      return true;
    });

    console.log(`[auto-sort-daemon] Job ${jobId}: Processing ${foldersToSearch.length} folders`);

    let totalProcessed = 0;
    let totalApplied = 0;

    // Process folders one by one to avoid rate limiting
    for (const folder of foldersToSearch) {
      try {
        console.log(`[auto-sort-daemon] Job ${jobId}: Processing folder ${folder.name}`);

        const result = await provider.getMessages(accountId, folder.id, { limit: 100 });

        if (!result || !result.messages || result.messages.length === 0) {
          continue;
        }

        // Process messages one by one with delays
        for (let i = 0; i < result.messages.length; i++) {
          const message = result.messages[i];

          try {
            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }

            const matches = await checkMessageMatchesRule(message, rule, provider, accountId, folder.id);

            if (matches) {
              console.log(`[auto-sort-daemon] Job ${jobId}: Message ${message.id} matches rule, applying actions...`);
              await applyRuleActions(message.id, rule, provider, accountId);
              totalApplied++;

              // Extra delay after applying actions
              if (totalApplied % 5 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            }

            totalProcessed++;
          } catch (error) {
            console.error(`[auto-sort-daemon] Job ${jobId}: Error processing message ${message.id}:`, error);
            if (isRateLimitError(error)) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }
        }

        // Delay between folders
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[auto-sort-daemon] Job ${jobId}: Error processing folder ${folder.id}:`, error);
        if (isRateLimitError(error)) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }

    await markJobCompleted(jobId, { processed: totalProcessed, total: totalProcessed });
    console.log(`[auto-sort-daemon] Job ${jobId} completed: ${totalApplied} actions applied out of ${totalProcessed} messages`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[auto-sort-daemon] Job ${jobId} failed:`, errorMessage);
    await markJobFailed(jobId, errorMessage);
  }
}

async function processJobQueue(): Promise<void> {
  try {
    const pendingJobs = await getPendingJobs();

    if (pendingJobs.length === 0) {
      return;
    }

    console.log(`[auto-sort-daemon] Found ${pendingJobs.length} pending job(s)`);

    // Process one job at a time to avoid overwhelming the system
    const job = pendingJobs[0];

    await markJobProcessing(job.id);
    await processFilterJob(job.id, job.accountId, job.ruleId);
  } catch (error) {
    console.error('[auto-sort-daemon] Error processing job queue:', error);
  }
}

async function processQueue(accountId: string): Promise<void> {
  if (!globalThis.__autoSortDaemonQueues) {
    globalThis.__autoSortDaemonQueues = new Map();
  }
  if (!globalThis.__autoSortDaemonProcessing) {
    globalThis.__autoSortDaemonProcessing = new Map();
  }

  // If already processing, don't start another processor
  if (globalThis.__autoSortDaemonProcessing.get(accountId)) {
    return;
  }

  globalThis.__autoSortDaemonProcessing.set(accountId, true);

  const queue = globalThis.__autoSortDaemonQueues.get(accountId) || [];
  globalThis.__autoSortDaemonQueues.set(accountId, queue);

  while (queue.length > 0) {
    const task = queue.shift();
    if (task) {
      try {
        await task();
        // Rate limiting: wait between processing messages
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.error('[auto-sort-daemon] Queue task failed:', e);
        // If rate limited, wait longer
        if (isRateLimitError(e)) {
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }
  }

  globalThis.__autoSortDaemonProcessing.set(accountId, false);
}

function enqueueTask(accountId: string, task: () => Promise<void>): void {
  if (!globalThis.__autoSortDaemonQueues) {
    globalThis.__autoSortDaemonQueues = new Map();
  }

  let queue = globalThis.__autoSortDaemonQueues.get(accountId);
  if (!queue) {
    queue = [];
    globalThis.__autoSortDaemonQueues.set(accountId, queue);
  }

  queue.push(task);

  // Start processing if not already processing
  void processQueue(accountId);
}

async function startWatchingAccount(accountId: string): Promise<void> {
  if (!globalThis.__autoSortDaemonUnsubscribes) {
    globalThis.__autoSortDaemonUnsubscribes = new Map();
  }

  if (globalThis.__autoSortDaemonUnsubscribes.has(accountId)) {
    return;
  }

  const provider = process.env.MAIL_PROVIDER === 'stalwart'
    ? getMailProviderForAccount(accountId)
    : getMailProvider();

  // Build a mailboxId -> role map so we can exclude sent/trash/drafts even if provider emits events
  // for multiple folders.
  let folderRoleById = new Map<string, string>();
  let folderNameById = new Map<string, string>();
  try {
    const folders = await provider.getFolders(accountId);
    folderRoleById = new Map(folders.map((f) => [f.id, f.role]));
    folderNameById = new Map(folders.map((f) => [f.id, f.name]));
  } catch (e) {
    // Not fatal; we'll process events without role filtering.
    console.error('[auto-sort-daemon] Failed to load folders for account:', accountId, e);
  }

  const unsubscribe = provider.subscribeToUpdates(accountId, async (event) => {
    if (event.type !== 'message.new') {
      return;
    }

    const messageId = event.data?.messageId || event.data?.id;
    const folderId = event.data?.folderId || event.data?.mailboxId || 'inbox';

    if (!messageId) {
      return;
    }

    const role = folderRoleById.get(folderId);
    if (role && EXCLUDED_FOLDER_ROLES.has(role)) {
      return;
    }

    const name = folderNameById.get(folderId);
    if (isDeletedFolderName(name)) {
      return;
    }

    // Add to queue instead of processing immediately to avoid rate limiting
    enqueueTask(accountId, async () => {
      try {
        // Small delay to let Stalwart finish indexing the message.
        await new Promise((r) => setTimeout(r, 250));
        const message = await provider.getMessage(accountId, messageId);
        if (!message) {
          return;
        }
        await processNewMessage(message, accountId, folderId, provider);
      } catch (e) {
        console.error('[auto-sort-daemon] Failed to process new message:', {
          accountId,
          messageId,
          folderId,
          error: e instanceof Error ? e.message : String(e),
        });

        // If we are rate-limited, the queue processor will handle the delay
        if (isRateLimitError(e)) {
          throw e; // Re-throw to let queue processor handle it
        }
      }
    });
  });

  globalThis.__autoSortDaemonUnsubscribes.set(accountId, unsubscribe);
  console.log('[auto-sort-daemon] Watching account for new messages:', accountId);
}

async function startAutoSortDaemon(): Promise<void> {
  if (globalThis.__autoSortDaemonStarted) {
    return;
  }
  globalThis.__autoSortDaemonStarted = true;

  console.log('[auto-sort-daemon] Starting auto-sort daemon...');

  const refreshAccounts = async () => {
    try {
      const accountIds = new Set<string>();

      // Get accounts from OAuth tokens (OAuth-only mode)
      try {
        const tokenStore = new OAuthTokenStore();
        const tokens = await tokenStore.loadTokens();
        for (const accountId of tokens.keys()) {
          accountIds.add(accountId);
        }
      } catch (e) {
        console.error('[auto-sort-daemon] Failed to load OAuth tokens:', e);
      }

      if (accountIds.size === 0) {
        console.log('[auto-sort-daemon] No accounts found to watch');
        return;
      }

      console.log(`[auto-sort-daemon] Found ${accountIds.size} account(s) to watch`);

      for (const accountId of accountIds) {
        try {
          await startWatchingAccount(accountId);
        } catch (e) {
          console.error('[auto-sort-daemon] Failed to start watcher for account:', accountId, e);
        }
      }
    } catch (e) {
      console.error('[auto-sort-daemon] Failed to refresh accounts:', e);
    }
  };

  // Start immediately + refresh periodically (new accounts could be added).
  await refreshAccounts();
  setInterval(refreshAccounts, 60_000);

  // Process pending filter jobs every 30 seconds
  const processJobs = async () => {
    try {
      await processJobQueue();
    } catch (error) {
      console.error('[auto-sort-daemon] Error in job processing:', error);
    }
  };

  // Start job processing immediately and then periodically
  void processJobs();
  setInterval(processJobs, 30_000);

  // Cleanup old completed/failed jobs once per day
  setInterval(() => {
    void cleanupOldJobs();
  }, 24 * 60 * 60 * 1000);
}

export { startAutoSortDaemon };
