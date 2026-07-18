import { describe, expect, it } from 'vitest';
import english from '@/messages/en.json';
import russian from '@/messages/ru.json';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value)
    .flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe('locale message catalogs', () => {
  it('keeps the English and Russian key trees in sync', () => {
    expect(leafKeys(english)).toEqual(leafKeys(russian));
  });
});
