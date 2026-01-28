import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock next/navigation hooks used by the page
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => {
  return {
    useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
    useSearchParams: () => new URLSearchParams(''),
  };
});

import LoginPage from '../page';

describe('LoginPage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    // Mock window.location.href
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetAllMocks();
  });

  it('shows OAuth login button and handles click', async () => {
    // Mock auth config
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authMode: 'oauth', passwordLoginEnabled: false }),
    });

    render(<LoginPage />);

    // Wait for OAuth button to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Войти через OAuth/i })).toBeInTheDocument();
    });

    // Verify no password fields are present
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Логин')).not.toBeInTheDocument();

    // Click OAuth button
    const oauthButton = screen.getByRole('button', { name: /Войти через OAuth/i });
    fireEvent.click(oauthButton);

    // Should redirect to authorize endpoint
    await waitFor(() => {
      expect(window.location.href).toContain('/api/auth/oauth/authorize');
    });
  });

  it('double click on OAuth button does not cause multiple redirects', async () => {
    // Mock auth config
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authMode: 'oauth', passwordLoginEnabled: false }),
    });

    render(<LoginPage />);

    // Wait for OAuth button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Войти через OAuth/i })).toBeInTheDocument();
    });

    const oauthButton = screen.getByRole('button', { name: /Войти через OAuth/i });
    
    // First click
    fireEvent.click(oauthButton);
    
    // Button should be disabled (loading state)
    await waitFor(() => {
      expect(oauthButton).toBeDisabled();
    });

    // Second click should not do anything (button is disabled)
    fireEvent.click(oauthButton);

    // Should only set location.href once
    await waitFor(() => {
      expect(window.location.href).toContain('/api/auth/oauth/authorize');
    });
  });

  it('shows info about OAuth authorization', async () => {
    // Mock auth config
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authMode: 'oauth', passwordLoginEnabled: false }),
    });

    render(<LoginPage />);

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText(/Безопасная OAuth авторизация/i)).toBeInTheDocument();
    });

    // Check that info text is present
    expect(screen.getByText(/Вы будете перенаправлены на сервер Stalwart/i)).toBeInTheDocument();
  });
});
