import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { readStorage } from '@/lib/storage';

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();

    const folders = await provider.getFolders(session.accountId);
    const inbox = folders.find((f) => f.role === 'inbox');
    const sent = folders.find((f) => f.role === 'sent');
    const drafts = folders.find((f) => f.role === 'drafts');
    const trash = folders.find((f) => f.role === 'trash');

    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const inboxMessages = inbox
      ? await provider.getMessages(session.accountId, inbox.id, {
          limit: 1000,
          q: `after:${last30Days.toISOString().split('T')[0]}`,
        })
      : { messages: [] };

    const sentMessages = sent
      ? await provider.getMessages(session.accountId, sent.id, {
          limit: 1000,
          q: `after:${last30Days.toISOString().split('T')[0]}`,
        })
      : { messages: [] };

    const messagesByDay: Record<string, { incoming: number; outgoing: number }> = {};
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0]!;
      messagesByDay[dateKey] = { incoming: 0, outgoing: 0 };
    }

    inboxMessages.messages.forEach((msg) => {
      const dateKey = new Date(msg.date).toISOString().split('T')[0]!;
      if (messagesByDay[dateKey]) {
        messagesByDay[dateKey]!.incoming++;
      }
    });

    sentMessages.messages.forEach((msg) => {
      const dateKey = new Date(msg.date).toISOString().split('T')[0]!;
      if (messagesByDay[dateKey]) {
        messagesByDay[dateKey]!.outgoing++;
      }
    });

    const topSenders: Record<string, number> = {};
    inboxMessages.messages.forEach((msg) => {
      const sender = msg.from.email;
      topSenders[sender] = (topSenders[sender] || 0) + 1;
    });

    const topSendersList = Object.entries(topSenders)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([email, count]) => ({ email, count }));

    const totalMessages = folders.reduce((sum, f) => sum + (f.unreadCount || 0), 0);
    const totalUnread = inbox?.unreadCount || 0;
    const totalSent = sentMessages.messages.length;
    const totalDrafts = drafts?.unreadCount || 0;

    const messageLabels = await readStorage<Record<string, string[]>>(
      `messageLabels:${session.accountId}`,
      {}
    );

    const labels = await readStorage<any[]>(`labels:${session.accountId}`, []);
    const labelStats: Record<string, number> = {};
    labels.forEach((label) => {
      labelStats[label.id] = Object.values(messageLabels).filter((ids) => ids.includes(label.id)).length;
    });

    return NextResponse.json({
      totalMessages,
      totalUnread,
      totalSent,
      totalDrafts,
      messagesByDay: Object.entries(messagesByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, ...counts })),
      topSenders: topSendersList,
      labelStats,
      folderStats: folders.map((f) => ({
        id: f.id,
        name: f.name,
        role: f.role,
        unreadCount: f.unreadCount,
      })),
    });
  } catch (error) {
    console.error('[Statistics] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
