import { describe, expect, it } from 'vitest';
import { getProductWorkspace, stripLocalePrefix } from '@/lib/product-workspace';

describe('product workspace routing', () => {
  it('removes only supported locale prefixes', () => {
    expect(stripLocalePrefix('/ru/settings')).toBe('/settings');
    expect(stripLocalePrefix('/en')).toBe('/');
    expect(stripLocalePrefix('/fr/settings')).toBe('/fr/settings');
  });

  it.each([
    ['/ru/mail', 'mail'],
    ['/en/mail/messages/id', 'mail'],
    ['/ru/contacts', 'contacts'],
    ['/en/settings', 'settings'],
    ['/ru/settings/stalwart', 'system'],
    ['/en/system/monitoring', 'system'],
    ['/ru/login', 'authentication'],
  ] as const)('classifies %s as %s', (pathname, workspace) => {
    expect(getProductWorkspace(pathname)).toBe(workspace);
  });
});
