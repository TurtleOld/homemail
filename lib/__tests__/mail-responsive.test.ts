import { describe, expect, it } from 'vitest';
import { getMailViewport } from '../mail-responsive';

describe('getMailViewport', () => {
  it.each([
    [375, 'mobile'],
    [767, 'mobile'],
    [768, 'tablet'],
    [1023, 'tablet'],
    [1024, 'desktop'],
    [1440, 'desktop'],
  ] as const)('maps %ipx to %s', (width, viewport) => {
    expect(getMailViewport(width)).toBe(viewport);
  });
});
