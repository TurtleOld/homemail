import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { readStorage, writeStorage, StorageReadError } from '@/lib/storage';
import type { AutoSortRule } from '@/lib/types';

/**
 * Same on-disk name the pre-#100 code used, so installs that keep DATA_DIR at
 * the default `./data` need no migration at all — and existing backups that
 * already list `filter-rules.json` keep working.
 */
const RULES_STORAGE_KEY = 'filter-rules';

/**
 * Location every pre-#100 consumer read from, regardless of DATA_DIR. Rules are
 * migrated from here on first read when DATA_DIR points somewhere else.
 */
const LEGACY_RULES_FILE = path.join(process.cwd(), 'data', 'filter-rules.json');

type RulesByAccount = Record<string, AutoSortRule[]>;

/**
 * Read the legacy `data/filter-rules.json` file, if present.
 *
 * @returns Rules grouped by account id; an empty object when the file is
 *   missing, unreadable, or not shaped like the legacy format.
 */
async function readLegacyRules(): Promise<RulesByAccount> {
  try {
    const data = await readFile(LEGACY_RULES_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const legacy: RulesByAccount = {};
    for (const [accountId, rules] of Object.entries(parsed)) {
      if (Array.isArray(rules)) {
        legacy[accountId] = rules as AutoSortRule[];
      }
    }
    return legacy;
  } catch {
    return {};
  }
}

/**
 * Load every account's rules from the shared storage slot, transparently
 * merging accounts that still live only in the legacy file.
 *
 * Accounts already present in the storage slot win: a user who deleted all
 * their rules has an explicit empty array there, and must not have the old
 * file resurrect them.
 *
 * An `ENOTDIR` read means DATA_DIR is not a directory, so the storage slot
 * cannot exist and only the legacy file can hold rules. Other read failures
 * (corrupt JSON, permissions) propagate: falling back would let the next save
 * replace a slot this process never read.
 *
 * @returns Rules grouped by account id.
 */
async function loadAllRules(): Promise<RulesByAccount> {
  let stored: RulesByAccount;
  try {
    stored = await readStorage<RulesByAccount>(RULES_STORAGE_KEY, {});
  } catch (error) {
    if (!(error instanceof StorageReadError) || error.code !== 'ENOTDIR') throw error;
    stored = {};
  }
  const legacy = await readLegacyRules();

  let migrated = false;
  for (const [accountId, rules] of Object.entries(legacy)) {
    if (!Object.prototype.hasOwnProperty.call(stored, accountId)) {
      stored[accountId] = rules;
      migrated = true;
    }
  }

  if (migrated) {
    try {
      await writeStorage(RULES_STORAGE_KEY, stored);
    } catch {
      // The copy is best effort: callers still get the legacy rules from
      // memory, and the next read retries. Failing the read here would break
      // rule loading on an install whose DATA_DIR is not writable, which
      // worked before rules moved into the storage slot.
    }
  }

  return stored;
}

/**
 * Load auto-sort rules for one account.
 *
 * @param accountId Mailbox account id.
 * @returns The account's rules, or an empty array when none are stored.
 */
export async function loadRules(accountId: string): Promise<AutoSortRule[]> {
  const allRules = await loadAllRules();
  return allRules[accountId] ?? [];
}

/**
 * Persist auto-sort rules for one account without touching other accounts.
 *
 * @param accountId Mailbox account id.
 * @param rules Complete rule list for the account.
 */
export async function saveRules(accountId: string, rules: AutoSortRule[]): Promise<void> {
  const allRules = await loadAllRules();
  allRules[accountId] = rules;
  await writeStorage(RULES_STORAGE_KEY, allRules);
}
