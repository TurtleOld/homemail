import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock next/navigation hooks used by the page
vi.mock('next/navigation', () => {
  return {
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(''),
  };
});

import LoginPage from '../page';

describe('LoginPage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetAllMocks();
  });

  it('double click on submit does not send 2 login requests', async () => {
    // 1) auth config
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ authMode: 'basic', passwordLoginEnabled: true }) })
      // 2) login request
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    render(<LoginPage />);

    // Wait for auth config to load
    await waitFor(() => {
      expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'secret' } });

    const btn = screen.getByRole('button', { name: 'Войти' });
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls.map((c: any[]) => c[0]);
      const loginCalls = calls.filter((u: string) => u === '/api/auth/login');
      expect(loginCalls).toHaveLength(1);
    });
  });

  it('in oauth-mode with password login disabled, password login is not called', async () => {
    // 1) auth config => oauth mode
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ authMode: 'oauth', passwordLoginEnabled: false }) })
      // 2) device-code
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          deviceCode: 'dev',
          userCode: 'USER',
          verificationUri: 'https://auth.example.com',
          expiresIn: 600,
          interval: 5,
        }),
      })
      // 3) poll (pending)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: false, error: 'authorization_pending' }) });

    render(<LoginPage />);

    // Wait for oauth mode to be detected (password field should not be present)
    await waitFor(() => {
      expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'user@example.com' } });

    const btn = screen.getByRole('button', { name: 'Войти' });
    fireEvent.click(btn);

    await waitFor(() => {
      const urls = (global.fetch as any).mock.calls.map((c: any[]) => c[0]);
      expect(urls).toContain('/api/auth/oauth/device-code');
      expect(urls).not.toContain('/api/auth/login');
    }, { timeout: 3000 });
  });
});
