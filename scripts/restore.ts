import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data'));
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const BACKUP_ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'default-key-change-in-production';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  return crypto.scryptSync(BACKUP_ENCRYPTION_KEY, 'backup-salt', 32);
}

async function decryptBackup(encryptedData: Buffer): Promise<Buffer> {
  const key = getEncryptionKey();

  if (encryptedData.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted backup data');
  }

  const iv = encryptedData.subarray(0, IV_LENGTH);
  const tag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = encryptedData.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

async function listBackups(): Promise<string[]> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    return files
      .filter((f) => f.startsWith('backup-') && f.endsWith('.tar.gz'))
      .sort()
      .reverse();
  } catch (error) {
    console.error('Failed to list backups:', error);
    return [];
  }
}

/**
 * Restores an encrypted backup into the data directory.
 *
 * The archive contains only HomeMail's local `DATA_DIR`. Mailboxes, Sieve
 * scripts and OAuth provider state are not part of it: they live in Stalwart
 * and need their own backup on the mail server.
 *
 * Args:
 *   backupFileName: Name of a backup inside the backup directory.
 */
async function restoreBackup(backupFileName: string): Promise<void> {
  if (path.basename(backupFileName) !== backupFileName) {
    throw new Error(`Invalid backup file name: ${backupFileName}`);
  }

  const backupPath = path.join(BACKUP_DIR, backupFileName);

  try {
    await fs.access(backupPath);
  } catch {
    throw new Error(`Backup file not found: ${backupFileName}`);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-restore-'));

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    const encryptedData = await fs.readFile(backupPath);
    const decryptedData = await decryptBackup(encryptedData);

    const tempArchivePath = path.join(tempDir, 'restore.tar.gz');
    await fs.writeFile(tempArchivePath, decryptedData);

    await execFileAsync('tar', ['-xzf', tempArchivePath, '-C', DATA_DIR]);

    console.log(`Backup restored from: ${backupFileName}`);
  } catch (error) {
    console.error('Failed to restore backup:', error);
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Available backups:');
    const backups = await listBackups();
    if (backups.length === 0) {
      console.log('No backups found');
      return;
    }
    backups.forEach((backup, index) => {
      console.log(`${index + 1}. ${backup}`);
    });
    return;
  }

  const backupFileName = args[0];

  try {
    console.log(`Restoring backup: ${backupFileName}`);
    await restoreBackup(backupFileName);
    console.log('Restore completed successfully');
  } catch (error) {
    console.error('Restore failed:', error);
    process.exit(1);
  }
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main();
}

export { listBackups, restoreBackup };
