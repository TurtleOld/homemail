import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import JSZip from 'jszip';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import {
  BackupLimitExceededError,
  MAX_ARCHIVE_FILES,
  MAX_BACKUP_SIZE_BYTES,
  MAX_SINGLE_FILE_BYTES,
  MAX_UNCOMPRESSED_BYTES,
  readZipEntryLimited,
} from '@/lib/backup-archive';

// ─── Zod schemas for each backup slot ────────────────────────────────────────

const ContactSchema = z.object({
  id: z.string().max(256),
  name: z.string().max(512).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(64).optional(),
  notes: z.string().max(4096).optional(),
}).passthrough();

const LabelSchema = z.object({
  id: z.string().max(256),
  name: z.string().max(256),
  color: z.string().max(64).optional(),
}).passthrough();

const SettingsSchema = z.record(z.string(), z.unknown()).nullable();

const EmailTemplateSchema = z.object({
  id: z.string().max(256),
  name: z.string().max(512),
  subject: z.string().max(1024).optional(),
  body: z.string().max(102400).optional(),
}).passthrough();

const MessageLabelsSchema = z.record(z.string(), z.array(z.string().max(256)));

const ContactGroupSchema = z.object({
  id: z.string().max(256),
  name: z.string().max(512),
}).passthrough();

const BackupMetadataSchema = z.object({
  accountId: z.string().min(1).max(256),
  backupDate: z.string(),
  version: z.string().max(16),
});

// ─── Restore slot descriptor ──────────────────────────────────────────────────

interface RestoreSlot<T> {
  filename: string;
  storageKey: (accountId: string) => string;
  schema: z.ZodType<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RESTORE_SLOTS: RestoreSlot<any>[] = [
  { filename: 'contacts.json',       storageKey: (id) => `contacts:${id}`,       schema: z.array(ContactSchema) },
  { filename: 'labels.json',         storageKey: (id) => `labels:${id}`,         schema: z.array(LabelSchema) },
  { filename: 'messageLabels.json',  storageKey: (id) => `messageLabels:${id}`,  schema: MessageLabelsSchema },
  { filename: 'settings.json',       storageKey: (id) => `settings:${id}`,       schema: SettingsSchema },
  { filename: 'emailTemplates.json', storageKey: (id) => `emailTemplates:${id}`, schema: z.array(EmailTemplateSchema) },
  { filename: 'contactGroups.json',  storageKey: (id) => `contactGroups:${id}`,  schema: z.array(ContactGroupSchema) },
];

// ─── GET: create backup ───────────────────────────────────────────────────────

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const zip = new JSZip();

    const contacts      = await readStorage<unknown[]>(`contacts:${session.accountId}`, []);
    const labels        = await readStorage<unknown[]>(`labels:${session.accountId}`, []);
    const messageLabels = await readStorage<Record<string, string[]>>(`messageLabels:${session.accountId}`, {});
    const settings      = await readStorage<unknown>(`settings:${session.accountId}`, null);
    const emailTemplates = await readStorage<unknown[]>(`emailTemplates:${session.accountId}`, []);
    const contactGroups = await readStorage<unknown[]>(`contactGroups:${session.accountId}`, []);

