import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';

const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(['markRead', 'markUnread', 'move', 'delete', 'spam', 'star', 'unstar']),
  payload: z
    .object({
      folderId: z.string().optional(),
    })
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

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || session.accountId;
  const rateLimit = checkRateLimit(ip, 'bulk');

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', resetAt: rateLimit.resetAt },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const action = bulkActionSchema.parse(body);

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();
    await provider.bulkUpdateMessages(session.accountId, action);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
