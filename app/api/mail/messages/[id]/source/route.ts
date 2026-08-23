import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';

// Browser display is refused above this size; the exact download remains
// available regardless of size (streamed unless the upstream server itself
// refuses it).
export const MAX_INLINE_SOURCE_BYTES = 10 * 1024 * 1024;

function sanitizeSubject(raw: string): string {
  return raw
    .replace(/[\r\n\x00"\\]/g, '')
    .replace(/[/:*?<>|]/g, '_')
    .trim()
    .substring(0, 150);
}

function buildDownloadFilename(subject: string, messageId: string): string {
  const sanitized = sanitizeSubject(subject);
  const base = sanitized || `message-${messageId}`;
  return `${base}.eml`;
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

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
  const download = request.nextUrl.searchParams.get('download') === '1';

  const provider =
    process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();

  let source;
  try {
    source = await provider.getMessageSource(session.accountId, id);
  } catch (error) {
    logger.error('[MessageSource] Failed to resolve message source', {
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

  if (!download && source.size > MAX_INLINE_SOURCE_BYTES) {
    return NextResponse.json(
      { oversized: true, size: source.size, limit: MAX_INLINE_SOURCE_BYTES },
      { status: 200, headers: noStore() }
    );
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = await source.openStream();
  } catch (error) {
    logger.error('[MessageSource] Failed to open message source stream', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to retrieve message source' },
      { status: 502, headers: noStore() }
    );
  }

  const headers = noStore();
  headers.set('Content-Type', 'message/rfc822');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Length', String(source.size));

  if (download) {
    const filename = buildDownloadFilename(source.diagnostics.subject, id);
    const asciiSafe = filename.replace(/[^\x20-\x7E]/g, '').trim() || `message-${id}.eml`;
    headers.set(
      'Content-Disposition',
      `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encodeRfc5987(filename)}`
    );
  }

  return new NextResponse(stream, { headers });
}
