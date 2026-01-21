import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import type { EmailSubscription, MessageDetail } from '@/lib/types';

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
    const { messageIds } = body as { messageIds: string[] };

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: 'messageIds required' }, { status: 400 });
    }

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();

    const subscriptions = await readStorage<EmailSubscription[]>(
      `subscriptions:${session.accountId}`,
      []
    );

    const subscriptionMap = new Map<string, EmailSubscription>();
    subscriptions.forEach((sub) => {
      subscriptionMap.set(sub.senderEmail.toLowerCase(), sub);
    });

    const detected: EmailSubscription[] = [];

    for (const messageId of messageIds) {
      try {
        const message = await provider.getMessage(session.accountId, messageId);
        if (!message) continue;

        const senderEmail = message.from.email.toLowerCase();
        const existing = subscriptionMap.get(senderEmail);

        const unsubscribeUrl = extractUnsubscribeUrl(message);
        const listUnsubscribe = extractListUnsubscribe(message);

        if (existing) {
          existing.messageCount += 1;
          existing.lastMessageDate = message.date > existing.lastMessageDate ? message.date : existing.lastMessageDate;
          if (unsubscribeUrl && !existing.unsubscribeUrl) {
            existing.unsubscribeUrl = unsubscribeUrl;
          }
          if (listUnsubscribe && !existing.listUnsubscribe) {
            existing.listUnsubscribe = listUnsubscribe;
          }
          existing.updatedAt = new Date();
        } else {
          const newSubscription: EmailSubscription = {
            id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            senderEmail: message.from.email,
            senderName: message.from.name,
            unsubscribeUrl,
            listUnsubscribe,
            lastMessageDate: message.date,
            messageCount: 1,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          subscriptionMap.set(senderEmail, newSubscription);
          detected.push(newSubscription);
        }
      } catch (error) {
        console.error(`Error processing message ${messageId}:`, error);
      }
    }

    const updatedSubscriptions = Array.from(subscriptionMap.values());
    await writeStorage(`subscriptions:${session.accountId}`, updatedSubscriptions);

    return NextResponse.json({
      success: true,
      detected: detected.length,
      total: updatedSubscriptions.length,
    });
  } catch (error) {
    console.error('Error detecting subscriptions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function extractUnsubscribeUrl(message: MessageDetail): string | undefined {
  const headers = (message as any).headers || {};
  const unsubscribeHeader = headers['list-unsubscribe'] || headers['List-Unsubscribe'];
  if (typeof unsubscribeHeader === 'string') {
    const match = unsubscribeHeader.match(/<([^>]+)>/);
    if (match) {
      return match[1];
    }
    if (unsubscribeHeader.startsWith('http://') || unsubscribeHeader.startsWith('https://')) {
      return unsubscribeHeader;
    }
  }
  return undefined;
}

function extractListUnsubscribe(message: MessageDetail): string | undefined {
  const headers = (message as any).headers || {};
  const listUnsubscribe = headers['list-unsubscribe-post'] || headers['List-Unsubscribe-Post'];
  return typeof listUnsubscribe === 'string' ? listUnsubscribe : undefined;
}
