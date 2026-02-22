/**
 * Core logic for syncing AutoSortRules to a managed Sieve script.
 * Extracted so it can be called directly (without an HTTP round-trip)
 * from other server-side code, e.g. after saving/deleting a rule.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { getMailProviderForAccount } from '@/lib/get-provider';
import { convertRulesToSieve } from '@/lib/auto-sort-to-sieve';
import type { AutoSortRule } from '@/lib/types';
import type { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';

export const SIEVE_SCRIPT_NAME = 'mailclient-auto-sort';

const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');

// Per-account mutex: if a sync is already in progress, queue at most one
// additional run instead of spawning duplicate concurrent requests.
const syncInProgress = new Map<string, Promise<{ success: boolean; ruleCount?: number; reason?: string }>>();
const syncPending = new Map<string, boolean>();

async function loadEnabledRules(accountId: string): Promise<AutoSortRule[]> {
  try {
    const data = await readFile(rulesFilePath, 'utf-8');
    const allRules = JSON.parse(data) as Record<string, AutoSortRule[]>;
    return (allRules[accountId] || []).filter((r) => r.enabled);
  } catch {
    return [];
  }
}

async function doSync(accountId: string): Promise<{ success: boolean; ruleCount?: number; reason?: string }> {
  const provider = getMailProviderForAccount(accountId);
  const sieveProvider = provider as StalwartJMAPProvider;

  if (typeof sieveProvider.getSieveScripts !== 'function') {
    return { success: false, reason: 'not_supported' };
  }

  const [rules, folders] = await Promise.all([
    loadEnabledRules(accountId),
    provider.getFolders(accountId),
  ]);

  const folderMap = new Map(folders.map((f) => [f.id, f.name]));
  const script = convertRulesToSieve(rules, (id) => folderMap.get(id));

  const existingScripts = await sieveProvider.getSieveScripts(accountId);
  const existing = existingScripts.find((s) => s.name === SIEVE_SCRIPT_NAME);

  await sieveProvider.createOrUpdateSieveScript({
    accountId,
    existingId: existing?.id,
    name: SIEVE_SCRIPT_NAME,
    content: script,
    activate: true,
  });

  console.log(`[sync-sieve] Synced ${rules.length} rule(s) for account ${accountId}`);
  return { success: true, ruleCount: rules.length };
}

export async function syncRulesToSieve(accountId: string): Promise<{ success: boolean; ruleCount?: number; reason?: string }> {
  // If a sync is already running, mark that another one is needed and wait for
  // the current one to finish — then run once more to pick up the latest state.
  const running = syncInProgress.get(accountId);
  if (running) {
    syncPending.set(accountId, true);
    await running;
    // If we were the first to notice pending, run a follow-up sync.
    if (syncPending.get(accountId)) {
      syncPending.delete(accountId);
      return syncRulesToSieve(accountId);
    }
    return { success: true };
  }

  const promise = doSync(accountId).finally(() => {
    syncInProgress.delete(accountId);
  });
  syncInProgress.set(accountId, promise);
  return promise;
}
