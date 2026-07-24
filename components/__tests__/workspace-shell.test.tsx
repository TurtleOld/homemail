import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../sidebar';
import { SearchBar } from '../search-bar';
import { AccountMenu } from '../account-menu';

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
      settingsLabel: 'Settings',
      defaultAccount: 'Account',
      accountMenu: 'Account menu',
      currentMailbox: 'Current mailbox',
      switchMailbox: 'Switch mailbox',
      mailSettings: 'Mail settings',
      manageInStalwart: 'Manage in Stalwart',
      logout: 'Sign out',
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
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ accounts: [] }) }))
    );
  });

  it('uses server folders as the only sidebar message navigation', () => {
    const onFolderSelect = vi.fn();

    renderWithQueryClient(
      <Sidebar
        folders={[{ id: 'inbox-id', name: 'Primary inbox', role: 'inbox', unreadCount: 4 }]}
        selectedFolderId="inbox-id"
        onFolderSelect={onFolderSelect}
        onCompose={vi.fn()}
      />
    );

    expect(screen.queryByText('Quick views')).not.toBeInTheDocument();
    expect(screen.getByText('Primary inbox')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Primary inbox/ }));
    expect(onFolderSelect).toHaveBeenCalledWith('inbox-id');
  });

  it('exposes the global search as a semantic search region', () => {
    const onChange = vi.fn();
    renderWithQueryClient(<SearchBar value="" onChange={onChange} placeholder="Search mail" />);

    const input = screen.getByPlaceholderText('Search mail');
    const searchRegion = screen.getByRole('search');
    expect(searchRegion).toContainElement(input);
    expect(searchRegion).toContainElement(
      screen.getByLabelText('Нажмите слэш, чтобы перейти к поиску')
    );
    expect(input).toHaveAttribute('data-mail-search');

    fireEvent.change(input, { target: { value: 'from:anna@example.com' } });
    expect(onChange).toHaveBeenCalledWith('from:anna@example.com');
  });

  it('shows the current mailbox once and routes account management to Stalwart', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          accounts: [
            {
              id: 'account-1',
              email: 'alexander@example.com',
              displayName: 'Alexander',
              isActive: true,
            },
          ],
        }),
      }))
    );

    renderWithQueryClient(
      <AccountMenu
        account={{ id: 'account-1', email: 'alexander@example.com', displayName: 'Alexander' }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Account menu' }));

    expect(screen.getAllByText('alexander@example.com')).toHaveLength(1);
    expect(screen.queryByText('Add account')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('menuitem', { name: 'Manage in Stalwart' }));
    expect(push).toHaveBeenCalledWith('/en/settings/stalwart');
  });
});
