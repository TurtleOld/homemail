import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ACCOUNT_ID = 'owner@example.test';
const OTHER_ACCOUNT_ID = 'other@example.test';

async function importRoute() {
  const { GET, POST } = await import('@/app/api/backup/route');
  return { GET, POST };
}

async function importSettingsStore() {
  return import('@/lib/settings-store');
}

function restoreRequest(archive: ArrayBuffer): NextRequest {
  const file = {
    size: archive.byteLength,
    arrayBuffer: async () => archive,
  };
  return { formData: async () => ({ get: () => file }) } as unknown as NextRequest;
}

describe('backup settings slot', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-backup-settings-'));
    process.env.DATA_DIR = dataDir;
    vi.resetModules();
    mocks.getSession.mockResolvedValue({ accountId: ACCOUNT_ID });
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    vi.clearAllMocks();
  });

  it('exports the canonical settings of the current account', async () => {
    const { setAccountSettings } = await importSettingsStore();
    await setAccountSettings(ACCOUNT_ID, {
      signature: 'Best regards',
      theme: 'dark',
      aliases: [{ id: 'alias-1', email: 'alias@example.test', name: 'Alias' }],
    });

    const { GET } = await importRoute();
    const response = await GET();
    expect(response.status).toBe(200);

    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const settings = JSON.parse(await zip.file('settings.json')!.async('string'));

    expect(settings).toMatchObject({
      signature: 'Best regards',
      theme: 'dark',
      aliases: [{ id: 'alias-1', email: 'alias@example.test', name: 'Alias' }],
    });
  });

  it('restores settings through the canonical store without touching other accounts', async () => {
    const { setAccountSettings, getAccountSettings } = await importSettingsStore();
    await setAccountSettings(ACCOUNT_ID, { signature: 'Original', theme: 'dark' });
    await setAccountSettings(OTHER_ACCOUNT_ID, { signature: 'Other', theme: 'light' });

    const { GET, POST } = await importRoute();
    const archive = await (await GET()).arrayBuffer();

    await setAccountSettings(ACCOUNT_ID, { signature: 'Changed', theme: 'light' });

    const response = await POST(restoreRequest(archive));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });

    expect(await getAccountSettings(ACCOUNT_ID)).toMatchObject({
      signature: 'Original',
      theme: 'dark',
    });
    expect(await getAccountSettings(OTHER_ACCOUNT_ID)).toMatchObject({
      signature: 'Other',
      theme: 'light',
    });

    vi.resetModules();
    const { getAccountSettings: getAfterRestart } = await importSettingsStore();
    expect(await getAfterRestart(ACCOUNT_ID)).toMatchObject({
      signature: 'Original',
      theme: 'dark',
    });
  });
});
