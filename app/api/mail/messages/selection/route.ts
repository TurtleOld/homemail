import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { FilterQueryParser } from '@/lib/filter-parser';
import type { FilterGroup, MessageFilter } from '@/lib/types';

const querySchema = z.object({
  folderId: z.string(),
  q: z.string().optional(),
  messageFilter: z.string().optional(),
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
      q: searchParams.get('q') || undefined,
      messageFilter: searchParams.get('messageFilter') || undefined,
    });

    let messageFilter: MessageFilter | undefined;
    if (params.messageFilter) {
      try {
        const parsed = JSON.parse(params.messageFilter);
        if (parsed.filterGroup || parsed.quickFilter || parsed.securityFilter) {
          messageFilter = parsed as MessageFilter;
        } else {
          messageFilter = { filterGroup: parsed as FilterGroup };
        }
      } catch {
        const parsed = FilterQueryParser.parse(params.messageFilter);
        messageFilter = {
          filterGroup: parsed.filterGroup,
          quickFilter: parsed.quickFilter,
        };
      }
    }

    const provider =
      process.env.MAIL_PROVIDER === 'stalwart'
        ? getMailProviderForAccount(session.accountId)
        : getMailProvider();

    const ids: string[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 100; page++) {
      const result = await provider.getMessages(session.accountId, params.folderId, {
        cursor,
        limit: 100,
        q: params.q,
        messageFilter,
      });

      if (!result?.messages?.length) break;

      ids.push(...result.messages.map((message) => message.id));

      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    return NextResponse.json({ ids, total: ids.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to collect selection',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
