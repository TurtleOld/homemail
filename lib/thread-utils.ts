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
    const threadId = message.threadId || message.id;
    if (!threadMap.has(threadId)) {
      threadMap.set(threadId, []);
    }
    threadMap.get(threadId)!.push(message);
  }

  const threads: ThreadGroup[] = [];

  for (const [threadId, threadMessages] of threadMap.entries()) {
    threadMessages.sort((a, b) => b.date.getTime() - a.date.getTime());

    const unreadCount = threadMessages.filter((m) => m.flags.unread).length;
    const hasStarred = threadMessages.some((m) => m.flags.starred);
    const latestDate = threadMessages[0]!.date;

    threads.push({
      threadId,
      messages: threadMessages,
      unreadCount,
      hasStarred,
      latestDate,
    });
  }

  threads.sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());

  return threads;
}
