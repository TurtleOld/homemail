import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = `${process.env.TMPDIR || '/tmp'}/homemail-settings-store-${process.pid}-${Date.now()}`;
process.env.DATA_DIR = dataDir;

const settingsFile = path.join(dataDir, '.settings.json');
const accountId = 'user@example.test';

async function loadStore() {
  vi.resetModules();
  return import('@/lib/settings-store');
}

async function readSettingsFile() {
  return JSON.parse(await fs.readFile(settingsFile, 'utf-8'));
}

describe('settings store persistence', () => {
  beforeEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.mkdir(dataDir, { recursive: true });
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('writes through a temporary file and leaves no temporary file behind', async () => {
    const store = await loadStore();

    await store.setAccountSettings(accountId, { theme: 'dark' });

    expect(await readSettingsFile()).toEqual({ [accountId]: { theme: 'dark' } });
    expect(await fs.readdir(dataDir)).toEqual(['.settings.json']);
  });

  it('keeps the previous file and cache when the write fails', async () => {
    const previous = { accountId, theme: 'light', signature: 'old' };
    await fs.writeFile(settingsFile, JSON.stringify({ [accountId]: previous }, null, 2), 'utf-8');

    const store = await loadStore();
    await expect(store.getAccountSettings(accountId)).resolves.toMatchObject({ theme: 'light' });

    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));

    await expect(store.setAccountSettings(accountId, { theme: 'dark' })).rejects.toThrow('disk full');

    expect(await store.getAccountSettings(accountId)).toMatchObject({ theme: 'light', signature: 'old' });
    expect(await readSettingsFile()).toMatchObject({ [accountId]: { theme: 'light', signature: 'old' } });
  });
});
