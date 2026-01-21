import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import type { DeliveryTracking } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');

    if (!messageId) {
      return NextResponse.json({ error: 'messageId required' }, { status: 400 });
    }

    const tracking = await readStorage<DeliveryTracking | null>(
      `delivery:${session.accountId}:${messageId}`,
      null
    );

    if (!tracking) {
      return NextResponse.json({ error: 'Tracking not found' }, { status: 404 });
    }

    return NextResponse.json(tracking);
  } catch (error) {
    console.error('Error fetching delivery tracking:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const { messageId, status, recipientEmail, deliveredAt, readAt } = body;

    if (!messageId || !status) {
      return NextResponse.json({ error: 'messageId and status required' }, { status: 400 });
    }

    const tracking = await readStorage<DeliveryTracking | null>(
      `delivery:${session.accountId}:${messageId}`,
      null
    );

    if (!tracking) {
      return NextResponse.json({ error: 'Tracking not found' }, { status: 404 });
    }

    const updatedTracking: DeliveryTracking = {
      ...tracking,
      status: status as DeliveryTracking['status'],
      updatedAt: new Date(),
    };

    if (deliveredAt) {
      updatedTracking.deliveredAt = new Date(deliveredAt);
    }

    if (readAt) {
      updatedTracking.readAt = new Date(readAt);
    }

    if (recipientEmail) {
      const recipientIndex = updatedTracking.recipients.findIndex((r) => r.email === recipientEmail);
      if (recipientIndex >= 0) {
        updatedTracking.recipients[recipientIndex] = {
          ...updatedTracking.recipients[recipientIndex],
          status: status as DeliveryTracking['status'],
          deliveredAt: deliveredAt ? new Date(deliveredAt) : updatedTracking.recipients[recipientIndex].deliveredAt,
          readAt: readAt ? new Date(readAt) : updatedTracking.recipients[recipientIndex].readAt,
        };
      }
    }

    await writeStorage(`delivery:${session.accountId}:${messageId}`, updatedTracking);

    return NextResponse.json(updatedTracking);
  } catch (error) {
    console.error('Error updating delivery tracking:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
