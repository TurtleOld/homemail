import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));

function postContact(email: string) {
  return new NextRequest('https://app.example.test/api/contacts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

describe('contacts API against unreadable storage', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-contacts-storage-test-'));
    process.env.DATA_DIR = dataDir;
    process.env.SESSION_SECRET = 'x'.repeat(32);
    mocks.getSession.mockResolvedValue({ accountId: 'account-1' });
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    vi.resetAllMocks();
  });

  it('creates the first record when the collection file is absent', async () => {
    const { POST } = await import('@/app/api/contacts/route');

    const response = await POST(postContact('first@example.test'));

    expect(response.status).toBe(200);
    const stored = JSON.parse(
      await fs.readFile(path.join(dataDir, 'contacts_account-1.json'), 'utf-8'),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].email).toBe('first@example.test');
  });

  it('reports an operation error and keeps a corrupt collection intact', async () => {
    const file = path.join(dataDir, 'contacts_account-1.json');
    const corrupt = '[{"id":"existing","email":"keep@example.test"';
    await fs.writeFile(file, corrupt);

    const { POST } = await import('@/app/api/contacts/route');

    const response = await POST(postContact('new@example.test'));

    expect(response.status).toBe(500);
    expect(await fs.readFile(file, 'utf-8')).toBe(corrupt);
  });
});
