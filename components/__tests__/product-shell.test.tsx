import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProductShellFeatureProvider } from '@/components/product-shell/shell-feature-context';
import { RouteAwareShell } from '@/components/product-shell/route-aware-shell';
import { WorkspaceFrame } from '@/components/product-shell/workspace-frame';
import {
  WorkspaceLoading,
  WorkspaceOfflineBar,
  WorkspaceState,
} from '@/components/product-shell/workspace-state';

let pathname = '/en/settings';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

describe('product shell feature boundary', () => {
  it('adds a route-aware boundary unconditionally', () => {
    pathname = '/ru/settings/stalwart';
    const { container } = render(
      <ProductShellFeatureProvider>
        <RouteAwareShell><main>System content</main></RouteAwareShell>
      </ProductShellFeatureProvider>
    );

    expect(container.querySelector('[data-product-shell="enabled"]'))
      .toHaveAttribute('data-workspace', 'system');
  });
});

describe('workspace frame', () => {
  it('exposes desktop navigation and an accessible mobile drawer', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceFrame
        workspace="settings"
        title="Settings"
        description="Member preferences"
        navigationLabel="Settings sections"
        navigation={[
          { href: '/en/settings', label: 'Appearance', current: true },
          { href: '/en/settings/notifications', label: 'Notifications' },
        ]}
        backHref="/en/mail"
        backLabel="Back to mail"
        menuLabel="Open navigation"
        closeMenuLabel="Close navigation"
      >
        <p>Workspace content</p>
      </WorkspaceFrame>
    );

    expect(screen.getAllByRole('navigation', { name: 'Settings sections' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getAllByRole('navigation', { name: 'Settings sections' })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.getAllByRole('navigation', { name: 'Settings sections' })).toHaveLength(1);
  });
});

describe('shared workspace states', () => {
  it('provides semantic loading, offline, empty, permission, and error states', () => {
    const { rerender } = render(<WorkspaceLoading label="Loading messages" />);
    expect(screen.getByRole('status', { name: 'Loading messages' })).toBeInTheDocument();

    rerender(<WorkspaceOfflineBar message="Offline" />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline');

    for (const kind of ['empty', 'unauthorized', 'forbidden'] as const) {
      rerender(<WorkspaceState kind={kind} title={kind} description="Description" />);
      expect(screen.getByRole('status')).toHaveTextContent(kind);
    }

    rerender(<WorkspaceState kind="error" title="Could not load" description="Try again" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
  });
});
