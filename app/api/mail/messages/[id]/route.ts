import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { readStorage } from '@/lib/storage';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const provider = process.env.MAIL_PROVIDER === 'stalwart'
    ? getMailProviderForAccount(session.accountId)
    : getMailProvider();
  const message = await provider.getMessage(session.accountId, id);

  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const messageLabels = await readStorage<Record<string, string[]>>(
    `messageLabels:${session.accountId}`,
    {}
  );

  message.labels = messageLabels[id] || [];

  return NextResponse.json(message);
}
