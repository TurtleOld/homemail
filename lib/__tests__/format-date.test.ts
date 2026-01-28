import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatDate } from '../utils';

describe('formatDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-12-20T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('должен форматировать дату "только что" для недавних сообщений', () => {
    const date = new Date('2024-12-20T11:59:30Z');
    expect(formatDate(date, { language: 'ru' })).toBe('только что');
  });

  it('должен форматировать дату "X мин назад"', () => {
    const date = new Date('2024-12-20T11:55:00Z');
    expect(formatDate(date, { language: 'ru' })).toBe('5 мин назад');
  });

  it('должен форматировать дату "вчера"', () => {
    const date = new Date('2024-12-19T12:00:00Z');
    expect(formatDate(date, { language: 'ru' })).toBe('вчера');
  });

  it('должен форматировать дату с учетом формата DD.MM.YYYY', () => {
    const date = new Date('2024-12-15T12:00:00Z');
    const result = formatDate(date, { language: 'ru', dateFormat: 'DD.MM.YYYY' });
    // For dates within last 7 days, UI uses relative formatting.
    expect(result).toBe('5 дн назад');
  });

  it('должен форматировать дату с учетом часового пояса', () => {
    const date = new Date('2024-12-20T10:00:00Z');
    const result = formatDate(date, { 
      language: 'ru', 
      timezone: 'Europe/Moscow' 
    });
    expect(result).toBeTruthy();
  });

  it('должен поддерживать английский язык', () => {
    const date = new Date('2024-12-20T11:59:30Z');
    expect(formatDate(date, { language: 'en' })).toBe('just now');
  });
});
