import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProviderForAccount } from '@/lib/get-provider';
import type { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';

const schema = z.object({
  content: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content } = schema.parse(body);

    const provider = getMailProviderForAccount(session.accountId) as StalwartJMAPProvider;
    const result = await provider.validateSieveScript(content, session.accountId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    console.error('[sieve/validate] Error:', error);
    return NextResponse.json(
      { error: 'Validation failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
