import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isRedesignFeatureEnabled } from '@/lib/feature-flags';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { getSession } from '@/lib/session';

const paramsSchema = z.object({
  threadId: z.string().min(1).max(512),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  if (!isRedesignFeatureEnabled('listFirstMail')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await params);
  const parsedQuery = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get('limit') || undefined,
  });
  if (!parsedParams.success || !parsedQuery.success) {
    return NextResponse.json({ error: 'Invalid thread request' }, { status: 400 });
  }

  const provider = process.env.MAIL_PROVIDER === 'stalwart'
    ? getMailProviderForAccount(session.accountId)
    : getMailProvider();
  const thread = await provider.getThread(
    session.accountId,
    parsedParams.data.threadId,
    parsedQuery.data.limit
  );

  if (!thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }

  return NextResponse.json(thread);
}
