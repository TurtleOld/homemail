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

  it('renders the general monitoring sections without a Stalwart queue block', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => baseHealth,
    })));

    renderWithQueryClient(<MonitoringDashboard />);

    await waitFor(() => expect(screen.getByText('Общий статус')).toBeInTheDocument());
    expect(screen.getByText('Проверки системы')).toBeInTheDocument();
    expect(screen.getByText('Безопасность за 24 часа')).toBeInTheDocument();
    expect(screen.queryByText('Почтовый сервер Stalwart')).not.toBeInTheDocument();
  });
});
