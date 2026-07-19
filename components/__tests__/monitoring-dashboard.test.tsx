import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import russian from '@/messages/ru.json';
import { MonitoringDashboard } from '../monitoring-dashboard';

function renderWithQueryClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="ru" messages={russian}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const baseHealth = {
  status: 'healthy' as const,
  timestamp: '2026-07-19T00:00:00.000Z',
  system: { uptime: 3600, memory: { used: 100, total: 200, percentage: 50 } },
  security: {
    recentEvents: { total: 0, byType: {}, bySeverity: {} },
    last24Hours: { failedLogins: 0, blockedIps: 0, csrfViolations: 0, suspiciousActivity: 0 },
  },
  storage: { available: true, writable: true },
  checks: { storage: true, mailProvider: true, security: true },
};

describe('MonitoringDashboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows queue and report totals when Stalwart is reachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...baseHealth,
        stalwart: {
          reachable: true,
          queue: { total: 3, hasEntries: true },
          reports: { total: 0, hasEntries: false },
        },
      }),
    })));

    renderWithQueryClient(<MonitoringDashboard />);

    await waitFor(() => expect(screen.getByText('Почтовый сервер Stalwart')).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Писем в очереди на отправку')).toBeInTheDocument();
    expect(screen.getByText('Отчётов DMARC/TLS в очереди')).toBeInTheDocument();
  });

  it('shows an unavailable message when Stalwart is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...baseHealth,
        stalwart: { reachable: false, queue: null, reports: null },
      }),
    })));

    renderWithQueryClient(<MonitoringDashboard />);

    await waitFor(() =>
      expect(screen.getByText(/Данные очереди недоступны/)).toBeInTheDocument(),
    );
  });

  it('shows an independent partial-failure state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...baseHealth,
        stalwart: { reachable: true, queue: { total: 4, hasEntries: true }, reports: null },
      }),
    })));

    renderWithQueryClient(<MonitoringDashboard />);

    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument());
    expect(screen.getByText(/Одна из проверок Stalwart/)).toBeInTheDocument();
  });

  it('does not render the Stalwart block when the field is absent (non-Stalwart provider)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => baseHealth,
    })));

    renderWithQueryClient(<MonitoringDashboard />);

    await waitFor(() => expect(screen.getByText('Общий статус')).toBeInTheDocument());
    expect(screen.queryByText('Почтовый сервер Stalwart')).not.toBeInTheDocument();
  });
});
