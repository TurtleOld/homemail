import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import type { Label } from '@/lib/types';

const labelSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const labels = await readStorage<Label[]>(`labels:${session.accountId}`, []);

    return NextResponse.json(labels);
  } catch (error) {
    console.error('Error fetching labels:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = labelSchema.parse(body);

    const labels = await readStorage<Label[]>(`labels:${session.accountId}`, []);

    const newLabel: Label = {
      id: `label_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name,
      color: data.color || '#3b82f6',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    labels.push(newLabel);
    await writeStorage(`labels:${session.accountId}`, labels);

    return NextResponse.json(newLabel);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error creating label:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

