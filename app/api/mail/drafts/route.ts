import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { validateOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

const draftSchema = z.object({
  id: z.string().optional(),
  to: z.array(z.string().email()).optional().default([]),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().optional().default(''),
  html: z.string().optional().default(''),
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
    const parsed = draftSchema.parse(body);

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();
    const draft = {
      ...parsed,
      to: parsed.to && parsed.to.length > 0 ? parsed.to : [],
      cc: parsed.cc && parsed.cc.length > 0 ? parsed.cc : undefined,
      bcc: parsed.bcc && parsed.bcc.length > 0 ? parsed.bcc : undefined,
      subject: parsed.subject || '',
      html: parsed.html || '',
    };
    const draftId = await provider.saveDraft(session.accountId, draft);

    return NextResponse.json({ success: true, id: draftId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('[drafts] Validation error:', error.errors);
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('[drafts] Error saving draft:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: 'Failed to save draft', message: errorMessage },
      { status: 500 }
    );
  }
}
