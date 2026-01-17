import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const messageId = searchParams.get('messageId');

    logger.info(`[AttachmentDownload] Request: attachmentId=${id}, messageId=${messageId}, accountId=${session.accountId}`);

    if (!messageId) {
      logger.error('[AttachmentDownload] messageId is required');
      return NextResponse.json({ error: 'messageId required' }, { status: 400 });
    }

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();
    const attachment = await provider.getAttachment(session.accountId, messageId, id);

    if (!attachment) {
      logger.error(`[AttachmentDownload] Attachment not found: attachmentId=${id}, messageId=${messageId}, accountId=${session.accountId}`);
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    logger.info(`[AttachmentDownload] Attachment found: filename=${attachment.filename}, size=${attachment.size}`);

    const headers = new Headers();
    headers.set('Content-Type', attachment.mime);
    headers.set('Content-Disposition', `attachment; filename="${attachment.filename}"`);
    headers.set('Content-Length', attachment.size.toString());
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    return new NextResponse(new Uint8Array(attachment.data), { headers });
  } catch (error) {
    logger.error('[AttachmentDownload] Internal server error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
