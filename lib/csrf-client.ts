'use client';

// The CSRF cookie is intentionally not httpOnly (see lib/csrf-tokens.ts) so the
// client can read it and echo it back as a header — the server compares the
// two (double-submit pattern). Any client-side mutating fetch must attach this.
export function getCsrfHeader(): Record<string, string> {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]!) : '';
  return token ? { 'x-csrf-token': token } : {};
}

function isMutating(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD' && normalized !== 'OPTIONS';
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const value = input instanceof Request ? input.url : input;
    return new URL(value, window.location.href);
  } catch {
    return null;
  }
}

let installed = false;

/**
 * Install a fetch interceptor that attaches the CSRF header to every
 * same-origin mutating request.
 *
 * The app has hand-written fetch calls across many client components, so a
 * single interceptor is safer than editing each call site and missing one.
 * Mutating requests now need the token because middleware validates all of
 * them; a missed call site would start returning 403.
 */
export function installCsrfFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = requestUrl(input);

    if (!isMutating(method) || !url || url.origin !== window.location.origin) {
      return originalFetch(input, init);
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));

    const token = getCsrfHeader()['x-csrf-token'];
    if (token && !headers.has('x-csrf-token')) {
      headers.set('x-csrf-token', token);
    }

    if (input instanceof Request) {
      return originalFetch(new Request(input, { headers }), init);
    }

    return originalFetch(input, { ...init, headers });
  };
}
