import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProviderForAccount } from '@/lib/get-provider';
import { readStorage, writeStorage, withStorageLock } from '@/lib/storage';

const updateLabelsSchema = z.object({
  labelIds: z.array(z.string()),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = updateLabelsSchema.parse(body);

    const key = `messageLabels:${session.accountId}`;

    return await withStorageLock(key, async () => {
      const messageLabels = await readStorage<Record<string, string[]>>(key, {});

      messageLabels[id] = data.labelIds;

      await writeStorage(key, messageLabels);

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error updating message labels:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
