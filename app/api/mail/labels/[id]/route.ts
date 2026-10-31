import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage, withStorageLock } from '@/lib/storage';
import type { Label } from '@/lib/types';

const updateLabelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
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
    const data = updateLabelSchema.parse(body);

    const key = `labels:${session.accountId}`;

    return await withStorageLock(key, async () => {
      const labels = await readStorage<Label[]>(key, []);
      const labelIndex = labels.findIndex((l) => l.id === id);

      if (labelIndex === -1) {
        return NextResponse.json({ error: 'Label not found' }, { status: 404 });
      }

      labels[labelIndex] = {
        ...labels[labelIndex]!,
        ...data,
        updatedAt: new Date(),
      };

      await writeStorage(key, labels);

      return NextResponse.json(labels[labelIndex]);
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error updating label:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const key = `labels:${session.accountId}`;

    return await withStorageLock(key, async () => {
      const labels = await readStorage<Label[]>(key, []);
      const filteredLabels = labels.filter((l) => l.id !== id);

      await writeStorage(key, filteredLabels);

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    console.error('Error deleting label:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
