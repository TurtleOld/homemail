import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import type { Label } from '@/lib/types';
import { validateOrigin } from '@/lib/csrf';

const updateLabelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = updateLabelSchema.parse(body);

    const labels = await readStorage<Label[]>(`labels:${session.accountId}`, []);
    const labelIndex = labels.findIndex((l) => l.id === params.id);

    if (labelIndex === -1) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    labels[labelIndex] = {
      ...labels[labelIndex]!,
      ...data,
      updatedAt: new Date(),
    };

    await writeStorage(`labels:${session.accountId}`, labels);

    return NextResponse.json(labels[labelIndex]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error updating label:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const labels = await readStorage<Label[]>(`labels:${session.accountId}`, []);
    const filteredLabels = labels.filter((l) => l.id !== params.id);

    await writeStorage(`labels:${session.accountId}`, filteredLabels);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting label:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
