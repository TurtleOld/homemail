const STORAGE_PREFIX = 'homemail.mail.scroll.';

export function readMailScrollPosition(scopeKey: string, storage?: Storage): number {
  if (!storage) return 0;
  const value = Number.parseInt(storage.getItem(`${STORAGE_PREFIX}${scopeKey}`) || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function writeMailScrollPosition(scopeKey: string, index: number, storage?: Storage): void {
  if (!storage || !Number.isFinite(index) || index < 0) return;
  storage.setItem(`${STORAGE_PREFIX}${scopeKey}`, String(Math.floor(index)));
}
