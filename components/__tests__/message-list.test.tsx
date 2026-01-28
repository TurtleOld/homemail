import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageList } from '../message-list';
import type { MessageListItem } from '@/lib/types';

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

    expect(screen.getByText(/Выбрано: 1/)).toBeInTheDocument();
  });
});
