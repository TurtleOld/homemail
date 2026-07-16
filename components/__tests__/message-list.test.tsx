import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageList } from '../message-list';
import type { MessageListItem } from '@/lib/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const translations: Record<string, string> = {
      messageAriaLabel: `Message from ${values?.sender}: ${values?.subject}`,
      selectMessage: `Select message from ${values?.sender}`,
      selectedCount: `Selected: ${values?.count}`,
      totalCount: `Total: ${values?.count}`,
      regionLabel: 'Message list',
      toolbarLabel: 'Message list actions',
      selectAll: 'Select all messages',
      empty: 'No messages',
      noResults: 'No results found',
      noSubject: '(no subject)',
      threadAriaLabel: `Conversation: ${values?.subject}, ${values?.count} messages`,
      selectThread: `Select conversation ${values?.subject}`,
      expandThread: 'Expand conversation',
      collapseThread: 'Collapse conversation',
    };
    return translations[key] || key;
  },
}));

const mockMessages: MessageListItem[] = [
  {
    id: '1',
    threadId: '1',
    from: { email: 'test@example.com', name: 'Test User' },
    to: [{ email: 'me@example.com' }],
    subject: 'Test Subject',
    snippet: 'Test snippet',
    date: new Date(),
    flags: { unread: true, starred: false, important: false, hasAttachments: false },
    size: 1000,
  },
  {
    id: '2',
    threadId: '2',
    from: { email: 'test2@example.com' },
    to: [{ email: 'me@example.com' }],
    subject: 'Test Subject 2',
    snippet: 'Test snippet 2',
    date: new Date(),
    flags: { unread: false, starred: true, important: false, hasAttachments: true },
    size: 2000,
  },
];

describe('MessageList', () => {
  it('should render messages', () => {
    const onSelect = vi.fn();
    const onMessageClick = vi.fn();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MessageList
          messages={mockMessages}
          selectedIds={new Set()}
          onSelect={onSelect}
          onSelectAll={() => {}}
          onMessageClick={onMessageClick}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('Test Subject')).toBeInTheDocument();
    expect(screen.getByText('Test Subject 2')).toBeInTheDocument();
  });

  it('should show selected count', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MessageList
          messages={mockMessages}
          selectedIds={new Set(['1'])}
          onSelect={vi.fn()}
          onSelectAll={() => {}}
          onMessageClick={vi.fn()}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('Selected: 1')).toBeInTheDocument();
  });

  it('clears selection with Escape', () => {
    const onClearSelection = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MessageList
          messages={mockMessages}
          selectedIds={new Set(['1'])}
          onSelect={vi.fn()}
          onSelectAll={vi.fn()}
          onClearSelection={onClearSelection}
          onMessageClick={vi.fn()}
        />
      </QueryClientProvider>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it('keeps conversation view available with the selected density', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const threadMessages = mockMessages.map((message) => ({
      ...message,
      threadId: 'shared-thread',
    }));

    render(
      <QueryClientProvider client={queryClient}>
        <MessageList
          messages={threadMessages}
          selectedIds={new Set()}
          onSelect={vi.fn()}
          onSelectAll={vi.fn()}
          onMessageClick={vi.fn()}
          conversationView
          density="compact"
        />
      </QueryClientProvider>
    );

    const expandButton = screen.getByRole('button', { name: 'Expand conversation' });
    expect(expandButton.closest('article')).toHaveClass('min-h-12');
  });
});
