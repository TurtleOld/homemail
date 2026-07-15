import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../sidebar';
import { SearchBar } from '../search-bar';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) =>
    ({
      appHeading: 'Mail',
      compose: 'Compose',
      foldersSection: 'Folders',
      quickViewsSection: 'Quick views',
      quickInbox: 'Inbox',
      quickUnread: 'Unread',
      quickStarred: 'Starred',
      quickAttachments: 'With attachments',
      settingsLabel: 'Settings',
      defaultAccount: 'Account',
    })[key] || key,
}));

function renderWithQueryClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Workspace shell', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ accounts: [] }) }))
    );
  });

  it('renders quick views above server folders and changes scope without selecting a folder', () => {
    const onFolderSelect = vi.fn();
    const onQuickFilterChange = vi.fn();

    renderWithQueryClient(
      <Sidebar
        folders={[{ id: 'inbox-id', name: 'Primary inbox', role: 'inbox', unreadCount: 4 }]}
        account={null}
        selectedFolderId="inbox-id"
        onFolderSelect={onFolderSelect}
        onCompose={vi.fn()}
        activeQuickFilter="unread"
        onQuickFilterChange={onQuickFilterChange}
      />
    );

    const quickViews = screen.getByRole('navigation', { name: 'Quick views' });
    const folders = screen.getByText('Folders');
    expect(
      quickViews.compareDocumentPosition(folders) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Starred' }));
    expect(onQuickFilterChange).toHaveBeenCalledWith('starred');
    expect(onFolderSelect).not.toHaveBeenCalled();
  });

  it('exposes the global search as a semantic search region', () => {
    const onChange = vi.fn();
    renderWithQueryClient(<SearchBar value="" onChange={onChange} placeholder="Search mail" />);

    const input = screen.getByPlaceholderText('Search mail');
    expect(screen.getByRole('search')).toContainElement(input);
    expect(input).toHaveAttribute('data-mail-search');

    fireEvent.change(input, { target: { value: 'from:anna@example.com' } });
    expect(onChange).toHaveBeenCalledWith('from:anna@example.com');
  });
});
