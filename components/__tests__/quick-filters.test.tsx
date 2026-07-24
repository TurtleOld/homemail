import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickFilters } from '../quick-filters';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      button: 'Filters',
      clear: 'Clear filter',
      unread: 'Unread',
      read: 'Read',
      withAttachments: 'With attachments',
      starred: 'Starred',
      important: 'Important',
      categoryStatus: 'Status',
      categoryAttachments: 'Attachments',
      categoryMarkers: 'Markers',
    })[key] || key,
}));

describe('QuickFilters', () => {
  it('shows only reliable message-property filters', async () => {
    const user = userEvent.setup();
    render(<QuickFilters onFilterChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));

    expect(screen.getByRole('menuitem', { name: 'Unread' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Read' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'With attachments' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Starred' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Important' })).toBeInTheDocument();
    expect(screen.queryByText('Inbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Sent')).not.toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });

  it('selects and clears an active filter', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const { rerender } = render(<QuickFilters onFilterChange={onFilterChange} />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('menuitem', { name: 'Unread' }));
    expect(onFilterChange).toHaveBeenCalledWith('unread');

    rerender(<QuickFilters activeFilter="unread" onFilterChange={onFilterChange} />);
    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(onFilterChange).toHaveBeenLastCalledWith(undefined);
  });
});
