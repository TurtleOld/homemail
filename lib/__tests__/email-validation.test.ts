import { describe, it, expect } from 'vitest';
import { validateEmail, extractEmail, parseEmailList } from '../utils';

describe('validateEmail', () => {
  it('должен валидировать простой email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });

  it('должен валидировать email с именем', () => {
    expect(validateEmail('John Doe <john@example.com>')).toBe(true);
  });

  it('должен отклонять невалидные email', () => {
    expect(validateEmail('invalid-email')).toBe(false);
    expect(validateEmail('test@')).toBe(false);
    expect(validateEmail('@example.com')).toBe(false);
  });
});

describe('extractEmail', () => {
  it('должен извлекать email из строки с именем', () => {
    expect(extractEmail('John Doe <john@example.com>')).toBe('john@example.com');
  });

  it('должен возвращать email, если передан только email', () => {
    expect(extractEmail('test@example.com')).toBe('test@example.com');
  });

  it('должен возвращать null для невалидных данных', () => {
    expect(extractEmail('invalid')).toBe(null);
  });
});

describe('parseEmailList', () => {
  it('должен парсить список email через запятую', () => {
    const result = parseEmailList('test1@example.com, test2@example.com');
    expect(result).toEqual(['test1@example.com', 'test2@example.com']);
  });

  it('должен парсить email с именами', () => {
    const result = parseEmailList('John <john@example.com>, Jane <jane@example.com>');
    expect(result).toEqual(['john@example.com', 'jane@example.com']);
  });

  it('должен игнорировать пустые строки', () => {
    const result = parseEmailList('test@example.com, , another@example.com');
    expect(result).toEqual(['test@example.com', 'another@example.com']);
  });
});
