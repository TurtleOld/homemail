import { describe, expect, it, vi, afterEach } from 'vitest';
import { getStalwartSystemStatus } from '@/lib/stalwart-monitoring';

describe('getStalwartSystemStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns unreachable with no calls when STALWART_ADMIN_API_KEY is unset', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const status = await getStalwartSystemStatus({});

    expect(status).toEqual({ reachable: false, queue: null, reports: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads queue and report totals on a successful response', async () => {
    const fetchMock = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      void init;
      if (url.endsWith('/api/queue/messages')) {
        return { json: async () => ({ data: { total: 3 } }) };
      }
      if (url.endsWith('/api/queue/reports')) {
        return { json: async () => ({ data: { total: 0 } }) };
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const status = await getStalwartSystemStatus({
      STALWART_ADMIN_API_KEY: 'test-key',
      STALWART_BASE_URL: 'http://stalwart:8080',
    });

    expect(status).toEqual({
      reachable: true,
      queue: { total: 3, hasEntries: true },
      reports: { total: 0, hasEntries: false },
    });

    const [messagesUrl, messagesInit] = fetchMock.mock.calls[0];
    expect(messagesUrl).toBe('http://stalwart:8080/api/queue/messages');
    expect(messagesInit.headers.Authorization).toBe('Bearer test-key');
  });

  it('treats an HTTP 200 response with an error body as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ error: 'notFound' }),
    })));

    const status = await getStalwartSystemStatus({ STALWART_ADMIN_API_KEY: 'test-key' });

    expect(status).toEqual({ reachable: false, queue: null, reports: null });
  });

  it('treats a response missing a numeric total as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ data: {} }),
    })));

    const status = await getStalwartSystemStatus({ STALWART_ADMIN_API_KEY: 'test-key' });

    expect(status).toEqual({ reachable: false, queue: null, reports: null });
  });

  it('treats a network failure as unreachable rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    const status = await getStalwartSystemStatus({ STALWART_ADMIN_API_KEY: 'test-key' });

    expect(status).toEqual({ reachable: false, queue: null, reports: null });
  });

  it('preserves a successful queue read when the report read fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/queue/messages')) {
        return { json: async () => ({ data: { total: 2 } }) };
      }
      throw new Error('report endpoint unavailable');
    }));

    const status = await getStalwartSystemStatus({ STALWART_ADMIN_API_KEY: 'test-key' });

    expect(status).toEqual({
      reachable: true,
      queue: { total: 2, hasEntries: true },
      reports: null,
    });
  });

  it('defaults to http://stalwart:8080 when STALWART_BASE_URL is unset', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ json: async () => ({ data: { total: 0 } }) }));
    vi.stubGlobal('fetch', fetchMock);

    await getStalwartSystemStatus({ STALWART_ADMIN_API_KEY: 'test-key' });

    const [firstUrl] = fetchMock.mock.calls[0];
    expect(firstUrl).toBe('http://stalwart:8080/api/queue/messages');
  });
});
