import { describe, expect, it } from 'vitest';
import {
  readMailScrollOffset,
  readMailScrollPosition,
  writeMailScrollOffset,
  writeMailScrollPosition,
} from '@/lib/mail-scroll-state';

describe('mail scroll restoration', () => {
  it('stores and restores a virtual list index per scope', () => {
    const storage = window.sessionStorage;
    storage.clear();
    writeMailScrollPosition('inbox', 37, storage);
    expect(readMailScrollPosition('inbox', storage)).toBe(37);
  });

  it('fails closed for invalid values', () => {
    const storage = window.sessionStorage;
    storage.setItem('homemail.mail.scroll.search', '-8');
    expect(readMailScrollPosition('search', storage)).toBe(0);
  });

  it('stores a pixel offset for the non-virtualized conversation list', () => {
    const storage = window.sessionStorage;
    storage.clear();
    writeMailScrollOffset('inbox-conversations', 1840.75, storage);
    expect(readMailScrollOffset('inbox-conversations', storage)).toBe(1840);
  });
});
