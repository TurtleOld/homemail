import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import type { AutoSortRule } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkMatch: vi.fn(),
  applyActions: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/apply-auto-sort-rules', () => ({
  checkMessageMatchesRule: mocks.checkMatch,
  applyRuleActions: mocks.applyActions,
}));

const repoRoot = process.cwd();

// Rules come back from JSON with ISO strings, not Date instances.
const rule = {
  id: 'rule-1',
  name: 'Newsletters',
  enabled: true,
  conditions: { logic: 'AND', conditions: [] },
  actions: [{ type: 'moveToFolder', folderId: 'archive' }],
  priority: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as AutoSortRule;

describe('filter rules store', () => {
  let root: string;
  let dataDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-rules-test-'));
    dataDir = path.join(root, 'storage');
    process.env.DATA_DIR = dataDir;
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    vi.resetModules();
    mocks.getSession.mockResolvedValue({ accountId: 'account-1' });
    mocks.checkMatch.mockResolvedValue(true);
    mocks.applyActions.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.DATA_DIR;
    await fs.rm(root, { recursive: true, force: true });
  });

  it('round-trips rules through DATA_DIR', async () => {
    const { loadRules, saveRules } = await import('@/lib/filter-rules-store');

    await saveRules('account-1', [rule]);

    await expect(loadRules('account-1')).resolves.toEqual([rule]);
    const stored = JSON.parse(
      await fs.readFile(path.join(dataDir, 'filter-rules.json'), 'utf-8')
    );
    expect(stored['account-1']).toHaveLength(1);
  });

  it('is what the rules route returns', async () => {
    const { saveRules } = await import('@/lib/filter-rules-store');
    await saveRules('account-1', [rule]);

    const { GET } = await import('@/app/api/mail/filters/rules/route');
    const response = await GET(
      new NextRequest('https://app.example.test/api/mail/filters/rules')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([rule]);
  });

  it('is what processNewMessage applies', async () => {
    const { saveRules } = await import('@/lib/filter-rules-store');
    await saveRules('account-1', [rule]);

    const { processNewMessage } = await import('@/lib/process-new-message');
    const provider = {
      getFolders: vi.fn().mockResolvedValue([{ id: 'inbox', role: 'inbox' }]),
    };
    await processNewMessage(
      { id: 'message-1', date: '2026-01-02T00:00:00.000Z' } as never,
      'account-1',
      'inbox',
      provider as never
    );

    expect(mocks.checkMatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'message-1' }),
      rule,
      provider,
      'account-1',
      'inbox'
    );
    expect(mocks.applyActions).toHaveBeenCalledWith(
      'message-1',
      rule,
      provider,
      'account-1'
    );
  });

  it('reads the legacy data/filter-rules.json format and migrates it to DATA_DIR', async () => {
    await fs.mkdir(path.join(root, 'data'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'data', 'filter-rules.json'),
      JSON.stringify({ 'legacy-account': [rule] }),
      'utf-8'
    );

    const { loadRules } = await import('@/lib/filter-rules-store');

    await expect(loadRules('legacy-account')).resolves.toEqual([rule]);
    const migrated = JSON.parse(
      await fs.readFile(path.join(dataDir, 'filter-rules.json'), 'utf-8')
    );
    expect(migrated['legacy-account']).toHaveLength(1);
  });

  it('still reads legacy rules when DATA_DIR cannot be written', async () => {
    await fs.mkdir(path.join(root, 'data'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'data', 'filter-rules.json'),
      JSON.stringify({ 'legacy-account': [rule] }),
      'utf-8'
    );
    // A file where the data directory should be makes every write fail with
    // ENOTDIR while reads of the legacy file keep working.
    await fs.writeFile(path.join(root, 'read-only'), 'not a directory', 'utf-8');
    process.env.DATA_DIR = path.join(root, 'read-only', 'storage');

    const { loadRules } = await import('@/lib/filter-rules-store');

    await expect(loadRules('legacy-account')).resolves.toEqual([rule]);
  });

  it('does not resurrect legacy rules for an account whose rules were deleted', async () => {
    await fs.mkdir(path.join(root, 'data'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'data', 'filter-rules.json'),
      JSON.stringify({ 'legacy-account': [rule] }),
      'utf-8'
    );

    const { loadRules, saveRules } = await import('@/lib/filter-rules-store');
    await saveRules('legacy-account', []);

    await expect(loadRules('legacy-account')).resolves.toEqual([]);
  });

  it('leaves no private copies of the rules file behind', async () => {
    const consumers = [
      'app/api/mail/filters/rules/route.ts',
      'app/api/mail/filters/rules/apply/route.ts',
      'app/api/mail/filters/rules/process-message/route.ts',
      'app/api/mail/archive/route.ts',
      'lib/process-new-message.ts',
      'lib/auto-sort-daemon.ts',
      'lib/sync-rules-to-sieve.ts',
      'scripts/process-auto-sort-rules.ts',
    ];

    for (const consumer of consumers) {
      const source = await fs.readFile(path.join(repoRoot, consumer), 'utf-8');
      expect(source, consumer).not.toContain('filter-rules.json');
      expect(source, consumer).not.toContain('filterRules:');
    }
  });
});
