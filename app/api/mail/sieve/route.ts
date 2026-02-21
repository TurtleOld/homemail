import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProviderForAccount } from '@/lib/get-provider';
import type { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';

function getSieveProvider(accountId: string): StalwartJMAPProvider {
  return getMailProviderForAccount(accountId) as StalwartJMAPProvider;
}

export async function GET(_request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = getSieveProvider(session.accountId);
    const scripts = await provider.getSieveScripts(session.accountId);
    return NextResponse.json(scripts);
  } catch (error) {
    console.error('[sieve] Error fetching scripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Sieve scripts', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

const postSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullable().default(null),
  content: z.string().min(1),
  activate: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = postSchema.parse(body);

    const provider = getSieveProvider(session.accountId);
    const result = await provider.createOrUpdateSieveScript({
      accountId: session.accountId,
      existingId: data.id,
      name: data.name,
      content: data.content,
      activate: data.activate,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    console.error('[sieve] Error saving script:', error);
    return NextResponse.json(
      { error: 'Failed to save Sieve script', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Script ID required' }, { status: 400 });
    }

    const provider = getSieveProvider(session.accountId);
    await provider.deleteSieveScript(id, session.accountId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[sieve] Error deleting script:', error);
    return NextResponse.json(
      { error: 'Failed to delete Sieve script', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
