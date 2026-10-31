/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import JSZip from 'jszip';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  writeStorage: vi.fn(),
  setAccountSettings: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/storage', () => ({
  readStorage: vi.fn(),
  writeStorage: mocks.writeStorage,
}));
vi.mock('@/lib/settings-store', () => ({
  getAccountSettings: vi.fn(),
  setAccountSettings: mocks.setAccountSettings,
}));
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/backup-archive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/backup-archive')>();
  return { ...actual, MAX_UNCOMPRESSED_BYTES: 2048 };
});

import { POST } from '@/app/api/backup/route';

const ACCOUNT_ID = 'account-1';

async function buildArchive(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function restoreRequest(body: Buffer): NextRequest {
  const bytes = new Uint8Array(body.byteLength);
  bytes.set(body);
  const formData = new FormData();
  formData.append('file', new File([bytes], 'backup.zip', { type: 'application/zip' }));
  return new NextRequest('https://app.example.test/api/backup', {
    method: 'POST',
    body: formData,
  });
}

function metadata(accountId = ACCOUNT_ID): string {
  return JSON.stringify({ accountId, backupDate: '2026-10-30T00:00:00.000Z', version: '1.0' });
}

describe('POST /api/backup restore limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ accountId: ACCOUNT_ID });
  });

  it('restores a regular export', async () => {
    const contacts = [{ id: 'contact-1', name: 'Alice' }];
    const body = await buildArchive({
      'backup-metadata.json': metadata(),
      'contacts.json': JSON.stringify(contacts),
    });

    const response = await POST(restoreRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, restored: 1 });
    expect(mocks.writeStorage).toHaveBeenCalledWith(`contacts:${ACCOUNT_ID}`, contacts);
  });

  it('rejects a highly compressed slot without writing any user data', async () => {
    const body = await buildArchive({
      'backup-metadata.json': metadata(),
      'contacts.json': JSON.stringify([{ id: 'contact-1', name: 'Alice' }]),
      'labels.json': `[${'"a"'.repeat(5000)}]`,
    });

    expect(body.byteLength).toBeLessThan(2048);

    const response = await POST(restoreRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Backup archive is too large when decompressed' });
    expect(mocks.writeStorage).not.toHaveBeenCalled();
  });

  it('restores settings through the canonical store after validation', async () => {
    const settings = { theme: 'dark', signature: 'Saved signature' };
    const body = await buildArchive({
      'backup-metadata.json': metadata(),
      'settings.json': JSON.stringify(settings),
    });

    const response = await POST(restoreRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, restored: 1 });
    expect(mocks.setAccountSettings).toHaveBeenCalledWith(ACCOUNT_ID, settings);
    expect(mocks.writeStorage).not.toHaveBeenCalled();
  });

  it('does not restore settings when a later slot exceeds the total limit', async () => {
    const body = await buildArchive({
      'backup-metadata.json': metadata(),
      'settings.json': JSON.stringify({ signature: 'x'.repeat(1024) }),
      'emailTemplates.json': JSON.stringify([{ id: 'template-1', name: 'Template', body: 'x'.repeat(1024) }]),
    });

    const response = await POST(restoreRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.setAccountSettings).not.toHaveBeenCalled();
    expect(mocks.writeStorage).not.toHaveBeenCalled();
  });

  it('applies the uncompressed limit to metadata', async () => {
    const body = await buildArchive({
      'backup-metadata.json': JSON.stringify({
        accountId: ACCOUNT_ID,
        backupDate: 'x'.repeat(4096),
        version: '1.0',
      }),
      'contacts.json': JSON.stringify([]),
    });

    const response = await POST(restoreRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.writeStorage).not.toHaveBeenCalled();
  });
});
