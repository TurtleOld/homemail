import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getSession } from '@/lib/session';
import { getMailProviderForAccount } from '@/lib/get-provider';
import { convertRulesToSieve } from '@/lib/auto-sort-to-sieve';
import type { AutoSortRule } from '@/lib/types';
import type { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';

const SCRIPT_NAME = 'mailclient-auto-sort';
const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');

async function loadEnabledRules(accountId: string): Promise<AutoSortRule[]> {
  try {
    const data = await readFile(rulesFilePath, 'utf-8');
    const allRules = JSON.parse(data) as Record<string, AutoSortRule[]>;
    return (allRules[accountId] || []).filter((r) => r.enabled);
  } catch {
    return [];
  }
}

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId } = session;

    // Only StalwartJMAP provider supports Sieve
    const provider = getMailProviderForAccount(accountId);
    const sieveProvider = provider as StalwartJMAPProvider;
    if (typeof sieveProvider.getSieveScripts !== 'function') {
      return NextResponse.json({ success: false, reason: 'not_supported' });
    }

    // Load enabled rules and folders in parallel
    const [rules, folders] = await Promise.all([
      loadEnabledRules(accountId),
      provider.getFolders(accountId),
    ]);

    const folderMap = new Map(folders.map((f) => [f.id, f.name]));
    const getFolderName = (id: string) => folderMap.get(id);

    const script = convertRulesToSieve(rules, getFolderName);

    // Find the existing managed script (if any)
    const existingScripts = await sieveProvider.getSieveScripts(accountId);
    const existing = existingScripts.find((s) => s.name === SCRIPT_NAME);

    await sieveProvider.createOrUpdateSieveScript({
      accountId,
      existingId: existing?.id,
      name: SCRIPT_NAME,
      content: script,
      activate: true,
    });

    console.log(`[sync-sieve] Synced ${rules.length} rule(s) for account ${accountId}`);

    return NextResponse.json({ success: true, ruleCount: rules.length, script });
  } catch (error) {
    console.error('[sync-sieve] Error syncing rules to Sieve:', error);
    return NextResponse.json(
      { error: 'Failed to sync rules to Sieve', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
