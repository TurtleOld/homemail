import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('storage read failures', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-storage-read-test-'));
    process.env.DATA_DIR = dataDir;
    process.env.SESSION_SECRET = 'x'.repeat(32);
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('returns the default value only when the file does not exist', async () => {
    const { readStorage, readEncryptedStorage } = await import('@/lib/storage');

    await expect(readStorage('contacts:account-1', [])).resolves.toEqual([]);
    await expect(readEncryptedStorage('pgpKeys:account-1', [])).resolves.toEqual([]);
  });

  it('throws instead of returning the default for corrupt JSON', async () => {
    const file = path.join(dataDir, 'contacts_account-1.json');
    await fs.writeFile(file, '[{"id":"keep"');

    const { readStorage } = await import('@/lib/storage');

    await expect(readStorage('contacts:account-1', [])).rejects.toThrow(/contacts:account-1/);
    expect(await fs.readFile(file, 'utf-8')).toBe('[{"id":"keep"');
  });

  it('throws on a filesystem error other than ENOENT', async () => {
    await fs.mkdir(path.join(dataDir, 'contacts_account-1.json'));

    const { readStorage } = await import('@/lib/storage');

    await expect(readStorage('contacts:account-1', [])).rejects.toThrow(/EISDIR/);
  });

  it('throws for an encrypted file that no longer decrypts', async () => {
    const file = path.join(dataDir, 'pgpKeys_account-1.json');
    await fs.writeFile(file, 'not-a-valid-encrypted-payload');

    const { readEncryptedStorage } = await import('@/lib/storage');

    await expect(readEncryptedStorage('pgpKeys:account-1', [])).rejects.toThrow(
      /pgpKeys:account-1/,
    );
    expect(await fs.readFile(file, 'utf-8')).toBe('not-a-valid-encrypted-payload');
  });
});
