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

  it('serializes concurrent saves for different accounts', async () => {
    const store = await loadStore();
    const otherAccountId = 'other@example.test';
    const realWriteFile = fs.writeFile.bind(fs);
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let writeCalls = 0;

    vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
      writeCalls += 1;
      if (writeCalls === 1) {
        markFirstStarted();
        await firstGate;
      }
      return (realWriteFile as (...params: typeof args) => Promise<void>)(...args);
    });

    const first = store.setAccountSettings(accountId, { theme: 'dark' });
    await firstStarted;
    const second = store.setAccountSettings(otherAccountId, { theme: 'light' });

    // Give the second save every chance to write before the first is released.
    // A serialized implementation keeps it queued, so only the timeout wins.
    await Promise.race([second, new Promise((resolve) => setTimeout(resolve, 50))]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(await readSettingsFile()).toEqual({
      [accountId]: { theme: 'dark' },
      [otherAccountId]: { theme: 'light' },
    });
    await expect(store.getAccountSettings(accountId)).resolves.toMatchObject({ theme: 'dark' });
    await expect(store.getAccountSettings(otherAccountId)).resolves.toMatchObject({ theme: 'light' });
  });

  it('keeps the save queue running after a failed write', async () => {
    const store = await loadStore();
    const otherAccountId = 'other@example.test';

    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));

    await expect(store.setAccountSettings(accountId, { theme: 'dark' })).rejects.toThrow('disk full');
    await store.setAccountSettings(otherAccountId, { theme: 'light' });

    expect(await readSettingsFile()).toEqual({ [otherAccountId]: { theme: 'light' } });
    await expect(store.getAccountSettings(otherAccountId)).resolves.toMatchObject({ theme: 'light' });
  });
});
