import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(
  date: Date | string,
  options?: {
    language?: 'ru' | 'en';
    dateFormat?: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    timeFormat?: '24h' | '12h';
    timezone?: string;
  }
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const language = options?.language || 'ru';
  const dateFormat = options?.dateFormat || 'DD.MM.YYYY';
  const timeFormat = options?.timeFormat || '24h';
  const timezone = options?.timezone;

  const translations = {
    ru: {
      justNow: 'только что',
      minutesAgo: (m: number) => `${m} мин назад`,
      hoursAgo: (h: number) => `${h} ч назад`,
      yesterday: 'вчера',
      daysAgo: (d: number) => `${d} дн назад`,
    },
    en: {
      justNow: 'just now',
      minutesAgo: (m: number) => `${m} min ago`,
      hoursAgo: (h: number) => `${h} h ago`,
      yesterday: 'yesterday',
      daysAgo: (d: number) => `${d} days ago`,
    },
  };

  const t = translations[language];

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1 ? t.justNow : t.minutesAgo(minutes);
    }
    return t.hoursAgo(hours);
  }

  if (days === 1) return t.yesterday;
  if (days < 7) return t.daysAgo(days);

  const dateToFormat = timezone ? new Date(d.toLocaleString('en-US', { timeZone: timezone })) : d;
  const year = dateToFormat.getFullYear();
  const month = String(dateToFormat.getMonth() + 1).padStart(2, '0');
  const day = String(dateToFormat.getDate()).padStart(2, '0');

  let formatted: string;
  switch (dateFormat) {
    case 'DD.MM.YYYY':
      formatted = `${day}.${month}.${year}`;
      break;
    case 'MM/DD/YYYY':
      formatted = `${month}/${day}/${year}`;
      break;
    case 'YYYY-MM-DD':
      formatted = `${year}-${month}-${day}`;
      break;
    default:
      formatted = `${day}.${month}.${year}`;
  }

  if (dateToFormat.getFullYear() === now.getFullYear() && days < 365) {
    return formatted.replace(`.${year}`, '').replace(`/${year}`, '').replace(`${year}-`, '');
  }

  return formatted;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const nameEmailRegex = /^(.+?)\s*<([^\s@]+@[^\s@]+\.[^\s@]+)>$/;
  return emailRegex.test(email) || nameEmailRegex.test(email);
}

export function extractEmail(emailString: string): string | null {
  const nameEmailMatch = emailString.match(/^(.+?)\s*<([^\s@]+@[^\s@]+\.[^\s@]+)>$/);
  if (nameEmailMatch) {
    return nameEmailMatch[2]!.trim();
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const trimmed = emailString.trim();
  return emailRegex.test(trimmed) ? trimmed : null;
}

export function parseEmailList(input: string): string[] {
  const emails: string[] = [];
  const parts = input.split(',').map((e) => e.trim()).filter((e) => e.length > 0);
  
  for (const part of parts) {
    const email = extractEmail(part);
    if (email) {
      emails.push(email);
    }
  }
  
  return emails;
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
