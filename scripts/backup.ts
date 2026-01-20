import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data'));
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const BACKUP_ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'default-key-change-in-production';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

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

async function createBackup(): Promise<string> {
  await ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup-${timestamp}.tar.gz`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  const tempBackupPath = `${backupPath}.tmp`;

  try {
    const filesToBackup = [
      'sessions.json',
      'credentials.enc',
      'user_accounts.json',
      'filters.json',
      'filter-rules.json',
      'settings.json',
    ];

    const existingFiles: string[] = [];
    for (const file of filesToBackup) {
      const filePath = path.join(DATA_DIR, file);
      try {
        await fs.access(filePath);
        existingFiles.push(file);
      } catch {
      }
    }

    if (existingFiles.length === 0) {
      console.log('No files to backup');
      return '';
    }

    const tarCommand = `cd ${DATA_DIR} && tar -czf ${tempBackupPath} ${existingFiles.join(' ')}`;
    await execAsync(tarCommand);

    const backupData = await fs.readFile(tempBackupPath);
    const encryptedData = await encryptBackup(backupData);

    await fs.writeFile(backupPath, encryptedData);
    await fs.unlink(tempBackupPath);

    console.log(`Backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    try {
      await fs.unlink(tempBackupPath);
    } catch {
    }
    console.error('Failed to create backup:', error);
    throw error;
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

if (require.main === module) {
  main();
}

export { createBackup, cleanupOldBackups };
