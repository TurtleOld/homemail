import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import type { ContactGroup, Contact } from '@/lib/types';

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  contactIds: z.array(z.string()).optional(),
});

export async function PUT(
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
    const data = updateGroupSchema.parse(body);

    const groups = await readStorage<ContactGroup[]>(`contactGroups:${session.accountId}`, []);
    const groupIndex = groups.findIndex((g) => g.id === id);

    if (groupIndex === -1) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const updatedGroup = {
      ...groups[groupIndex]!,
      ...data,
      updatedAt: new Date(),
    };

    if (data.contactIds !== undefined) {
      const contacts = await readStorage<Contact[]>(`contacts:${session.accountId}`, []);
      for (const contact of contacts) {
        if (data.contactIds.includes(contact.id)) {
          if (!contact.groups) {
            contact.groups = [];
          }
          if (!contact.groups.includes(id)) {
            contact.groups.push(id);
          }
        } else {
          if (contact.groups) {
            contact.groups = contact.groups.filter((gid) => gid !== id);
          }
        }
      }
      await writeStorage(`contacts:${session.accountId}`, contacts);
    }

    groups[groupIndex] = updatedGroup;
    await writeStorage(`contactGroups:${session.accountId}`, groups);

    return NextResponse.json(updatedGroup);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error updating contact group:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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
    const groups = await readStorage<ContactGroup[]>(`contactGroups:${session.accountId}`, []);
    const filteredGroups = groups.filter((g) => g.id !== id);

    const contacts = await readStorage<Contact[]>(`contacts:${session.accountId}`, []);
    for (const contact of contacts) {
      if (contact.groups) {
        contact.groups = contact.groups.filter((gid) => gid !== id);
      }
    }
    await writeStorage(`contacts:${session.accountId}`, contacts);

    await writeStorage(`contactGroups:${session.accountId}`, filteredGroups);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact group:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
