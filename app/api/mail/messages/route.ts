import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { FilterQueryParser } from '@/lib/filter-parser';
import { readStorage } from '@/lib/storage';
import type { FilterGroup, MessageFilter } from '@/lib/types';

const querySchema = z.object({
  folderId: z.string(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  filter: z.enum(['unread', 'starred', 'attachments']).optional(),
  messageFilter: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
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
        } catch (error) {
          const parsed = FilterQueryParser.parse(params.messageFilter);
          messageFilter = {
            filterGroup: parsed.filterGroup,
            quickFilter: parsed.quickFilter,
          };
        }
      } else if (params.q) {
        const parsed = FilterQueryParser.parse(params.q);
        messageFilter = {
          filterGroup: parsed.filterGroup,
          quickFilter: parsed.quickFilter,
        };
      }


      const provider = process.env.MAIL_PROVIDER === 'stalwart'
        ? getMailProviderForAccount(session.accountId)
        : getMailProvider();

      const result = await provider.getMessages(session.accountId, params.folderId, {
        cursor: params.cursor,
        limit: params.limit,
        q: params.q,
        filter: params.filter,
        messageFilter,
      });
      
      const messageLabels = await readStorage<Record<string, string[]>>(
        `messageLabels:${session.accountId}`,
        {}
      );

      if (result?.messages) {
        for (const message of result.messages) {
          message.labels = messageLabels[message.id] || [];
        }
      }
      
      console.error('[messages] API result:', { 
        messagesCount: result?.messages?.length || 0, 
        hasNextCursor: !!result?.nextCursor,
        firstMessageId: result?.messages?.[0]?.id,
      });

      if (!result || !result.messages || result.messages.length === 0) {
        console.warn(`[messages] Empty messages array for accountId: ${session.accountId}, folderId: ${params.folderId}`);
      }

      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid query parameters', details: error.errors }, { status: 400 });
      }
      console.error('[messages] Error fetching messages:', error);
      
      const isConnectionError = error instanceof Error && (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('fetch failed') ||
        error.message.includes('connect')
      );

      if (isConnectionError) {
        const stalwartUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
        console.error(`[messages] Cannot connect to Stalwart server at ${stalwartUrl}`);
        return NextResponse.json(
          { 
            error: 'Mail server unavailable', 
            message: `Cannot connect to mail server. Please check that Stalwart is running and accessible at ${stalwartUrl}`,
            code: 'CONNECTION_ERROR'
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to fetch messages', message: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[messages] Unexpected error:', error);
    
    const isConnectionError = error instanceof Error && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed') ||
      error.message.includes('connect')
    );

    if (isConnectionError) {
      const stalwartUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
      console.error(`[messages] Cannot connect to Stalwart server at ${stalwartUrl}`);
      return NextResponse.json(
        { 
          error: 'Mail server unavailable', 
          message: `Cannot connect to mail server. Please check that Stalwart is running and accessible at ${stalwartUrl}`,
          code: 'CONNECTION_ERROR'
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
