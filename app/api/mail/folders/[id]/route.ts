import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProviderForAccount } from '@/lib/get-provider';

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().nullable().optional(),
});

export async function PUT(
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
    const data = updateFolderSchema.parse(body);

    const provider = getMailProviderForAccount(session.accountId);

    if (provider && 'updateFolder' in provider) {
      const updatedFolder = await (provider as any).updateFolder(session.accountId, id, {
        name: data.name,
        parentId: data.parentId,
      });

      return NextResponse.json(updatedFolder);
    }

    return NextResponse.json({ error: 'Folder update not supported' }, { status: 501 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('[Folders] Error updating folder:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
