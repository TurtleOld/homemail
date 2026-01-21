import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';

export interface CustomHotkey {
  id: string;
  action: string;
  keys: string;
  enabled: boolean;
}

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hotkeys = await readStorage<CustomHotkey[]>(`hotkeys:${session.accountId}`, []);

    return NextResponse.json(hotkeys);
  } catch (error) {
    console.error('Error fetching hotkeys:', error);
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
    const hotkeys = body.hotkeys as CustomHotkey[];

    await writeStorage(`hotkeys:${session.accountId}`, hotkeys);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving hotkeys:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
