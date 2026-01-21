import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { readStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import type { AutoSortRule } from '@/lib/types';
import { applyRuleActions, checkMessageMatchesRule } from '@/lib/apply-auto-sort-rules';

async function loadRules(accountId: string): Promise<AutoSortRule[]> {
  return await readStorage<AutoSortRule[]>(`filterRules:${accountId}`, []);
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
    const body = await request.json();
    const { folderId, days } = body;

    if (!folderId || !days || typeof days !== 'number') {
      return NextResponse.json({ error: 'folderId and days required' }, { status: 400 });
    }

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();

    const messages = await provider.getMessages(session.accountId, folderId, {
      limit: 1000,
    });

    const now = Date.now();
    const archiveDate = now - days * 24 * 60 * 60 * 1000;

    const messagesToArchive = messages.messages.filter((msg) => {
      const messageDate = new Date(msg.date).getTime();
      return messageDate < archiveDate;
    });

    if (messagesToArchive.length === 0) {
      return NextResponse.json({ archived: 0, message: 'No messages to archive' });
    }

    const folders = await provider.getFolders(session.accountId);
    const archiveFolder = folders.find((f) => f.role === 'trash' || f.name.toLowerCase().includes('archive'));

    if (!archiveFolder) {
      return NextResponse.json({ error: 'Archive folder not found' }, { status: 404 });
    }

    const messageIds = messagesToArchive.map((m) => m.id);
    await provider.bulkUpdateMessages(session.accountId, {
      ids: messageIds,
      action: 'move',
      payload: { folderId: archiveFolder.id },
    });

    return NextResponse.json({ archived: messageIds.length });
  } catch (error) {
    console.error('[Archive] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
