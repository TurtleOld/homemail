/**
 * Default accent used where a concrete color value is unavoidable — API
 * routes persisting a label/group color as data, and other contexts with no
 * access to CSS custom properties. Must be kept in sync with the light-mode
 * --action-primary token in app/globals.css (currently sage, 140 38% 32%).
 */
export const DEFAULT_ACCENT_HEX = '#337147';

function hslToHex(h: number, s: number, l: number): string {
  const sFrac = s / 100;
  const lFrac = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sFrac * Math.min(lFrac, 1 - lFrac);
  const f = (n: number) =>
    lFrac - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n: number) => Math.round(f(n) * 255).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

/**
 * Reads the live --action-primary token from the document (light/dark and
 * any active accent preset already resolve into this variable via
 * app/providers.tsx), so color pickers default to whatever accent the
 * member currently sees rather than a fixed color. Falls back to
 * DEFAULT_ACCENT_HEX outside the browser or if the token is unreadable.
 */
export function getActiveAccentHex(): string {
  if (typeof window === 'undefined') return DEFAULT_ACCENT_HEX;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--action-primary')
    .trim();
  const match = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) return DEFAULT_ACCENT_HEX;
  const [, h, s, l] = match.map(Number) as unknown as [never, number, number, number];
  return hslToHex(h, s, l);
}
