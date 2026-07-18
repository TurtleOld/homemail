import { describe, expect, it } from 'vitest';
import {
  buildMailListHref,
  buildMailMessageHref,
  parseMailListUrlState,
  serializeMailListUrlState,
} from '@/lib/mail-url-state';

describe('mail URL state', () => {
  it('parses validated list state and defaults to conversation view', () => {
    expect(parseMailListUrlState(new URLSearchParams('folder=inbox&q=family&filter=unread')))
      .toEqual({
        folderId: 'inbox',
        search: 'family',
        quickFilter: 'unread',
        presentation: 'conversation',
      });
  });

  it('drops unsupported filters and presentation values', () => {
    expect(parseMailListUrlState(new URLSearchParams('filter=unknown&view=split')))
      .toEqual({
        folderId: undefined,
        search: '',
        quickFilter: undefined,
        presentation: 'conversation',
      });
  });

  it('serializes only meaningful non-default state', () => {
    expect(serializeMailListUrlState({
      folderId: 'archive',
      search: '',
      presentation: 'flat',
    }).toString()).toBe('folder=archive&view=flat');
  });

  it('builds localized list and encoded reader links', () => {
    const state = { folderId: 'inbox', search: 'invoice', presentation: 'conversation' as const };
    expect(buildMailListHref('en', state)).toBe('/en/mail?folder=inbox&q=invoice');
    expect(buildMailMessageHref('ru', 'M/1+2', state))
      .toBe('/ru/mail/messages/M%2F1%2B2?folder=inbox&q=invoice');
  });
});
