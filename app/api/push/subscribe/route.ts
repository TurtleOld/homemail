import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import { z } from 'zod';

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
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
    const data = subscribeSchema.parse(body);

    const subscriptions = await readStorage<Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>>(
      `pushSubscriptions:${session.accountId}`,
      []
    );

    const existingIndex = subscriptions.findIndex((s) => s.endpoint === data.subscription.endpoint);
    if (existingIndex >= 0) {
      subscriptions[existingIndex] = data.subscription;
    } else {
      subscriptions.push(data.subscription);
    }

    await writeStorage(`pushSubscriptions:${session.accountId}`, subscriptions);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('[PushSubscribe] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
