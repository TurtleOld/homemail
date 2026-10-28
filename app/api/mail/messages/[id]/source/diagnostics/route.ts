import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProviderForAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';

function noStore(headers: Headers = new Headers()): Headers {
  headers.set('Cache-Control', 'no-store');
  return headers;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, 'api', request);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: noStore() });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore() });
  }

  const { id } = await params;

  const provider =
    getMailProviderForAccount(session.accountId);

  let source;
  try {
    source = await provider.getMessageSource(session.accountId, id);
  } catch (error) {
    logger.error('[MessageSourceDiagnostics] Failed to resolve message source', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to retrieve message source' },
      { status: 502, headers: noStore() }
    );
  }

  if (!source) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404, headers: noStore() });
  }

  return NextResponse.json(
    { size: source.size, diagnostics: source.diagnostics },
    { status: 200, headers: noStore() }
  );
}
