import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';

const updateLabelsSchema = z.object({
  labelIds: z.array(z.string()),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = updateLabelsSchema.parse(body);

    const messageLabels = await readStorage<Record<string, string[]>>(
      `messageLabels:${session.accountId}`,
      {}
    );

    messageLabels[id] = data.labelIds;

    await writeStorage(`messageLabels:${session.accountId}`, messageLabels);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error updating message labels:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
