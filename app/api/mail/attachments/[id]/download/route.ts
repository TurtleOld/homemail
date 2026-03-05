import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';

// ─── MIME whitelist ───────────────────────────────────────────────────────────
//
// Types that browsers will NOT attempt to render inline.  Anything not in this
// list is served as application/octet-stream to prevent MIME-type sniffing and
// accidental rendering of HTML/SVG/XML in our origin.
//
const SAFE_MIME_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-tar',
  'application/json',
  'application/xml',
  'application/octet-stream',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',   // Safe when served as attachment (not inline)
  'image/tiff',
  'image/bmp',
  'image/ico',
  'image/x-icon',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/ogg',
  'video/webm',
  'video/mpeg',
  'text/plain',
  'text/csv',
  'text/calendar',
  'message/rfc822',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

/**
 * Return a safe Content-Type for the attachment.
 * HTML, XML, SVG-as-inline, and unknown types all become octet-stream so the
 * browser downloads rather than renders them.
 *
 * SVG is in the whitelist above because it is served as an attachment
 * (Content-Disposition: attachment), but text/html is explicitly excluded.
 */
function safeMime(raw: string): string {
  const base = raw.split(';')[0].trim().toLowerCase();
  // Never serve text/html, text/xml, application/xhtml+xml, etc. as themselves.
  if (
    base === 'text/html' ||
    base === 'text/xml' ||
    base === 'application/xhtml+xml' ||
    base === 'application/xml' && !SAFE_MIME_TYPES.has(base)
  ) {
    return 'application/octet-stream';
  }
  return SAFE_MIME_TYPES.has(base) ? base : 'application/octet-stream';
}

/**
 * Sanitize a filename for use in a Content-Disposition header:
 * – remove CR, LF, NUL, double-quotes (header injection vectors)
 * – strip leading dots and whitespace
 * – cap length at 200 characters
 * – fall back to "attachment" if nothing remains
 */
function sanitizeFilename(raw: string): string {
  let name = raw
    .replace(/[\r\n\x00"\\]/g, '')  // strip header-injection chars
    .replace(/^\s*\.+/, '')          // no leading dots
    .trim()
    .substring(0, 200);
  return name || 'attachment';
}

/**
 * RFC 5987 percent-encode a string for use in `filename*=UTF-8''…`
 * Only unreserved characters (A-Z a-z 0-9 - _ . ~ ! $ & + = : @ /) are
 * left as-is; everything else is %-encoded.
 */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, 'api', request);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const messageId = searchParams.get('messageId');

    if (!messageId) {
      return NextResponse.json({ error: 'messageId required' }, { status: 400 });
    }

    const provider =
      process.env.MAIL_PROVIDER === 'stalwart'
        ? getMailProviderForAccount(session.accountId)
        : getMailProvider();

    const attachment = await provider.getAttachment(session.accountId, messageId, id);

    if (!attachment) {
      logger.warn('[AttachmentDownload] Attachment not found', { attachmentId: id, accountId: session.accountId });
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const mime = safeMime(attachment.mime);
    const safeAscii = sanitizeFilename(attachment.filename);
    const encoded = encodeRfc5987(attachment.filename);

    // Use both filename= (ASCII fallback) and filename*= (UTF-8, RFC 5987).
    const disposition = `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;

    const headers = new Headers();
    headers.set('Content-Type', mime);
    headers.set('Content-Disposition', disposition);
    headers.set('Content-Length', attachment.size.toString());
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    return new NextResponse(new Uint8Array(attachment.data), { headers });
  } catch (error) {
    logger.error('[AttachmentDownload] Internal error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
