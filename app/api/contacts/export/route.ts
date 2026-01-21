import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage } from '@/lib/storage';
import type { Contact } from '@/lib/types';

function contactToVCard(contact: Contact): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');
  if (contact.name) {
    const nameParts = contact.name.split(' ');
    const givenName = nameParts[0] || '';
    const familyName = nameParts.slice(1).join(' ') || '';
    lines.push(`FN:${contact.name}`);
    lines.push(`N:${familyName};${givenName};;;`);
  } else {
    lines.push(`FN:${contact.email}`);
    lines.push(`N:;;;${contact.email};;`);
  }
  lines.push(`EMAIL:${contact.email}`);
  if (contact.phone) {
    lines.push(`TEL:${contact.phone}`);
  }
  if (contact.notes) {
    lines.push(`NOTE:${contact.notes.replace(/\n/g, '\\n')}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'vcard';

    const contacts = await readStorage<Contact[]>(`contacts:${session.accountId}`, []);

    if (format === 'vcard') {
      const vcardContent = contacts.map(contactToVCard).join('\r\n');
      const filename = `contacts_${Date.now()}.vcf`;

      return new NextResponse(vcardContent, {
        headers: {
          'Content-Type': 'text/vcard',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } else if (format === 'csv') {
      const csvLines: string[] = [];
      csvLines.push('Email,Name,Phone,Notes');
      
      for (const contact of contacts) {
        const email = contact.email.replace(/"/g, '""');
        const name = (contact.name || '').replace(/"/g, '""');
        const phone = (contact.phone || '').replace(/"/g, '""');
        const notes = (contact.notes || '').replace(/"/g, '""').replace(/\n/g, ' ');
        csvLines.push(`"${email}","${name}","${phone}","${notes}"`);
      }

      const csvContent = csvLines.join('\n');
      const filename = `contacts_${Date.now()}.csv`;

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  } catch (error) {
    console.error('[ExportContacts] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
