import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;

describe('installCsrfFetch', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    document.cookie = 'csrf_token=client-token; path=/';
    mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.cookie = 'csrf_token=; Max-Age=0; path=/';
  });

  it('attaches the CSRF token to a same-origin mutating request', async () => {
    const { installCsrfFetch } = await import('../csrf-client');
    installCsrfFetch();

    await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });

    const [, init] = mockFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-csrf-token')).toBe('client-token');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('leaves safe methods untouched', async () => {
    const { installCsrfFetch } = await import('../csrf-client');
    installCsrfFetch();

    await fetch('/api/contacts');

    const [, init] = mockFetch.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(init).toBeUndefined();
  });

  it('does not send the token to another origin', async () => {
    const { installCsrfFetch } = await import('../csrf-client');
    installCsrfFetch();

    await fetch('https://other.example/api/contacts', { method: 'POST' });

    const [, init] = mockFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.has('x-csrf-token')).toBe(false);
  });

  it('keeps an explicitly provided CSRF header', async () => {
    const { installCsrfFetch } = await import('../csrf-client');
    installCsrfFetch();

    await fetch('/api/contacts', {
      method: 'DELETE',
      headers: { 'x-csrf-token': 'explicit-token' },
    });

    const [, init] = mockFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-csrf-token')).toBe('explicit-token');
  });

  it('keeps the token when a Request is passed together with init headers', async () => {
    const { installCsrfFetch } = await import('../csrf-client');
    installCsrfFetch();

    await fetch(new Request(`${window.location.origin}/api/contacts`, { method: 'POST' }), {
      headers: { 'content-type': 'application/json' },
    });

    const [, init] = mockFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-csrf-token')).toBe('client-token');
    expect(headers.get('content-type')).toBe('application/json');
  });
});
