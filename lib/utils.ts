import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1 ? 'только что' : `${minutes} мин назад`;
    }
    return `${hours} ч назад`;
  }

  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн назад`;

  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function parseEmailList(input: string): string[] {
  return input
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && validateEmail(e));
}

export function generateCursor(page: number, pageSize: number): string {
  return Buffer.from(JSON.stringify({ page, pageSize })).toString('base64');
}

export function parseCursor(cursor: string): { page: number; pageSize: number } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
