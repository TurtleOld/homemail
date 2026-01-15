import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { validateOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

const sendSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  html: z.string(),
  draftId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        mime: z.string(),
        data: z.string(),
      })
    )
    .optional(),
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
    const data = sendSchema.parse(body);

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();
    const messageId = await provider.sendMessage(session.accountId, {
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      html: data.html,
      attachments: data.attachments?.map((att) => ({
        filename: att.filename,
        mime: att.mime,
        data: Buffer.from(att.data, 'base64'),
      })),
    });

    if (data.draftId) {
      try {
        await provider.bulkUpdateMessages(session.accountId, {
          ids: [data.draftId],
          action: 'delete',
        });
      } catch (error) {
        logger.error('Failed to delete draft after sending:', error);
      }
    }

    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('Send message error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
