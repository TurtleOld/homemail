import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = process.env;
let workDir: string;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-backup-test-'));
  vi.resetModules();
});

afterEach(async () => {
  process.env = originalEnv;
  await fs.rm(workDir, { recursive: true, force: true });
});

async function writeFixture(dataDir: string): Promise<void> {
  await fs.mkdir(path.join(dataDir, 'security-logs'), { recursive: true });
  const files: Record<string, string> = {
    'sessions.json': '{"session":"marker-sessions"}',
    'credentials.enc': 'marker-credentials',
    'user_accounts.json': 'marker-accounts',
    'filters.json': 'marker-filters',
    'filter-rules.json': 'marker-filter-rules',
    'filter-jobs.json': 'marker-filter-jobs',
    '.settings.json': 'marker-legacy-settings',
    'settings_user.json': 'marker-settings',
    'contacts_user.json': 'marker-contacts',
    'contactGroups_user.json': 'marker-groups',
    'emailTemplates_user.json': 'marker-templates',
    'labels_user.json': 'marker-labels',
    'messageLabels_user.json': 'marker-message-labels',
    'oauth_tokens.enc': 'marker-oauth-tokens',
    'oauth_states.enc': 'marker-oauth-states',
    'allScheduledMessages.json': 'marker-send-queue',
    'security-logs/app.log': 'marker-security-log',
  };
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dataDir, name), content);
  }
}

/** Decrypts a backup with the same key format the restore script uses. */
async function decryptBackupFile(filePath: string, key: string): Promise<Buffer> {
  const encrypted = await fs.readFile(filePath);
  const derived = crypto.scryptSync(key, 'backup-salt', 32);
  const iv = encrypted.subarray(0, 16);
  const tag = encrypted.subarray(16, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted.subarray(32)), decipher.final()]);
}

describe('CLI backup', () => {
  it('includes every persistent file and skips backups and transient files', async () => {
    const dataDir = path.join(workDir, 'data');
    const backupDir = path.join(dataDir, 'backups');
    await writeFixture(dataDir);
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(path.join(backupDir, 'backup-old.tar.gz'), 'old backup');
    await fs.writeFile(path.join(dataDir, '.health-check'), '');
    await fs.writeFile(path.join(dataDir, 'oauth_states.lock'), '');
    await fs.writeFile(path.join(dataDir, 'allScheduledMessages.json.tmp.123.456'), 'partial');

    const { listBackupEntries } = await import('../backup');
    const entries = await listBackupEntries(dataDir, backupDir);

    expect(entries).toEqual([
      '.settings.json',
      'allScheduledMessages.json',
      'contactGroups_user.json',
      'contacts_user.json',
      'credentials.enc',
      'emailTemplates_user.json',
      'filter-jobs.json',
      'filter-rules.json',
      'filters.json',
      'labels_user.json',
      'messageLabels_user.json',
      'oauth_states.enc',
      'oauth_tokens.enc',
      'security-logs',
      'sessions.json',
      'settings_user.json',
      'user_accounts.json',
    ]);

    await fs.rm(dataDir, { recursive: true, force: true });
    await expect(listBackupEntries(dataDir, backupDir)).resolves.toEqual([]);
  });

  it('round-trips an encrypted backup into an empty directory', async () => {
    const dataDir = path.join(workDir, 'data');
    const backupDir = path.join(workDir, 'backups');
    await writeFixture(dataDir);
    await fs.writeFile(path.join(dataDir, '.health-check'), '');
    await fs.writeFile(path.join(dataDir, 'oauth_states.lock'), '');
    await fs.writeFile(path.join(dataDir, 'allScheduledMessages.json.tmp.123.456'), 'partial');

    process.env = {
      ...originalEnv,
      DATA_DIR: dataDir,
      BACKUP_DIR: backupDir,
      BACKUP_ENCRYPTION_KEY: 'roundtrip-test-key',
    };
    vi.resetModules();
    const { createBackup } = await import('../backup');
    const backupPath = await createBackup();

    expect(backupPath).not.toBe('');
    const encrypted = await fs.readFile(backupPath);
    expect(encrypted.toString('utf-8')).not.toContain('marker-sessions');

    const restoreDir = path.join(workDir, 'restored');
    process.env.DATA_DIR = restoreDir;
    vi.resetModules();
    const { restoreBackup } = await import('../restore');
    await restoreBackup(path.basename(backupPath));

    const restored = [
      'sessions.json',
      'credentials.enc',
      'user_accounts.json',
      'filters.json',
      'filter-rules.json',
      'filter-jobs.json',
      '.settings.json',
      'settings_user.json',
      'contacts_user.json',
      'contactGroups_user.json',
      'emailTemplates_user.json',
      'labels_user.json',
      'messageLabels_user.json',
      'oauth_tokens.enc',
      'oauth_states.enc',
      'allScheduledMessages.json',
      'security-logs/app.log',
    ];
    for (const name of restored) {
      await expect(fs.readFile(path.join(restoreDir, name), 'utf-8')).resolves.toContain('marker-');
    }

    for (const transient of ['.health-check', 'oauth_states.lock', 'allScheduledMessages.json.tmp.123.456']) {
      await expect(fs.access(path.join(restoreDir, transient))).rejects.toThrow();
    }
    await expect(fs.access(path.join(restoreDir, 'backups'))).rejects.toThrow();

    const archive = await decryptBackupFile(backupPath, 'roundtrip-test-key');
    expect(archive.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
  });
});
