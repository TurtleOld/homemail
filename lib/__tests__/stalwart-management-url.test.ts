import { describe, expect, it } from 'vitest';
import { getPublicStalwartManagementUrl } from '@/lib/stalwart-management-url';

describe('getPublicStalwartManagementUrl', () => {
  it('prefers the dedicated public management address', () => {
    expect(
      getPublicStalwartManagementUrl({
        STALWART_MANAGEMENT_PUBLIC_URL: 'https://admin.example.test',
        STALWART_PUBLIC_URL: 'https://mail.example.test',
      })
    ).toBe('https://admin.example.test/');
  });

  it('does not expose the internal Docker base URL', () => {
    expect(
      getPublicStalwartManagementUrl({
        STALWART_BASE_URL: 'http://stalwart:8080',
      })
    ).toBeNull();
  });

  it('rejects non-http management URLs', () => {
    expect(
      getPublicStalwartManagementUrl({
        STALWART_MANAGEMENT_PUBLIC_URL: 'javascript:alert(1)',
      })
    ).toBeNull();
  });
});
