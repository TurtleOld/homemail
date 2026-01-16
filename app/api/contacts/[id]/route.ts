import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import type { Contact } from '@/lib/types';

const updateContactSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
  groups: z.array(z.string()).optional(),
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
    const data = updateContactSchema.parse(body);

    const contacts = await readStorage<Contact[]>(`contacts:${session.accountId}`, []);
    const contactIndex = contacts.findIndex((c) => c.id === params.id);

    if (contactIndex === -1) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    if (data.email && data.email.toLowerCase() !== contacts[contactIndex]!.email.toLowerCase()) {
      const existingContact = contacts.find((c) => c.id !== params.id && c.email.toLowerCase() === data.email.toLowerCase());
      if (existingContact) {
        return NextResponse.json({ error: 'Contact with this email already exists' }, { status: 409 });
      }
    }

    contacts[contactIndex] = {
      ...contacts[contactIndex]!,
      ...data,
      updatedAt: new Date(),
    };

    await writeStorage(`contacts:${session.accountId}`, contacts);

    return NextResponse.json(contacts[contactIndex]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error updating contact:', error);
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

    const contacts = await readStorage<Contact[]>(`contacts:${session.accountId}`, []);
    const filteredContacts = contacts.filter((c) => c.id !== params.id);

    await writeStorage(`contacts:${session.accountId}`, filteredContacts);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
