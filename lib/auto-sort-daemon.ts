import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { processNewMessage } from '@/lib/process-new-message';
import { sendPushNotification } from '@/lib/ntfy';
import { OAuthTokenStore } from '@/lib/oauth-token-store';
import { getPendingJobs, markJobProcessing, markJobCompleted, markJobFailed, cleanupOldJobs } from '@/lib/filter-job-queue';
import { readStorage, writeStorage } from '@/lib/storage';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AutoSortRule } from '@/lib/types';
import { checkMessageMatchesRule, applyRuleActions } from '@/lib/apply-auto-sort-rules';

type Unsubscribe = () => void;

declare global {
  var __autoSortDaemonStarted: boolean | undefined;
  var __autoSortDaemonUnsubscribes: Map<string, Unsubscribe> | undefined;
  var __autoSortDaemonQueues: Map<string, Array<() => Promise<void>>> | undefined;
  var __autoSortDaemonProcessing: Map<string, boolean> | undefined;
}

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('429') || msg.toLowerCase().includes('too many');
}

const EXCLUDED_FOLDER_ROLES = new Set(['sent', 'trash', 'drafts']);
const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');

// v2: previous implementation could mark messages as "sent" before the actual
// HTTP call succeeded, which could permanently suppress notifications.
// Use a new key to avoid legacy false-positives.
const PUSH_SENT_KEY = 'pushSentMessages_v2';
const PUSH_SENT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PUSH_SENT_MAX = 20_000;
const PUSH_SENT_CACHE_TTL_MS = 30_000;
const PUSH_INFLIGHT_KEY = 'pushInFlightMessages_v2';
const PUSH_INFLIGHT_TTL_MS = 2 * 60 * 1000; // 2 minutes

let pushSentCache:
  | {
    loadedAt: number;
    map: Record<string, number>;
  }
  | null = null;

let pushInFlightCache:
  | {
    loadedAt: number;
    map: Record<string, number>;
  }
  | null = null;

async function loadPushSentMap(): Promise<Record<string, number>> {
  const now = Date.now();
  if (pushSentCache && now - pushSentCache.loadedAt < PUSH_SENT_CACHE_TTL_MS) {
    return pushSentCache.map;
  }
  const map = await readStorage<Record<string, number>>(PUSH_SENT_KEY, {});
  pushSentCache = { loadedAt: now, map };
  return map;
}

async function loadPushInFlightMap(): Promise<Record<string, number>> {
  const now = Date.now();
  if (pushInFlightCache && now - pushInFlightCache.loadedAt < PUSH_SENT_CACHE_TTL_MS) {
    return pushInFlightCache.map;
  }
  const map = await readStorage<Record<string, number>>(PUSH_INFLIGHT_KEY, {});
  pushInFlightCache = { loadedAt: now, map };
  return map;
}

function cleanupPushSentMap(map: Record<string, number>): Record<string, number> {
  const now = Date.now();
  const cutoff = now - PUSH_SENT_TTL_MS;
  const entries = Object.entries(map)
    .filter(([, ts]) => typeof ts === 'number' && ts > cutoff)
    .sort((a, b) => b[1] - a[1])
    .slice(0, PUSH_SENT_MAX);
  const cleaned: Record<string, number> = {};
  for (const [k, ts] of entries) cleaned[k] = ts;
  return cleaned;
}

function cleanupInFlightMap(map: Record<string, number>): Record<string, number> {
  const now = Date.now();
  const cutoff = now - PUSH_INFLIGHT_TTL_MS;
  const entries = Object.entries(map)
    .filter(([, ts]) => typeof ts === 'number' && ts > cutoff)
    .sort((a, b) => b[1] - a[1]);
  const cleaned: Record<string, number> = {};
  for (const [k, ts] of entries) cleaned[k] = ts;
  return cleaned;
}

