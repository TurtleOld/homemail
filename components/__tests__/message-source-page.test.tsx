import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import MessageSourcePage from '@/app/[locale]/mail/messages/[messageId]/source/page';

const routerPush = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', messageId: 'message-1' }),
  useRouter: () => ({ push: routerPush }),
}));

const translations: Record<string, string> = {
  returnToMessage: 'Return to message',
  loading: 'Loading message source…',
  loadError: "The message source couldn't be loaded",
  retry: 'Retry',
  diagnosticsLabel: 'Diagnostic summary',
  diagnosticsUnavailable: "The diagnostic summary couldn't be loaded",
  from: 'From:',
  to: 'To:',
  cc: 'Cc:',
  subject: 'Subject:',
  noSubject: '(no subject)',
  messageId: 'Message-ID:',
  unavailableValue: 'Unavailable',
  'authStatus.pass': 'Pass',
  'authStatus.fail': 'Fail',
  'authStatus.neutral': 'Neutral',
  'authStatus.softfail': 'Soft fail',
  'authStatus.temperror': 'Temporary error',
  'authStatus.permerror': 'Permanent error',
  'authStatus.none': 'None',
  'authStatus.unavailable': 'Unavailable',
  enableWrap: 'Wrap lines',
  disableWrap: 'Unwrap lines',
  copy: 'Copy to clipboard',
  copied: 'Source copied to clipboard',
  copyFailed: "Couldn't copy the source",
  download: 'Download .eml',
  oversized: 'This message is {size} — larger than the {limit} preview limit. It remains available for exact download.',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const value = translations[key] ?? key;
    if (!values) return value;
    return Object.entries(values).reduce(
      (acc, [token, tokenValue]) => acc.replace(`{${token}}`, String(tokenValue)),
      value
    );
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const RAW_SOURCE = 'From: sender@example.test\r\nSubject: <script>alert(1)</script>\r\n\r\nBody & text.';

const diagnosticsPayload = {
  size: RAW_SOURCE.length,
  diagnostics: {
    from: { email: 'sender@example.test', name: 'Sender' },
    to: [{ email: 'recipient@example.test' }],
    subject: '<script>alert(1)</script>',
    messageId: '<abc@example.test>',
    spf: { status: 'pass', domain: 'example.test' },
    dkim: { status: 'unavailable' },
    dmarc: { status: 'fail', domain: 'example.test' },
  },
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function rfc822Response(text: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'message/rfc822' : null) },
    json: async () => ({}),
    text: async () => text,
  };
}

function mockFetchDefault() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/source/diagnostics')) {
      return jsonResponse(diagnosticsPayload);
    }
    if (url.includes('/source')) {
      return rfc822Response(RAW_SOURCE);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MessageSourcePage />
    </QueryClientProvider>
  );
}

describe('Message source page', () => {
  beforeEach(() => {
    routerPush.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the diagnostic summary and renders the source as escaped plain text', async () => {
    vi.stubGlobal('fetch', mockFetchDefault());

    renderPage();

    await waitFor(() => expect(screen.getByText('Sender <sender@example.test>')).toBeInTheDocument());
    expect(screen.getByText('<abc@example.test>')).toBeInTheDocument();

    const pre = document.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toBe(RAW_SOURCE);
    expect(pre?.querySelector('script')).toBeNull();
    expect(document.querySelector('script[data-testid]')).toBeNull();
  });

  it('wraps lines by default and toggles to an unwrapped, horizontally scrollable view', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetchDefault());
    renderPage();

    await waitFor(() => expect(document.querySelector('pre')).not.toBeNull());
    expect(document.querySelector('pre')!.className).toMatch(/whitespace-pre-wrap/);

    await user.click(screen.getByRole('button', { name: 'Unwrap lines' }));

    expect(document.querySelector('pre')!.className).toMatch(/whitespace-pre(?!-wrap)/);
    expect(screen.getByRole('button', { name: 'Wrap lines' })).toBeInTheDocument();
  });

  it('copies only the source text, not the diagnostic summary', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetchDefault());
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderPage();
    await waitFor(() => expect(document.querySelector('pre')).not.toBeNull());

    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }));

    expect(writeText).toHaveBeenCalledWith(RAW_SOURCE);
  });

  it('offers an exact-download link independent of inline viewing', async () => {
    vi.stubGlobal('fetch', mockFetchDefault());
    renderPage();

    await waitFor(() => expect(document.querySelector('pre')).not.toBeNull());

    const downloadLink = screen.getByRole('link', { name: /Download \.eml/ });
    expect(downloadLink).toHaveAttribute('href', '/api/mail/messages/message-1/source?download=1');
  });

  it('shows a dedicated oversized state with a download action instead of a truncated source', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/source/diagnostics')) return jsonResponse(diagnosticsPayload);
        return jsonResponse({ oversized: true, size: 11 * 1024 * 1024, limit: 10 * 1024 * 1024 });
      })
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByRole('link', { name: /Download \.eml/ }).length).toBeGreaterThan(0));
    expect(document.querySelector('pre')).toBeNull();
    expect(screen.getByText(/larger than/)).toBeInTheDocument();
  });

  it('lets the user retry after a failed source request', async () => {
    let sourceCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/source/diagnostics')) return jsonResponse(diagnosticsPayload);
        sourceCalls += 1;
        if (sourceCalls === 1) return jsonResponse({ error: 'Failed to retrieve message source' }, 502);
        return rfc822Response(RAW_SOURCE);
      })
    );
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => expect(screen.getByText("The message source couldn't be loaded")).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(document.querySelector('pre')).not.toBeNull());
    expect(sourceCalls).toBe(2);
  });

  it('closes a script-opened tab when returning to the message', async () => {
    vi.stubGlobal('fetch', mockFetchDefault());
    const closeSpy = vi.fn();
    vi.stubGlobal('opener', { closed: false } as unknown as Window);
    Object.defineProperty(window, 'close', { value: closeSpy, writable: true });

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(document.querySelector('pre')).not.toBeNull());

    await user.click(screen.getByRole('button', { name: 'Return to message' }));

    expect(closeSpy).toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('navigates to a validated internal message URL when there is no opener to close', async () => {
    vi.stubGlobal('fetch', mockFetchDefault());
    vi.stubGlobal('opener', null as unknown as Window);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(document.querySelector('pre')).not.toBeNull());

    await user.click(screen.getByRole('button', { name: 'Return to message' }));

    expect(routerPush).toHaveBeenCalledWith('/en/mail/messages/message-1');
  });
});
