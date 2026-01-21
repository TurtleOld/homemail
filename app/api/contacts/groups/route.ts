import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import type { ContactGroup } from '@/lib/types';

const groupSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const groups = await readStorage<ContactGroup[]>(`contactGroups:${session.accountId}`, []);

    return NextResponse.json(groups);
  } catch (error) {
    console.error('Error fetching contact groups:', error);
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
    const data = groupSchema.parse(body);

    const groups = await readStorage<ContactGroup[]>(`contactGroups:${session.accountId}`, []);

    const newGroup: ContactGroup = {
      id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      name: data.name,
      color: data.color || '#3b82f6',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    groups.push(newGroup);
    await writeStorage(`contactGroups:${session.accountId}`, groups);

    return NextResponse.json(newGroup);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error creating contact group:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
