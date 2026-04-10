import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MessageList } from '../message-list';
import { MessageViewer } from '../message-viewer';
import { getMailDesignVariant, isCalmProductivityEnabled } from '@/lib/mail-design';
import type { MessageListItem, MessageDetail } from '@/lib/types';

const mockListMessage: MessageListItem = {
  id: 'msg-1',
  threadId: 'thread-1',
  from: { email: 'sender@example.com', name: 'Sender' },
  to: [{ email: 'me@example.com', name: 'Me' }],
  subject: 'Quarterly update',
  snippet: 'Unread preview snippet',
  date: new Date('2026-04-10T12:00:00.000Z'),
  flags: {
    unread: true,
    starred: false,
    important: false,
    hasAttachments: false,
  },
  size: 1024,
};

const mockDetailMessage: MessageDetail = {
  ...mockListMessage,
  cc: [],
  bcc: [],
  replyTo: [],
  attachments: [],
  body: {
    text: 'Message body',
    html: '<p>Message body</p>',
  },
  labels: [],
};

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      messageList: {
        regionLabel: 'Message list',
        toolbarLabel: 'Message list toolbar',
        totalCount: 'Total: 0',
        selectedCount: 'Selected: 1',
        loadingMore: 'Loading more',
        empty: 'No messages',
        noResults: 'No messages',
      },
      messageViewer: {
        viewerLabel: 'Message viewer',
        selectToView: 'Select a message to view',
        loadError: 'Load error',
        loadErrorDesc: 'Failed to load message',
        noBody: 'No content',
        reply: 'Reply',
        replyAll: 'Reply all',
        forward: 'Forward',
      },
      common: {
        unknown: 'Unknown',
        noSubject: 'No subject',
        delete: 'Delete',
      },
    };

    return (key: string, values?: Record<string, unknown>) => {
      const value = translations[namespace]?.[key] ?? key;
      if (!values) return value;
      return Object.entries(values).reduce(
        (acc, [token, tokenValue]) => acc.replace(`{${token}}`, String(tokenValue)),
        value
      );
    };
  },
}));

vi.mock('@/lib/hooks', () => ({
  useLocaleSettings: () => ({
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '24h',
    timezone: 'UTC',
  }),
}));

vi.mock('../attachment-preview', () => ({
  AttachmentPreview: () => null,
}));

vi.mock('../message-translator', () => ({
  MessageTranslator: () => null,
}));

vi.mock('../delivery-tracking', () => ({
  DeliveryTracking: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderWithQueryClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Calm Productivity smoke coverage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [],
      }))
    );
  });

  it('renders message list empty state', () => {
    renderWithQueryClient(
      <MessageList
        messages={[]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        onSelectAll={vi.fn()}
        onMessageClick={vi.fn()}
      />
    );

    expect(screen.getByText('No messages')).toBeInTheDocument();
    expect(screen.getByText('Total: 0')).toBeInTheDocument();
  });

  it('renders message viewer empty state', () => {
    renderWithQueryClient(<MessageViewer message={null} />);

    expect(screen.getByText('Select a message to view')).toBeInTheDocument();
  });

  it('renders selected and unread message states', () => {
    const { container } = renderWithQueryClient(
      <MessageList
        messages={[mockListMessage]}
        selectedIds={new Set(['msg-1'])}
        onSelect={vi.fn()}
        onSelectAll={vi.fn()}
        onMessageClick={vi.fn()}
      />
    );

    expect(screen.getByText('Selected: 1')).toBeInTheDocument();
    expect(screen.getByText('Quarterly update')).toBeInTheDocument();

    const messageItem = container.querySelector('[data-testid="message-item"]');
    expect(messageItem).toHaveClass('mail-unread-surface');
    expect(messageItem).toHaveClass('mail-selected-surface');
  });

  it('renders message viewer error state', () => {
    renderWithQueryClient(
      <MessageViewer message={mockDetailMessage} error={new Error('Network timeout')} />
    );

    expect(screen.getByText('Load error')).toBeInTheDocument();
    expect(screen.getByText('Network timeout')).toBeInTheDocument();
  });

  it('renders message viewer loading state when selection exists', () => {
    renderWithQueryClient(<MessageViewer message={null} isLoading hasSelection />);

    expect(screen.getAllByRole('generic').length).toBeGreaterThan(0);
  });

  it('keeps calm productivity flag parsing stable', () => {
    expect(getMailDesignVariant('calm-productivity')).toBe('calm-productivity');
    expect(getMailDesignVariant('unknown')).toBe('legacy');
    expect(isCalmProductivityEnabled('calm-productivity')).toBe(true);
    expect(isCalmProductivityEnabled('legacy')).toBe(false);
  });
});
