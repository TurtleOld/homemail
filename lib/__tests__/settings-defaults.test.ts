import { describe, expect, it } from 'vitest';
import { getDefaultSettings, withMigrationDefaults } from '@/lib/settings-defaults';

describe('settings migration defaults', () => {
  it('uses the system theme for new accounts', () => {
    expect(getDefaultSettings().theme).toBe('system');
  });

  it('preserves existing values while filling missing nested settings', () => {
    const migrated = withMigrationDefaults({
      theme: 'dark',
      forwarding: { enabled: true, email: 'archive@example.com' },
      ui: { density: 'compact' },
    });

    expect(migrated.theme).toBe('dark');
    expect(migrated.forwarding).toEqual({
      enabled: true,
      email: 'archive@example.com',
      keepCopy: true,
    });
    expect(migrated.ui.density).toBe('compact');
    expect(migrated.ui.messagesPerPage).toBe(50);
    expect(migrated.notifications.enabled).toBe(true);
  });
});
