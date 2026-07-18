const STORAGE_PREFIX = 'homemail.mail.scroll.';
const OFFSET_STORAGE_PREFIX = 'homemail.mail.scroll-offset.';

export function readMailScrollPosition(scopeKey: string, storage?: Storage): number {
  if (!storage) return 0;
  const value = Number.parseInt(storage.getItem(`${STORAGE_PREFIX}${scopeKey}`) || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function writeMailScrollPosition(scopeKey: string, index: number, storage?: Storage): void {
  if (!storage || !Number.isFinite(index) || index < 0) return;
  storage.setItem(`${STORAGE_PREFIX}${scopeKey}`, String(Math.floor(index)));
}

export function readMailScrollOffset(scopeKey: string, storage?: Storage): number {
  if (!storage) return 0;
  const value = Number.parseInt(storage.getItem(`${OFFSET_STORAGE_PREFIX}${scopeKey}`) || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function writeMailScrollOffset(scopeKey: string, offset: number, storage?: Storage): void {
  if (!storage || !Number.isFinite(offset) || offset < 0) return;
  storage.setItem(`${OFFSET_STORAGE_PREFIX}${scopeKey}`, String(Math.floor(offset)));
}
