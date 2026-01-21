import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import type { Contact } from '@/lib/types';
import { parse } from 'csv-parse/sync';

const importSchema = z.object({
  content: z.string().min(1),
  format: z.enum(['vcard', 'csv']),
});

function parseVCard(content: string): Contact[] {
  const contacts: Contact[] = [];
  const vcards = content.split(/END:VCARD/i);
  
  for (const vcard of vcards) {
    if (!vcard.trim()) continue;
    
    const lines = vcard.split(/\r?\n/);
    let email = '';
    let name = '';
    let phone = '';
    let notes = '';
    
    for (const line of lines) {
      if (line.startsWith('EMAIL:')) {
        email = line.substring(6).trim();
      } else if (line.startsWith('FN:')) {
        name = line.substring(3).trim();
      } else if (line.startsWith('TEL:')) {
        phone = line.substring(4).trim();
      } else if (line.startsWith('NOTE:')) {
        notes = line.substring(5).trim().replace(/\\n/g, '\n');
      }
    }
    
    if (email) {
      contacts.push({
        id: `contact_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        email,
        name: name || undefined,
        phone: phone || undefined,
        notes: notes || undefined,
        groups: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  
  return contacts;
}

function parseCSV(content: string): Contact[] {
  const contacts: Contact[] = [];
  
  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
    
    for (const record of records) {
      const email = record.Email || record.email || record.EMAIL;
      if (!email) continue;
      
      contacts.push({
        id: `contact_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        email: email.trim(),
        name: (record.Name || record.name || record.NAME || '').trim() || undefined,
        phone: (record.Phone || record.phone || record.PHONE || '').trim() || undefined,
        notes: (record.Notes || record.notes || record.NOTES || '').trim() || undefined,
        groups: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  } catch (error) {
    throw new Error(`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return contacts;
}

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = importSchema.parse(body);

    let contacts: Contact[];
    
    if (data.format === 'vcard') {
      contacts = parseVCard(data.content);
    } else if (data.format === 'csv') {
      contacts = parseCSV(data.content);
    } else {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    if (contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts found in file' }, { status: 400 });
    }

    const existingContacts = await readStorage<Contact[]>(`contacts:${session.accountId}`, []);
    const existingEmails = new Set(existingContacts.map((c) => c.email.toLowerCase()));
    
    let importedCount = 0;
    let skippedCount = 0;
    
    for (const contact of contacts) {
      if (existingEmails.has(contact.email.toLowerCase())) {
        skippedCount++;
        continue;
      }
      
      existingContacts.push(contact);
      existingEmails.add(contact.email.toLowerCase());
      importedCount++;
    }
    
    await writeStorage(`contacts:${session.accountId}`, existingContacts);

    return NextResponse.json({
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      total: contacts.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('[ImportContacts] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
