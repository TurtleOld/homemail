import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';

const querySchema = z.object({
  folderId: z.string(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  filter: z.enum(['unread', 'starred', 'attachments']).optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const params = querySchema.parse({
      folderId: searchParams.get('folderId'),
      cursor: searchParams.get('cursor') || undefined,
      limit: searchParams.get('limit') || undefined,
      q: searchParams.get('q') || undefined,
      filter: searchParams.get('filter') || undefined,
    });

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();
    const result = await provider.getMessages(session.accountId, params.folderId, {
      cursor: params.cursor,
      limit: params.limit,
      q: params.q,
      filter: params.filter,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid query parameters', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
