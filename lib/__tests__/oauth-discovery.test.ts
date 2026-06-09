import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OAuthDiscovery } from '../oauth-discovery';

describe('OAuthDiscovery', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      STALWART_PUBLIC_URL: 'https://auth.example.test',
    };
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      issuer: 'http://5e092cd72147:8080',
      authorization_endpoint: 'http://5e092cd72147:8080/authorize/code',
      device_authorization_endpoint: 'http://5e092cd72147:8080/authorize/device',
      token_endpoint: 'http://5e092cd72147:8080/token',
      introspection_endpoint: 'http://5e092cd72147:8080/introspect',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('normalizes Docker container hostnames to STALWART_PUBLIC_URL', async () => {
    const discovery = new OAuthDiscovery('http://stalwart:8080/.well-known/oauth-authorization-server');

    const endpoints = await discovery.discover();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://stalwart:8080/.well-known/oauth-authorization-server',
      expect.any(Object)
    );
    expect(endpoints.issuer).toBe('https://auth.example.test/');
    expect(endpoints.authorization_endpoint).toBe('https://auth.example.test/authorize/code');
    expect(endpoints.device_authorization_endpoint).toBe('https://auth.example.test/authorize/device');
    expect(endpoints.token_endpoint).toBe('https://auth.example.test/token');
    expect(endpoints.introspection_endpoint).toBe('https://auth.example.test/introspect');
  });

  it('accepts authorization-code discovery without device authorization endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      issuer: 'https://auth.example.test',
      authorization_endpoint: 'https://auth.example.test/authorize/code',
      token_endpoint: 'https://auth.example.test/token',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const discovery = new OAuthDiscovery('https://auth.example.test/.well-known/oauth-authorization-server');

    const endpoints = await discovery.discover();

    expect(endpoints.authorization_endpoint).toBe('https://auth.example.test/authorize/code');
    expect(endpoints.token_endpoint).toBe('https://auth.example.test/token');
    expect(endpoints.device_authorization_endpoint).toBeUndefined();
  });

  it('uses STALWART_PUBLIC_URL as issuer fallback when discovery omits issuer', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      authorization_endpoint: 'https://auth.example.test/authorize/code',
      token_endpoint: 'https://auth.example.test/token',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const discovery = new OAuthDiscovery('http://stalwart:8080/.well-known/oauth-authorization-server');

    const endpoints = await discovery.discover();

    expect(endpoints.issuer).toBe('https://auth.example.test');
    expect(endpoints.authorization_endpoint).toBe('https://auth.example.test/authorize/code');
    expect(endpoints.token_endpoint).toBe('https://auth.example.test/token');
  });

  it('resolves relative endpoints against STALWART_PUBLIC_URL', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      issuer: '',
      authorization_endpoint: '/auth/code',
      device_authorization_endpoint: '/auth/device',
      token_endpoint: '/auth/token',
      introspection_endpoint: '/auth/introspect',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const discovery = new OAuthDiscovery('http://stalwart:8080/.well-known/oauth-authorization-server');

    const endpoints = await discovery.discover();

    expect(endpoints.issuer).toBe('https://auth.example.test');
    expect(endpoints.authorization_endpoint).toBe('https://auth.example.test/auth/code');
    expect(endpoints.device_authorization_endpoint).toBe('https://auth.example.test/auth/device');
    expect(endpoints.token_endpoint).toBe('https://auth.example.test/auth/token');
    expect(endpoints.introspection_endpoint).toBe('https://auth.example.test/auth/introspect');
  });
});
