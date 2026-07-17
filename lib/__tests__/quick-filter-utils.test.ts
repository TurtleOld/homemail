import { describe, expect, it } from 'vitest';
import { getQuickFilterFolderRole } from '../quick-filter-utils';

describe('getQuickFilterFolderRole', () => {
  it('maps folder-backed quick views to Stalwart roles', () => {
    expect(getQuickFilterFolderRole('incoming')).toBe('inbox');
    expect(getQuickFilterFolderRole('drafts')).toBe('drafts');
    expect(getQuickFilterFolderRole('sent')).toBe('sent');
  });

  it('does not switch folders for message-property filters', () => {
    expect(getQuickFilterFolderRole('unread')).toBeUndefined();
    expect(getQuickFilterFolderRole('starred')).toBeUndefined();
    expect(getQuickFilterFolderRole('hasAttachments')).toBeUndefined();
  });
});
