import type JSZip from 'jszip';

/** Maximum compressed upload size (10 MB). */
export const MAX_BACKUP_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum number of files allowed inside the archive. */
export const MAX_ARCHIVE_FILES = 20;

/** Maximum total uncompressed bytes extracted from the archive (50 MB). */
export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

/** Maximum size of a single uncompressed archive entry (10 MB). */
export const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;

/** Raised when an archive entry crosses a size limit while being read. */
export class BackupLimitExceededError extends Error {
  constructor() {
    super('Backup archive is too large when decompressed');
    this.name = 'BackupLimitExceededError';
  }
}

/**
 * Reads one archive entry without ever holding more than `maxBytes` of its
 * decompressed content in memory.
 *
 * The stream is destroyed as soon as the limit is crossed, so a highly
 * compressed entry cannot be inflated in full just to be rejected afterwards.
 *
 * @param entry Archive entry to read.
 * @param maxBytes Maximum allowed decompressed size for this entry.
 * @returns Raw decompressed bytes.
 * @throws {BackupLimitExceededError} When the entry exceeds `maxBytes`.
 */
export async function readZipEntryLimited(
  entry: Pick<JSZip.JSZipObject, 'nodeStream'>,
  maxBytes: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stream = entry.nodeStream('nodebuffer');
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
      reject(error);
    };

    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.byteLength;
      if (size > maxBytes) {
        fail(new BackupLimitExceededError());
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, size));
    });
    stream.on('error', fail);
  });
}