async function acquirePushLock(key: string): Promise<boolean> {
  // 1) If already sent → never send again.
  const sent = await loadPushSentMap();
  const sentTs = sent[key];
  if (typeof sentTs === 'number' && Date.now() - sentTs < PUSH_SENT_TTL_MS) {
    return false;
  }

  // 2) If someone is sending right now → skip.
  const inFlight = await loadPushInFlightMap();
  const lockTs = inFlight[key];
  if (typeof lockTs === 'number' && Date.now() - lockTs < PUSH_INFLIGHT_TTL_MS) {
    return false;
  }

  // 3) Claim lock (best-effort).
  inFlight[key] = Date.now();
  const cleaned = cleanupInFlightMap(inFlight);
  await writeStorage(PUSH_INFLIGHT_KEY, cleaned);
  pushInFlightCache = { loadedAt: Date.now(), map: cleaned };
  return true;
}

async function markPushSent(key: string): Promise<void> {
  const sent = await loadPushSentMap();
  sent[key] = Date.now();
  const cleaned = cleanupPushSentMap(sent);
  await writeStorage(PUSH_SENT_KEY, cleaned);
  pushSentCache = { loadedAt: Date.now(), map: cleaned };

  // Release lock if present.
  const inFlight = await loadPushInFlightMap();
  if (key in inFlight) {
    delete inFlight[key];
    const cleanedInFlight = cleanupInFlightMap(inFlight);
    await writeStorage(PUSH_INFLIGHT_KEY, cleanedInFlight);
    pushInFlightCache = { loadedAt: Date.now(), map: cleanedInFlight };
  }
}

async function releasePushLock(key: string): Promise<void> {
  const inFlight = await loadPushInFlightMap();
  if (!(key in inFlight)) return;
  delete inFlight[key];
  const cleaned = cleanupInFlightMap(inFlight);
  await writeStorage(PUSH_INFLIGHT_KEY, cleaned);
  pushInFlightCache = { loadedAt: Date.now(), map: cleaned };
}

