import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatDate, formatExactDateTime } from '../utils';

describe('formatDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-12-20T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('должен форматировать время HH:MM для сообщений за сегодня', () => {
    const date = new Date('2024-12-20T11:59:30Z');
    expect(formatDate(date, { language: 'ru', timezone: 'UTC' })).toBe('11:59');
  });

  it('должен форматировать вчерашнюю дату как день и короткий месяц', () => {
    const date = new Date('2024-12-19T12:00:00Z');
    expect(formatDate(date, { language: 'ru', timezone: 'UTC' })).toBe('19 дек');
  });

  it('должен форматировать дату недельной давности как день и короткий месяц', () => {
    const date = new Date('2024-12-15T12:00:00Z');
    const result = formatDate(date, { language: 'ru', timezone: 'UTC' });
    expect(result).toBe('15 дек');
  });

  it('должен добавлять год для дат из прошлых лет', () => {
    const date = new Date('2023-03-14T12:00:00Z');
    const result = formatDate(date, { language: 'ru', timezone: 'UTC' });
    expect(result).toBe('14 мар 2023');
  });

  it('должен форматировать дату с учетом часового пояса', () => {
    const date = new Date('2024-12-20T10:00:00Z');
    const result = formatDate(date, {
      language: 'ru',
      timezone: 'Europe/Moscow',
    });
    expect(result).toBeTruthy();
  });

  it('должен поддерживать английский язык', () => {
    const date = new Date('2024-12-19T12:00:00Z');
    expect(formatDate(date, { language: 'en', timezone: 'UTC' })).toBe('19 Dec');
  });
});

describe('formatExactDateTime', () => {
  it('formats an exact timestamp as DD-MM-YYYY HH:MM:SS', () => {
    expect(
      formatExactDateTime('2026-07-24T12:04:05Z', { timezone: 'Europe/Moscow' })
    ).toBe('24-07-2026 15:04:05');
  });
});