    zip.file('contacts.json',       JSON.stringify(contacts, null, 2));
    zip.file('labels.json',         JSON.stringify(labels, null, 2));
    zip.file('messageLabels.json',  JSON.stringify(messageLabels, null, 2));
    zip.file('settings.json',       JSON.stringify(settings, null, 2));
    zip.file('emailTemplates.json', JSON.stringify(emailTemplates, null, 2));
    zip.file('contactGroups.json',  JSON.stringify(contactGroups, null, 2));
    zip.file('backup-metadata.json', JSON.stringify({
      accountId: session.accountId,
      backupDate: new Date().toISOString(),
      version: '1.0',
    }, null, 2));

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const filename = `backup_${Date.now()}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('[Backup] Error creating backup', { error: String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: restore backup ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // ── Size guard (compressed) ──────────────────────────────────────────────
    if (file.size > MAX_BACKUP_SIZE_BYTES) {
      logger.warn('[Restore] Upload exceeds size limit', { size: file.size, accountId: session.accountId });
      return NextResponse.json({ error: 'Backup file too large' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // ── File count guard ────────────────────────────────────────────────────
    const fileEntries = Object.values(zip.files).filter((f) => !f.dir);
    if (fileEntries.length > MAX_ARCHIVE_FILES) {
      logger.warn('[Restore] Archive contains too many files', { count: fileEntries.length, accountId: session.accountId });
      return NextResponse.json({ error: 'Backup archive contains too many files' }, { status: 400 });
    }

    // ── Validate metadata and accountId binding ─────────────────────────────
    const metaFile = zip.files['backup-metadata.json'];
    if (!metaFile || metaFile.dir) {
      return NextResponse.json({ error: 'Backup is missing metadata' }, { status: 400 });
    }
    const metaBytes = await readZipEntryLimited(
      metaFile,
      Math.min(MAX_SINGLE_FILE_BYTES, MAX_UNCOMPRESSED_BYTES)
    );
    const metaContent = metaBytes.toString('utf8');
    let totalUncompressed = metaBytes.byteLength;
    let metadata: z.infer<typeof BackupMetadataSchema>;
    try {
      metadata = BackupMetadataSchema.parse(JSON.parse(metaContent));
    } catch {
      logger.warn('[Restore] Invalid backup metadata', { accountId: session.accountId });
      return NextResponse.json({ error: 'Invalid backup metadata' }, { status: 400 });
    }

    if (metadata.accountId !== session.accountId) {
      logger.warn('[Restore] Backup accountId mismatch', {
        backupAccountId: metadata.accountId,
        sessionAccountId: session.accountId,
      });
      return NextResponse.json({ error: 'Backup belongs to a different account' }, { status: 403 });
    }

    // ── Restore each slot with Zod validation ────────────────────────────────
    // Reads and validates every slot before the first write, so a zip bomb
    // rejected half-way cannot leave the account with partially restored data.
    const pendingWrites: Array<{ filename: string; key: string; value: unknown }> = [];
    const errors: string[] = [];

    for (const slot of RESTORE_SLOTS) {
      const entry = zip.files[slot.filename];
      if (!entry || entry.dir) continue;

      try {
        const remaining = MAX_UNCOMPRESSED_BYTES - totalUncompressed;
        const content = await readZipEntryLimited(
          entry,
          Math.min(MAX_SINGLE_FILE_BYTES, remaining)
        );
        totalUncompressed += content.byteLength;

        const validated = slot.schema.parse(JSON.parse(content.toString('utf8')));
        pendingWrites.push({
          filename: slot.filename,
          key: slot.storageKey(session.accountId),
          value: validated,
        });
      } catch (err) {
        if (err instanceof BackupLimitExceededError) throw err;

        // Log detail server-side, return generic message to client.
        logger.error('[Restore] Failed to restore slot', {
          filename: slot.filename,
          accountId: session.accountId,
          error: String(err),
        });
        errors.push(`Failed to restore ${slot.filename}`);
      }
    }

    let restoredCount = 0;
    for (const write of pendingWrites) {
      try {
        await writeStorage(write.key, write.value);
        restoredCount++;
      } catch (err) {
        logger.error('[Restore] Failed to restore slot', {
          filename: write.filename,
          accountId: session.accountId,
          error: String(err),
        });
        errors.push(`Failed to restore ${write.filename}`);
      }
    }

    return NextResponse.json({
      success: true,
      restored: restoredCount,
      ...(errors.length > 0 && { errors }),
    });
  } catch (error) {
    if (error instanceof BackupLimitExceededError) {
      logger.warn('[Restore] Zip bomb guard triggered', { accountId: session.accountId });
      return NextResponse.json({ error: 'Backup archive is too large when decompressed' }, { status: 400 });
    }

    logger.error('[Restore] Unexpected error', { accountId: session.accountId, error: String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
