import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import type { Contact } from '@/lib/types';

const contactSchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
  groups: z.array(z.string()).optional(),
});

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contacts = await readStorage<Contact[]>(`contacts:${session.accountId}`, []);

    return NextResponse.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
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
    const data = contactSchema.parse(body);

    const contacts = await readStorage<Contact[]>(`contacts:${session.accountId}`, []);

    const existingContact = contacts.find((c) => c.email.toLowerCase() === data.email.toLowerCase());
    if (existingContact) {
      return NextResponse.json({ error: 'Contact with this email already exists' }, { status: 409 });
    }

    const newContact: Contact = {
      id: `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email: data.email,
      name: data.name,
      phone: data.phone,
      notes: data.notes,
      groups: data.groups || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    contacts.push(newContact);
    await writeStorage(`contacts:${session.accountId}`, contacts);

    return NextResponse.json(newContact);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error creating contact:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
