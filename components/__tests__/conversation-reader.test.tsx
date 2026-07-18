import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MessageDetail, MessageThreadDetail } from '@/lib/types';
import { ConversationReader } from '../conversation-reader';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => ({
    regionLabel: 'Conversation',
    messageCount: `${values?.count} messages`,
    truncated: `Showing ${values?.count} of ${values?.total} messages.`,
    openMessage: `Open message from ${values?.sender}`,
  })[key] || key,
}));

vi.mock('@/lib/hooks', () => ({
  useLocaleSettings: () => ({ language: 'en' }),
}));

vi.mock('../message-viewer', () => ({
  MessageViewer: ({ message }: { message: MessageDetail }) => (
    <div data-testid="active-message">{message.id}</div>
  ),
}));

const olderMessage: MessageDetail = {
  id: 'message-1',
  threadId: 'thread-1',
  from: { name: 'Elena Petrova', email: 'elena@example.test' },
  to: [{ email: 'alexander@example.test' }],
  subject: 'Family schedule',
  date: new Date('2026-07-17T10:00:00Z'),
  body: { html: '<p>The tickets are attached.</p>' },
  attachments: [],
  flags: { unread: false, starred: false, important: false, hasAttachments: false },
};

const activeMessage: MessageDetail = {
  ...olderMessage,
  id: 'message-2',
  from: { name: 'Alexander Pavlov', email: 'alexander@example.test' },
  date: new Date('2026-07-18T10:00:00Z'),
  body: { text: 'I checked every passenger name.' },
};

const thread: MessageThreadDetail = {
  id: 'thread-1',
  messages: [olderMessage, activeMessage],
  total: 2,
  truncated: false,
};

describe('ConversationReader', () => {
  it('keeps the active message expanded and opens a collapsed message through the route callback', () => {
    const onActivateMessage = vi.fn();
    render(
      <ConversationReader
        thread={thread}
        activeMessage={activeMessage}
        onActivateMessage={onActivateMessage}
        getMessageHref={(messageId) => `/en/mail/messages/${messageId}?folder=inbox`}
      />
    );

    expect(screen.getByRole('heading', { name: 'Family schedule' })).toBeInTheDocument();
    expect(screen.getByText('2 messages')).toBeInTheDocument();
    expect(screen.getByTestId('active-message')).toHaveTextContent('message-2');

    const olderMessageLink = screen.getByRole('link', { name: 'Open message from Elena Petrova' });
    expect(olderMessageLink).toHaveAttribute(
      'href',
      '/en/mail/messages/message-1?folder=inbox'
    );
    fireEvent.click(olderMessageLink);
    expect(onActivateMessage).toHaveBeenCalledWith('message-1');
  });

  it('announces when the server response is truncated', () => {
    render(
      <ConversationReader
        thread={{ ...thread, total: 84, truncated: true }}
        activeMessage={activeMessage}
        onActivateMessage={vi.fn()}
        getMessageHref={(messageId) => `/en/mail/messages/${messageId}`}
      />
    );

    expect(screen.getByText('Showing 2 of 84 messages.')).toBeInTheDocument();
  });

  it('keeps an active message that is outside the bounded thread response', () => {
    const selectedOlderMessage = { ...olderMessage, id: 'message-0' };
    render(
      <ConversationReader
        thread={thread}
        activeMessage={selectedOlderMessage}
        onActivateMessage={vi.fn()}
        getMessageHref={(messageId) => `/en/mail/messages/${messageId}`}
      />
    );

    expect(screen.getByTestId('active-message')).toHaveTextContent('message-0');
  });
});
