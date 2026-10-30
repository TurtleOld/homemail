import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('storage read-modify-write lock', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-storage-lock-test-'));
    process.env.DATA_DIR = dataDir;
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('keeps both records when two transactions change one collection concurrently', async () => {
    const { readStorage, writeStorage, withStorageLock } = await import('@/lib/storage');
    const key = 'contacts:account-1';

    const addContact = (id: string, gapMs: number) =>
      withStorageLock(key, async () => {
        const contacts = await readStorage<Array<{ id: string }>>(key, []);
        await sleep(gapMs);
        contacts.push({ id });
        await writeStorage(key, contacts);
      });

    await Promise.all([addContact('first', 20), addContact('second', 0)]);

    const stored = await readStorage<Array<{ id: string }>>(key, []);
    expect(stored.map((contact) => contact.id).sort()).toEqual(['first', 'second']);
  });

  it('serializes the uniqueness check with the write', async () => {
    const { readStorage, writeStorage, withStorageLock } = await import('@/lib/storage');
    const key = 'contacts:account-1';

    const addUnique = (email: string) =>
      withStorageLock(key, async () => {
        const contacts = await readStorage<Array<{ email: string }>>(key, []);
        await sleep(10);
        if (contacts.some((contact) => contact.email === email)) {
          return false;
        }
        contacts.push({ email });
        await writeStorage(key, contacts);
        return true;
      });

    const results = await Promise.all([addUnique('same@example.test'), addUnique('same@example.test')]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const stored = await readStorage<Array<{ email: string }>>(key, []);
    expect(stored).toHaveLength(1);
  });

  it('releases the lock after a failed transaction', async () => {
    const { withStorageLock } = await import('@/lib/storage');
    const key = 'labels:account-1';

    await expect(
      withStorageLock(key, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    await expect(withStorageLock(key, async () => 'next')).resolves.toBe('next');
  });

  it('does not remove an old lock whose owner is still alive', async () => {
    const { withStorageLock } = await import('@/lib/storage');
    const key = 'contacts:account-1';
    const lockPath = path.join(dataDir, 'contacts_account-1.json.lock');
    const ownerToken = `${process.pid}:other-request`;
    await fs.writeFile(lockPath, ownerToken, 'utf-8');
    const longAgo = new Date(Date.now() - 60_000);
    await fs.utimes(lockPath, longAgo, longAgo);

    const transaction = withStorageLock(key, async () => 'ran');
    await sleep(150);

    await expect(fs.readFile(lockPath, 'utf-8')).resolves.toBe(ownerToken);

    await fs.unlink(lockPath);
    await expect(transaction).resolves.toBe('ran');
  });

  it('reclaims a lock left by a process that no longer runs', async () => {
    const { withStorageLock } = await import('@/lib/storage');
    const key = 'templates:account-1';
    const lockPath = path.join(dataDir, 'templates_account-1.json.lock');

    const child = spawn(process.execPath, ['-e', '']);
    await once(child, 'exit');
    await fs.writeFile(lockPath, `${child.pid}:crashed-writer`, 'utf-8');

    await expect(withStorageLock(key, async () => 'ran')).resolves.toBe('ran');
    await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 10_000);
});
