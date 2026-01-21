import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import type { DeliveryTracking } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messageId, accountId, recipientEmail } = body;

    if (!messageId || !accountId) {
      return NextResponse.json({ error: 'messageId and accountId required' }, { status: 400 });
    }

    const tracking = await readStorage<DeliveryTracking | null>(
      `delivery:${accountId}:${messageId}`,
      null
    );

    if (!tracking) {
      return NextResponse.json({ error: 'Tracking not found' }, { status: 404 });
    }

    const readAt = new Date();
    const updatedTracking: DeliveryTracking = {
      ...tracking,
      status: 'read',
      readAt,
      updatedAt: readAt,
    };

    if (recipientEmail) {
      const recipientIndex = updatedTracking.recipients.findIndex((r) => r.email === recipientEmail);
      if (recipientIndex >= 0) {
        updatedTracking.recipients[recipientIndex] = {
          ...updatedTracking.recipients[recipientIndex],
          status: 'read',
          readAt,
        };
      }
    }

    await writeStorage(`delivery:${accountId}:${messageId}`, updatedTracking);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing read receipt:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
