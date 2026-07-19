import { describe, expect, it } from 'vitest';
import {
  getSettingsSectionFromPathname,
  getSettingsSectionHref,
  isSettingsSectionId,
} from '@/lib/settings-routes';

describe('settings routes', () => {
  it('resolves every localized route to a stable section', () => {
    expect(getSettingsSectionFromPathname('/ru/settings/filters')).toBe('filters');
    expect(getSettingsSectionFromPathname('/en/settings/monitoring')).toBe('monitoring');
    expect(getSettingsSectionFromPathname('/en/settings')).toBeNull();
    expect(getSettingsSectionFromPathname('/en/settings/unknown')).toBeNull();
  });

  it('builds localized section links and rejects unknown ids', () => {
    expect(getSettingsSectionHref('en', 'pgp')).toBe('/en/settings/pgp');
    expect(isSettingsSectionId('subscriptions')).toBe(true);
    expect(isSettingsSectionId('admin')).toBe(false);
  });
});
