import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DATE_LOCALES: Record<'ru' | 'en', string> = {
  ru: 'ru-RU',
  en: 'en-US',
};

function isSameDay(a: Date, b: Date, timezone?: string): boolean {
  const partsFor = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  return partsFor(a) === partsFor(b);
}

/**
 * Formats a message date the way Gmail/Outlook do: same-day messages show
 * a localized HH:MM time, everything else shows a localized short date
 * (day + short month name, plus year when it isn't the current year).
 */
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
  const language = options?.language || 'ru';
  const timeFormat = options?.timeFormat || '24h';
  const timezone = options?.timezone;
  const locale = DATE_LOCALES[language];

  if (isSameDay(d, now, timezone)) {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    }).format(d);
  }

  const isCurrentYear = d.getFullYear() === now.getFullYear();

  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    year: isCurrentYear ? undefined : 'numeric',
  }).formatToParts(d);

  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';

  const day = partValue('day');
  const month = partValue('month').replace(/\.$/, '');
  const year = partValue('year');

  return year ? `${day} ${month} ${year}` : `${day} ${month}`;
}

export function formatExactDateTime(
  date: Date | string,
  options?: { timezone?: string }
): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: options?.timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || '';

  return `${part('day')}-${part('month')}-${part('year')} ${part('hour')}:${part('minute')}:${part('second')}`;
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
