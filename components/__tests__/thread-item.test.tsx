import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThreadItem } from '../thread-item';
import type { MessageListItem } from '@/lib/types';
import type { ThreadGroup } from '@/lib/thread-utils';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const translations: Record<string, string> = {
      threadAriaLabel: `Conversation: ${values?.subject}, ${values?.count} messages`,
      selectThread: `Select conversation ${values?.subject}`,
      expandThread: 'Expand conversation',
      collapseThread: 'Collapse conversation',
      star: 'Star',
      unstar: 'Unstar',
      important: 'Important',
    };
    return translations[key] || key;
  },
}));

vi.mock('@/lib/hooks', () => ({
  useLocaleSettings: () => ({ language: 'en', dateFormat: 'MM/DD/YYYY', timeFormat: '24h', timezone: 'UTC' }),
}));

const latestMessage: MessageListItem = {
  id: 'message-2',
  threadId: 'thread-1',
  from: { email: 'sender@example.test', name: 'Sender' },
  to: [{ email: 'me@example.test' }],
  subject: 'Family schedule',
  snippet: 'Latest reply',
  date: new Date('2026-07-18T10:00:00Z'),
  flags: { unread: true, starred: false, important: false, hasAttachments: false },
  size: 1000,
};

const olderMessage: MessageListItem = {
  ...latestMessage,
  id: 'message-1',
  snippet: 'Original message',
  date: new Date('2026-07-17T10:00:00Z'),
};

const thread: ThreadGroup = {
  threadId: 'thread-1',
  messages: [latestMessage, olderMessage],
  unreadCount: 1,
  hasStarred: false,
  hasImportant: false,
  latestDate: latestMessage.date,
};

function makeDataTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: '',
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
  } as unknown as DataTransfer;
}

describe('ThreadItem drag-and-drop', () => {
  it('makes the collapsed thread row draggable and sends the real message id, not a URL', () => {
    const onDragStart = vi.fn();
    render(
      <ThreadItem
        thread={thread}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        onMessageClick={vi.fn()}
        getMessageHref={(message) => `/en/mail/messages/${message.id}?folder=inbox`}
        onDragStart={onDragStart}
      />
    );

    const row = screen.getByRole('article');
    expect(row).toHaveAttribute('draggable', 'true');

    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(row, { dataTransfer });

    expect(dataTransfer.getData('text/plain')).toBe('message-2');
    expect(JSON.parse(dataTransfer.getData('application/json'))).toEqual({
      type: 'message',
      id: 'message-2',
    });
    expect(onDragStart).toHaveBeenCalledWith('message-2');
  });

  it('is not draggable when no drag handler is supplied', () => {
    render(
      <ThreadItem
        thread={thread}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        onMessageClick={vi.fn()}
        getMessageHref={(message) => `/en/mail/messages/${message.id}`}
      />
    );

    expect(screen.getByRole('article')).toHaveAttribute('draggable', 'false');
  });
});
