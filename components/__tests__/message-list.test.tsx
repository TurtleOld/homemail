import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageList } from '../message-list';
import type { MessageListItem } from '@/lib/types';

const mockMessages: MessageListItem[] = [
  {
    id: '1',
    threadId: '1',
    from: { email: 'test@example.com', name: 'Test User' },
    subject: 'Test Subject',
    snippet: 'Test snippet',
    date: new Date(),
    flags: { unread: true, starred: false, hasAttachments: false },
    size: 1000,
  },
  {
    id: '2',
    threadId: '2',
    from: { email: 'test2@example.com' },
    subject: 'Test Subject 2',
    snippet: 'Test snippet 2',
    date: new Date(),
    flags: { unread: false, starred: true, hasAttachments: true },
    size: 2000,
  },
];

describe('MessageList', () => {
  it('should render messages', () => {
    const onSelect = vi.fn();
    const onMessageClick = vi.fn();

    render(
      <MessageList
        messages={mockMessages}
        selectedIds={new Set()}
        onSelect={onSelect}
        onSelectAll={() => {}}
        onMessageClick={onMessageClick}
      />
    );

    expect(screen.getByText('Test Subject')).toBeInTheDocument();
    expect(screen.getByText('Test Subject 2')).toBeInTheDocument();
  });

  it('should show selected count', () => {
    render(
      <MessageList
        messages={mockMessages}
        selectedIds={new Set(['1'])}
        onSelect={vi.fn()}
        onSelectAll={() => {}}
        onMessageClick={vi.fn()}
      />
    );

    expect(screen.getByText(/Выбрано: 1/)).toBeInTheDocument();
  });
});
