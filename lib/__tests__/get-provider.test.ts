import { describe, expect, it, vi } from 'vitest';

vi.mock('@/providers/stalwart-jmap/stalwart-provider', () => ({
  StalwartJMAPProvider: class {},
}));

import * as providerModule from '@/lib/get-provider';

describe('mail provider selection', () => {
  it('does not expose a provider getter without an account', () => {
    expect('getMailProvider' in providerModule).toBe(false);
  });

  it('returns one cached provider per account', () => {
    const first = providerModule.getMailProviderForAccount('account-a');
    const second = providerModule.getMailProviderForAccount('account-a');
    const other = providerModule.getMailProviderForAccount('account-b');

    expect(second).toBe(first);
    expect(other).not.toBe(first);
  });
});
