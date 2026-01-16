import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage } from '@/lib/storage';
import type { Contact } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';

    if (!query || query.length < 1) {
      return NextResponse.json([]);
    }

    const contacts = await readStorage<Contact[]>(`contacts:${session.accountId}`, []);
    const lowerQuery = query.toLowerCase();

    const filtered = contacts.filter((contact) => {
      const emailMatch = contact.email.toLowerCase().includes(lowerQuery);
      const nameMatch = contact.name?.toLowerCase().includes(lowerQuery);
      return emailMatch || nameMatch;
    });

    const sorted = filtered.sort((a, b) => {
      const aEmailMatch = a.email.toLowerCase().startsWith(lowerQuery);
      const bEmailMatch = b.email.toLowerCase().startsWith(lowerQuery);
      if (aEmailMatch && !bEmailMatch) return -1;
      if (!aEmailMatch && bEmailMatch) return 1;
      
      const aNameMatch = a.name?.toLowerCase().startsWith(lowerQuery);
      const bNameMatch = b.name?.toLowerCase().startsWith(lowerQuery);
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;
      
      return a.email.localeCompare(b.email);
    });

    return NextResponse.json(sorted.slice(0, 10));
  } catch (error) {
    console.error('Error searching contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
