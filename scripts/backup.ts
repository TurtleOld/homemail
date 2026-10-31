import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data'));
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const BACKUP_ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'default-key-change-in-production';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Files that are rebuilt on every start or whose stale copy is harmful after a
 * restore: atomic-write leftovers, process locks and health probes.
 */
const TRANSIENT_FILE_PATTERN = /(\.tmp\.|\.tmp$|\.lock$|^\.health-check$|^restore-temp\.tar\.gz$)/;

function getEncryptionKey(): Buffer {
  return crypto.scryptSync(BACKUP_ENCRYPTION_KEY, 'backup-salt', 32);
}

async function encryptBackup(data: Buffer): Promise<Buffer> {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]);
}

async function ensureBackupDir(): Promise<void> {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create backup directory:', error);
    throw error;
  }
}

/**
 * Lists the top-level entries of the data directory that belong in a backup.
 *
 * The data directory holds every persistent HomeMail file: sessions,
 * credentials, settings, contacts, groups, templates, labels, rules, OAuth
 * tokens, the send queue and the stored mail state. Everything is included, so
 * new files are covered without editing this list. The backup directory itself
 * and transient files are skipped.
 *
 * Args:
 *   dataDir: Directory that holds the HomeMail data files.
 *   backupDir: Directory where backups are written; skipped when nested.
 *
 * Returns:
 *   Sorted entry names relative to `dataDir`.
 */
export async function listBackupEntries(dataDir: string, backupDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dataDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const relativeBackupDir = path.relative(path.resolve(dataDir), path.resolve(backupDir));
  const nestedBackupRoot =
    relativeBackupDir && !relativeBackupDir.startsWith('..') && !path.isAbsolute(relativeBackupDir)
      ? relativeBackupDir.split(path.sep)[0]
      : null;

  return entries
    .filter((entry) => !TRANSIENT_FILE_PATTERN.test(entry) && entry !== nestedBackupRoot)
    .sort();
}

/**
 * Creates an encrypted archive of HomeMail's persistent data.
 *
 * Only the local `DATA_DIR` is covered. Mailboxes, Sieve scripts and OAuth
 * provider state live in Stalwart and must be backed up separately on the mail
 * server; restoring this archive does not bring mail back.
 *
 * Returns:
 *   Path of the encrypted backup, or an empty string when no data exists.
 */
async function createBackup(): Promise<string> {
  await ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup-${timestamp}.tar.gz`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-backup-'));
  const tempArchivePath = path.join(tempDir, 'backup.tar.gz');

  try {
    const entries = await listBackupEntries(DATA_DIR, BACKUP_DIR);

    if (entries.length === 0) {
      console.log('No files to backup');
      return '';
    }

    // Prefixing with ./ keeps tar from reading an entry name as an option.
    const archiveEntries = entries.map((entry) => `./${entry}`);
    await execFileAsync('tar', ['-czf', tempArchivePath, '-C', DATA_DIR, ...archiveEntries]);

    const backupData = await fs.readFile(tempArchivePath);
    const encryptedData = await encryptBackup(backupData);

    await fs.writeFile(backupPath, encryptedData);

    console.log(`Backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('Failed to create backup:', error);
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function cleanupOldBackups(): Promise<void> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const now = Date.now();
    const retentionMs = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.startsWith('backup-') || !file.endsWith('.tar.gz')) {
        continue;
      }

      const filePath = path.join(BACKUP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtime.getTime() > retentionMs) {
          await fs.unlink(filePath);
          console.log(`Deleted old backup: ${file}`);
        }
      } catch (error) {
        console.error(`Failed to delete backup ${file}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to cleanup old backups:', error);
  }
}

async function main() {
  try {
    console.log('Starting backup...');
    const backupPath = await createBackup();
    if (backupPath) {
      console.log(`Backup completed: ${backupPath}`);
    }
    await cleanupOldBackups();
    console.log('Backup process completed');
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  }
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main();
}

export { createBackup, cleanupOldBackups };
