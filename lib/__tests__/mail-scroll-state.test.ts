import { describe, expect, it } from 'vitest';
import { readMailScrollPosition, writeMailScrollPosition } from '@/lib/mail-scroll-state';

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
});
