import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { validateOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { simpleParser } from 'mailparser';

const importSchema = z.object({
  emlContent: z.string().min(1),
  folderId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = importSchema.parse(body);

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();

    const parsed = await simpleParser(data.emlContent);

    const fromAddr = Array.isArray(parsed.from) 
      ? parsed.from[0]
      : parsed.from?.value?.[0];
    if (!fromAddr) {
      return NextResponse.json({ error: 'Invalid EML: missing From header' }, { status: 400 });
    }
    const from = typeof fromAddr === 'string' ? { address: fromAddr, name: '' } : fromAddr;

    const to = Array.isArray(parsed.to) 
      ? parsed.to.map((addr) => typeof addr === 'string' ? addr : (addr as any).address || addr)
      : parsed.to?.value?.map((addr: any) => typeof addr === 'string' ? addr : addr.address) || [];
    const cc = Array.isArray(parsed.cc)
      ? parsed.cc.map((addr) => typeof addr === 'string' ? addr : (addr as any).address || addr)
      : parsed.cc?.value?.map((addr: any) => typeof addr === 'string' ? addr : addr.address) || [];
    const bcc = Array.isArray(parsed.bcc)
      ? parsed.bcc.map((addr) => typeof addr === 'string' ? addr : (addr as any).address || addr)
      : parsed.bcc?.value?.map((addr: any) => typeof addr === 'string' ? addr : addr.address) || [];

    const subject = parsed.subject || '';
    const html = parsed.html || parsed.textAsHtml || '';
    const text = parsed.text || '';

    const attachments: Array<{ filename: string; mime: string; data: Buffer }> = [];
    if (parsed.attachments) {
      for (const att of parsed.attachments) {
        attachments.push({
          filename: att.filename || att.contentId || 'attachment',
          mime: att.contentType || 'application/octet-stream',
          data: att.content,
        });
      }
    }

    if (provider && 'importMessage' in provider) {
      const messageId = await (provider as any).importMessage(session.accountId, {
        from: { email: from.address, name: from.name },
        to: to.map((email) => ({ email })),
        cc: cc.length > 0 ? cc.map((email) => ({ email })) : undefined,
        bcc: bcc.length > 0 ? bcc.map((email) => ({ email })) : undefined,
        subject,
        html: html || text,
        date: parsed.date || new Date(),
        attachments: attachments.length > 0 ? attachments : undefined,
        folderId: data.folderId || 'inbox',
      });

      return NextResponse.json({ success: true, messageId });
    }

    return NextResponse.json({ error: 'Import not supported by provider' }, { status: 501 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('[Import] Error:', error);
    return NextResponse.json({ error: 'Failed to import message' }, { status: 500 });
  }
}
