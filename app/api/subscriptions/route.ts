import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import { z } from 'zod';
import type { EmailSubscription } from '@/lib/types';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscriptions = await readStorage<EmailSubscription[]>(
      `subscriptions:${session.accountId}`,
      []
    );

    return NextResponse.json(subscriptions);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const unsubscribeSchema = z.object({
  subscriptionIds: z.array(z.string()),
});

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = unsubscribeSchema.parse(body);

    const subscriptions = await readStorage<EmailSubscription[]>(
      `subscriptions:${session.accountId}`,
      []
    );

    const updatedSubscriptions = subscriptions.map((sub) => {
      if (data.subscriptionIds.includes(sub.id)) {
        return { ...sub, isActive: false, updatedAt: new Date() };
      }
      return sub;
    });

    await writeStorage(`subscriptions:${session.accountId}`, updatedSubscriptions);

    const unsubscribed = updatedSubscriptions.filter((sub) => 
      data.subscriptionIds.includes(sub.id) && sub.unsubscribeUrl
    );

    for (const sub of unsubscribed) {
      if (sub.unsubscribeUrl) {
        try {
          await fetch(sub.unsubscribeUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'MailClient/1.0',
            },
          });
        } catch (error) {
          console.error(`Failed to unsubscribe from ${sub.senderEmail}:`, error);
        }
      }
    }

    return NextResponse.json({ success: true, unsubscribed: unsubscribed.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error unsubscribing:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
