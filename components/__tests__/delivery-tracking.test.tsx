import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DeliveryTracking } from '../delivery-tracking';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

function renderWithQueryClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('DeliveryTracking', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops polling once a 404 (no tracking record) response is received', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    renderWithQueryClient(<DeliveryTracking messageId="incoming-message-1" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // No polling for an incoming message that will never gain a tracking
    // record: only the initial fetch should ever happen.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
