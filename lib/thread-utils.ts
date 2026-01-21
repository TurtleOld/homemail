import type { MessageListItem } from './types';

export interface ThreadGroup {
  threadId: string;
  messages: MessageListItem[];
  unreadCount: number;
  hasStarred: boolean;
  latestDate: Date;
}

export function groupMessagesByThread(messages: MessageListItem[]): ThreadGroup[] {
  const threadMap = new Map<string, MessageListItem[]>();

  for (const message of messages) {
    const threadId = ('threadId' in message && typeof (message as any).threadId === 'string' ? (message as any).threadId : message.id) as string;
    if (!threadMap.has(threadId)) {
      threadMap.set(threadId, []);
    }
    threadMap.get(threadId)!.push(message);
  }

  const threads: ThreadGroup[] = [];

  for (const [threadId, threadMessages] of threadMap.entries()) {
    threadMessages.sort((a, b) => {
      const aDate = a.date instanceof Date ? a.date : new Date(a.date);
      const bDate = b.date instanceof Date ? b.date : new Date(b.date);
      return bDate.getTime() - aDate.getTime();
    });

    const unreadCount = threadMessages.filter((m) => m.flags.unread).length;
    const hasStarred = threadMessages.some((m) => m.flags.starred);
    const firstMessage = threadMessages[0]!;
    const latestDate = firstMessage.date instanceof Date ? firstMessage.date : new Date(firstMessage.date);

    threads.push({
      threadId,
      messages: threadMessages,
      unreadCount,
      hasStarred,
      latestDate,
    });
  }

  threads.sort((a, b) => {
    const aDate = a.latestDate instanceof Date ? a.latestDate : new Date(a.latestDate);
    const bDate = b.latestDate instanceof Date ? b.latestDate : new Date(b.latestDate);
    return bDate.getTime() - aDate.getTime();
  });

  return threads;
}
