import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import JSZip from 'jszip';
import { BackupLimitExceededError, readZipEntryLimited } from '@/lib/backup-archive';

async function zipEntry(name: string, content: string): Promise<JSZip.JSZipObject> {
  const zip = new JSZip();
  zip.file(name, content, { compression: 'DEFLATE' });
  const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  return loaded.files[name];
}

describe('readZipEntryLimited', () => {
  it('returns the decompressed bytes when the entry fits the limit', async () => {
    const entry = await zipEntry('contacts.json', '[{"id":"contact-1"}]');

    const content = await readZipEntryLimited(entry, 1024);

    expect(content.toString('utf8')).toBe('[{"id":"contact-1"}]');
  });

  it('rejects a highly compressed entry before inflating it in full', async () => {
    const entry = await zipEntry('bomb.json', 'a'.repeat(1024 * 1024));

    await expect(readZipEntryLimited(entry, 1024)).rejects.toBeInstanceOf(BackupLimitExceededError);
  });

  it('destroys the entry stream as soon as the limit is crossed', async () => {
    const stream = Readable.from([Buffer.alloc(1024), Buffer.alloc(1024)]);
    const entry = { nodeStream: () => stream };

    await expect(readZipEntryLimited(entry, 512)).rejects.toBeInstanceOf(BackupLimitExceededError);
    expect(stream.destroyed).toBe(true);
  });
});