// Backwards-compatible name (used below): kept as wrapper.
async function reservePushOnce(key: string): Promise<boolean> {
  return acquirePushLock(key);
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

    const hasOnlyMoveAction = rule.actions.length === 1 && moveToFolderAction != null;
    const nonMoveActions = rule.actions.filter((a) => a.type !== 'moveToFolder');

    const foldersToSearch = folders.filter((f) => {
      if (f.role === 'trash' || f.role === 'sent' || f.role === 'drafts') {
        return false;
      }
      if (isDeletedFolderName(f.name)) {
        return false;
      }
      if (hasOnlyMoveAction && destinationFolderId && f.id === destinationFolderId) {
        return false;
      }
      return true;
    });

    console.log(`[auto-sort-daemon] Job ${jobId}: Processing ${foldersToSearch.length} folders`);

    let totalProcessed = 0;
    let totalApplied = 0;
    const BATCH_MOVE_SIZE = 50;

    for (const folder of foldersToSearch) {
      try {
        console.log(`[auto-sort-daemon] Job ${jobId}: Processing folder ${folder.name}`);

        let cursor: string | undefined;
        let hasMore = true;

        while (hasMore) {
          const result = await provider.getMessages(accountId, folder.id, {
            limit: 500,
            ...(cursor ? { cursor } : {}),
          });

          if (!result || !result.messages || result.messages.length === 0) {
            break;
          }

          const messages = result.messages;
          hasMore = !!result.nextCursor;
          cursor = result.nextCursor;

          const matchedIds: string[] = [];

          for (const message of messages) {
            try {
              const matches = await checkMessageMatchesRule(message, rule, provider, accountId, folder.id);
              if (matches) {
                matchedIds.push(message.id);
              }
              totalProcessed++;
            } catch (error) {
              console.error(`[auto-sort-daemon] Job ${jobId}: Error checking message ${message.id}:`, error);
              if (isRateLimitError(error)) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            }
          }

          if (matchedIds.length === 0) {
            continue;
          }

          console.log(`[auto-sort-daemon] Job ${jobId}: ${matchedIds.length} messages matched in folder ${folder.name}`);

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
                console.error(`[auto-sort-daemon] Job ${jobId}: Batch move failed, falling back to individual:`, error);
                if (isRateLimitError(error)) {
                  await new Promise((resolve) => setTimeout(resolve, 3000));
                }
                for (const id of batch) {
                  try {
                    await provider.bulkUpdateMessages(accountId, {
                      ids: [id],
                      action: 'move',
                      payload: { folderId: destinationFolderId },
                    });
                    totalApplied++;
                  } catch (innerError) {
                    console.error(`[auto-sort-daemon] Job ${jobId}: Individual move failed for ${id}:`, innerError);
                  }
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }
              }
              if (i + BATCH_MOVE_SIZE < matchedIds.length) {
                await new Promise((resolve) => setTimeout(resolve, 300));
              }
            }
          }

          // Apply non-move actions individually (markRead, markImportant, etc.)
          if (nonMoveActions.length > 0) {
            for (const id of matchedIds) {
              try {
                for (const action of nonMoveActions) {
                  switch (action.type) {
                    case 'markRead':
                      await provider.updateMessageFlags(accountId, id, { unread: false });
                      break;
                    case 'markImportant':
                      await provider.updateMessageFlags(accountId, id, { starred: true });
                      break;
                    case 'delete':
                      await provider.bulkUpdateMessages(accountId, { ids: [id], action: 'delete' });
                      break;
                  }
                }
                if (!destinationFolderId) {
                  totalApplied++;
                }
              } catch (error) {
                console.error(`[auto-sort-daemon] Job ${jobId}: Error applying non-move action for ${id}:`, error);
              }
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          }

          // Delay between pages
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        // Delay between folders
        await new Promise((resolve) => setTimeout(resolve, 300));
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

  // Only send push notifications for messages received after daemon startup.
  // On restart, syncMessages catches up on all changes since last state —
  // these are old messages that shouldn't trigger push.
  const daemonStartedAt = Date.now();

  const provider = process.env.MAIL_PROVIDER === 'stalwart'
    ? getMailProviderForAccount(accountId)
    : getMailProvider();

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

  let accountEmail = accountId;
  try {
    const account = await provider.getAccount(accountId);
    if (account?.email) accountEmail = account.email;
  } catch (e) {
    console.error('[auto-sort-daemon] Failed to load account email for:', accountId, e);
  }
  console.log('[auto-sort-daemon] Push target accountId:', accountId, 'email:', accountEmail);

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

        // Skip push for messages received before daemon startup (catch-up after restart).
        const messageTs = new Date(message.date).getTime();
        if (messageTs < daemonStartedAt) {
          return;
        }

        const pushKey = `${accountId}:${message.id}`;
        const reserved = await reservePushOnce(pushKey);
        if (reserved) {
          try {
            console.log('[auto-sort-daemon] Sending push to:', accountEmail, 'subject:', message.subject);
            await sendPushNotification({
              accountId,
              messageId: message.id,
              subject: message.subject,
              fromName: message.from.name || message.from.email,
            });
            await markPushSent(pushKey);
            console.log('[auto-sort-daemon] Push sent OK:', message.id);
          } catch (pushError) {
            console.error('[auto-sort-daemon] Push send FAILED:', pushError);
            await releasePushLock(pushKey);
            throw pushError;
          }
        }
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

      // Get accounts from OAuth tokens (OAuth-only mode).
      // Invalidate cache first — tokens may have been saved by a different
      // Next.js worker or process since our last check.
      try {
        const tokenStore = new OAuthTokenStore();
        tokenStore.invalidateCache();
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

  // Process pending filter jobs every 10 seconds
  const processJobs = async () => {
    try {
      await processJobQueue();
    } catch (error) {
      console.error('[auto-sort-daemon] Error in job processing:', error);
    }
  };

  // Start job processing immediately and then periodically
  void processJobs();
  setInterval(processJobs, 10_000);

  // Periodic full-scan fallback: every 10 minutes run rules over all folders
  // for all accounts. This catches messages that slipped through the real-time
  // subscription (e.g. messages delivered during a polling gap or timeout).
  const runFullScan = async () => {
    try {
      const { processAutoSortRules } = await import('@/scripts/process-auto-sort-rules');
      await processAutoSortRules();
    } catch (error) {
      console.error('[auto-sort-daemon] Error in periodic full-scan:', error);
    }
  };

  // First full-scan after 2 minutes (give the server time to settle on startup),
  // then every 10 minutes.
  setTimeout(() => {
    void runFullScan();
    setInterval(runFullScan, 10 * 60 * 1000);
  }, 2 * 60 * 1000);

  // Cleanup old completed/failed jobs once per day
  setInterval(() => {
    void cleanupOldJobs();
  }, 24 * 60 * 60 * 1000);
}

export { startAutoSortDaemon };
