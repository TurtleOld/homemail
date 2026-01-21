import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import JSZip from 'jszip';

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const zip = new JSZip();

    const contacts = await readStorage<any[]>(`contacts:${session.accountId}`, []);
    const labels = await readStorage<any[]>(`labels:${session.accountId}`, []);
    const messageLabels = await readStorage<Record<string, string[]>>(`messageLabels:${session.accountId}`, {});
    const settings = await readStorage<any>(`settings:${session.accountId}`, null);
    const emailTemplates = await readStorage<any[]>(`emailTemplates:${session.accountId}`, []);
    const contactGroups = await readStorage<any[]>(`contactGroups:${session.accountId}`, []);

    zip.file('contacts.json', JSON.stringify(contacts, null, 2));
    zip.file('labels.json', JSON.stringify(labels, null, 2));
    zip.file('messageLabels.json', JSON.stringify(messageLabels, null, 2));
    zip.file('settings.json', JSON.stringify(settings, null, 2));
    zip.file('emailTemplates.json', JSON.stringify(emailTemplates, null, 2));
    zip.file('contactGroups.json', JSON.stringify(contactGroups, null, 2));
    zip.file('backup-metadata.json', JSON.stringify({
      accountId: session.accountId,
      backupDate: new Date().toISOString(),
      version: '1.0',
    }, null, 2));

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const filename = `backup_${session.accountId}_${Date.now()}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[Backup] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());

    let restoredCount = 0;
    const errors: string[] = [];

    const restoreFile = async (filename: string, storageKey: string) => {
      const file = zip.files[filename];
      if (file && !file.dir) {
        try {
          const content = await file.async('string');
          const data = JSON.parse(content);
          const { writeStorage } = await import('@/lib/storage');
          await writeStorage(storageKey, data);
          restoredCount++;
        } catch (error) {
          errors.push(`Failed to restore ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    };

    await restoreFile('contacts.json', `contacts:${session.accountId}`);
    await restoreFile('labels.json', `labels:${session.accountId}`);
    await restoreFile('messageLabels.json', `messageLabels:${session.accountId}`);
    await restoreFile('settings.json', `settings:${session.accountId}`);
    await restoreFile('emailTemplates.json', `emailTemplates:${session.accountId}`);
    await restoreFile('contactGroups.json', `contactGroups:${session.accountId}`);

    return NextResponse.json({
      success: true,
      restored: restoredCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[Restore] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
