import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('storage key validation', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-storage-test-'));
    process.env.DATA_DIR = dataDir;
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('accepts and round-trips a real email-shaped accountId key', async () => {
    const { readStorage, writeStorage } = await import('@/lib/storage');
    const key = 'messageLabels:admin@rem.ru';
    await writeStorage(key, { msg1: ['important'] });
    const result = await readStorage<Record<string, string[]>>(key, {});
    expect(result).toEqual({ msg1: ['important'] });
  });

  it('accepts and round-trips an accountId with a plus tag', async () => {
    const { readStorage, writeStorage } = await import('@/lib/storage');
    const key = 'messageLabels:user+home@example.org';
    await writeStorage(key, { msg1: ['important'] });
    const result = await readStorage<Record<string, string[]>>(key, {});
    expect(result).toEqual({ msg1: ['important'] });
    const expectedPath = path.join(dataDir, 'messageLabels_user+home@example.org.json');
    await expect(fs.readFile(expectedPath, 'utf-8')).resolves.toContain('important');
  });

  it('rejects keys containing a path traversal sequence', async () => {
    const { writeStorage } = await import('@/lib/storage');
    await expect(writeStorage('messageLabels:../../etc/passwd', {})).rejects.toThrow(
      'Invalid storage key'
    );
  });

  it('rejects traversal sequences combined with a plus tag', async () => {
    const { writeStorage } = await import('@/lib/storage');
    for (const key of [
      'messageLabels:user+home@example.org/../../etc/passwd',
      'messageLabels:user+home@example.org\\..\\..\\etc\\passwd',
      'messageLabels:..+home@example.org',
      'messageLabels:user+home@example.org%2F..%2Fetc',
    ]) {
      await expect(writeStorage(key, {})).rejects.toThrow('Invalid storage key');
    }
  });

  it('rejects keys containing a path separator', async () => {
    const { writeStorage } = await import('@/lib/storage');
    await expect(writeStorage('messageLabels:foo/bar', {})).rejects.toThrow(
      'Invalid storage key'
    );
  });

  it('preserves the pre-existing filename scheme for keys with only colons', async () => {
    const { readStorage, writeStorage } = await import('@/lib/storage');
    await writeStorage('messageLabels:admin@rem.ru', { msg1: ['important'] });
    const expectedPath = path.join(dataDir, 'messageLabels_admin@rem.ru.json');
    const raw = await fs.readFile(expectedPath, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ msg1: ['important'] });
    const result = await readStorage<Record<string, string[]>>('messageLabels:admin@rem.ru', {});
    expect(result).toEqual({ msg1: ['important'] });
  });
});
