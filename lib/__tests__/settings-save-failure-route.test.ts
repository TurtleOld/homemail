import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const dataDir = `${process.env.TMPDIR || '/tmp'}/homemail-settings-route-${process.pid}-${Date.now()}`;
  process.env.DATA_DIR = dataDir;
  return {
    dataDir,
    getSession: vi.fn(),
  };
});

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/get-provider', () => ({ getMailProviderForAccount: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from '@/app/api/settings/route';

const accountId = 'user@example.test';
const settingsFile = path.join(mocks.dataDir, '.settings.json');

function request(method: string, body?: unknown) {
  return new NextRequest('https://app.example.test/api/settings', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('POST /api/settings when the file cannot be written', () => {
  beforeAll(async () => {
    await fs.mkdir(mocks.dataDir, { recursive: true });
    await fs.writeFile(
      settingsFile,
      JSON.stringify({ [accountId]: { theme: 'light', signature: 'old' } }, null, 2),
      'utf-8'
    );
  });

  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ accountId, email: accountId });
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await fs.rm(mocks.dataDir, { recursive: true, force: true });
  });

  it('returns an error instead of the unsaved value and keeps the old file', async () => {
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));

    const response = await POST(request('POST', { theme: 'dark' }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });

    const stored = JSON.parse(await fs.readFile(settingsFile, 'utf-8'));
    expect(stored[accountId]).toMatchObject({ theme: 'light', signature: 'old' });

    const getResponse = await GET(request('GET'));
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toMatchObject({ theme: 'light', signature: 'old' });
  });
});
